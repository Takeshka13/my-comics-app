import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Modal, TextInput, Alert, ScrollView, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import Barcode from 'react-native-barcode-svg';
import { supabase } from '../lib/supabase';

export default function CatalogScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const [titles, setTitles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [author, setAuthor] = useState('');
  const [publisher, setPublisher] = useState('');
  const [series, setSeries] = useState('');
  const [volume, setVolume] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [depth, setDepth] = useState('');
  const [cover, setCover] = useState('');
  const [isbn, setIsbn] = useState('');

  const [manageModalVisible, setManageModalVisible] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<any>(null);
  const [titleCopies, setTitleCopies] = useState<any[]>([]);
  const [suggesting, setSuggesting] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editTitleId, setEditTitleId] = useState('');
  const [editName, setEditName] = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const [editPublisher, setEditPublisher] = useState('');
  const [editSeries, setEditSeries] = useState('');
  const [editVolume, setEditVolume] = useState('');
  const [editIsbn, setEditIsbn] = useState('');
  const [editWidth, setEditWidth] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const [editDepth, setEditDepth] = useState('');

  const [targetTitleId, setTargetTitleId] = useState<string | null>(null);

  const fetchTitles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('titles')
      .select(`*, copies ( id, width_mm, height_mm, depth_mm, level_id )`)
      .order('created_at', { ascending: false });
      
    if (!error) setTitles(data || []);
    setLoading(false);
  };

  const totalPhysicalCopies = titles.reduce((sum, title) => sum + (title.copies?.length || 0), 0);

  useFocusEffect(
    React.useCallback(() => {
      fetchTitles();
      
      if (route.params?.scannedData) {
        const data = route.params.scannedData;
        setName(data.name || '');
        setAuthor(data.author || '');
        setPublisher(data.publisher || '');
        setSeries(data.series || '');
        setCover(data.cover || '');
        setIsbn(data.isbn || '');
        
        if (data.volume) setVolume(data.volume.toString());
        if (data.width) setWidth(data.width.toString());
        if (data.height) setHeight(data.height.toString());
        if (data.depth) setDepth(data.depth.toString());

        setModalVisible(true);
        navigation.setParams({ scannedData: null });
      }

      if (route.params?.openTitleId) {
        setTargetTitleId(route.params.openTitleId);
        // Параметр НЕ стираем здесь, чтобы он дожил до загрузки данных
      }
    }, [route.params, navigation])
  );

  // Открываем модалку, когда список загрузился
  React.useEffect(() => {
    if (targetTitleId && titles.length > 0) {
      const found = titles.find(t => t.id === targetTitleId);
      if (found) {
        openManageModal(found);
        // Стираем параметр только после успешного открытия
        navigation.setParams({ openTitleId: null });
      }
      setTargetTitleId(null);
    }
  }, [targetTitleId, titles, navigation]);

  const handleAddTitle = async () => {
    if (!name.trim() || !width || !height) {
      Alert.alert('Ошибка', 'Заполните название и размеры (толщину и высоту)');
      return;
    }

    const { data: titleData, error: titleError } = await supabase
      .from('titles')
      .insert([{ 
        name, author: author || null, publisher: publisher || null, series: series || null, 
        volume: volume ? parseInt(volume) : null, isbn: isbn || null, cover_url: cover || null,
        default_width_mm: parseInt(width), default_height_mm: parseInt(height), default_depth_mm: depth ? parseInt(depth) : parseInt(width)
      }]).select().single();

    if (titleError) return Alert.alert('Ошибка базы', titleError.message);

    const { error: copyError } = await supabase
      .from('copies')
      .insert([{ title_id: titleData.id, width_mm: parseInt(width), height_mm: parseInt(height), depth_mm: depth ? parseInt(depth) : parseInt(width), status: 'storage' }]);

    if (copyError) {
      Alert.alert('Ошибка экземпляра', copyError.message);
    } else {
      setName(''); setAuthor(''); setPublisher(''); setSeries(''); setVolume(''); setWidth(''); setHeight(''); setDepth(''); setCover(''); setIsbn('');
      setModalVisible(false);
      fetchTitles();
    }
  };

  const openManageModal = async (title: any) => {
    setSelectedTitle(title);
    setManageModalVisible(true);
    
    const { data } = await supabase
      .from('copies')
      .select(`
        id, width_mm, level_id,
        levels (
          id, position,
          shelves ( id, name )
        )
      `)
      .eq('title_id', title.id);
      
    setTitleCopies(data || []);
  };

  const addCopyToTitle = async () => {
    if (!selectedTitle) return;
    const { error } = await supabase.from('copies').insert([{
      title_id: selectedTitle.id, width_mm: selectedTitle.default_width_mm || 15,
      height_mm: selectedTitle.default_height_mm || 250, depth_mm: selectedTitle.default_depth_mm || 15, status: 'storage'
    }]);
    if (!error) {
      const { data } = await supabase.from('copies').select('*').eq('title_id', selectedTitle.id).order('created_at');
      setTitleCopies(data || []);
      fetchTitles();
    }
  };

  const removeCopy = async () => {
    if (!selectedTitle || titleCopies.length === 0) return Alert.alert('Внимание', 'Уже 0 экземпляров.');
    const copyToRemove = titleCopies[titleCopies.length - 1];
    if (copyToRemove.level_id) await supabase.from('copies').update({ level_id: null }).eq('id', copyToRemove.id);
    await supabase.from('copies').delete().eq('id', copyToRemove.id);
    const { data } = await supabase.from('copies').select('*').eq('title_id', selectedTitle.id);
    setTitleCopies(data || []);
    fetchTitles();
  };

  const openEditModal = () => {
    if (!selectedTitle) return;
    setEditTitleId(selectedTitle.id);
    setEditName(selectedTitle.name || '');
    setEditAuthor(selectedTitle.author || '');
    setEditPublisher(selectedTitle.publisher || '');
    setEditSeries(selectedTitle.series || '');
    setEditVolume(selectedTitle.volume?.toString() || '');
    setEditIsbn(selectedTitle.isbn || '');
    setEditWidth(selectedTitle.default_width_mm?.toString() || '');
    setEditHeight(selectedTitle.default_height_mm?.toString() || '');
    setEditDepth(selectedTitle.default_depth_mm?.toString() || '');
    setManageModalVisible(false);
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim() || !editTitleId) return Alert.alert("Ошибка", "Название не может быть пустым");

    const { error } = await supabase.from('titles').update({
      name: editName, author: editAuthor || null, publisher: editPublisher || null, series: editSeries || null,
      volume: editVolume ? parseInt(editVolume) : null, isbn: editIsbn || null,
      default_width_mm: editWidth ? parseInt(editWidth) : null, default_height_mm: editHeight ? parseInt(editHeight) : null,
      default_depth_mm: editDepth ? parseInt(editDepth) : null,
    }).eq('id', editTitleId);

    if (error) {
      Alert.alert("Ошибка базы", error.message);
    } else {
      if (editWidth || editHeight) {
         await supabase.from('copies').update({
            width_mm: editWidth ? parseInt(editWidth) : undefined, height_mm: editHeight ? parseInt(editHeight) : undefined,
            depth_mm: editDepth ? parseInt(editDepth) : undefined,
         }).eq('title_id', editTitleId);
      }
      setEditModalVisible(false);
      fetchTitles();
      Alert.alert("Успех", "Данные обновлены");
    }
  };

  const deleteTitleEntirely = () => {
    if (!selectedTitle) return;
    Alert.alert("Удалить навсегда?", "Книга и ВСЕ её экземпляры исчезнут из базы.", [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: async () => {
          await supabase.from('copies').delete().eq('title_id', selectedTitle.id);
          const { error } = await supabase.from('titles').delete().eq('id', selectedTitle.id);
          if (error) Alert.alert("Ошибка удаления", error.message);
          else { setManageModalVisible(false); fetchTitles(); }
      }}
    ]);
  };

  const handleSuggestFromCatalog = async () => {
    const copyToPlace = titleCopies.find(c => !c.level_id);
    if (!copyToPlace) return Alert.alert("Ошибка", "Нет свободных экземпляров на складе");
    setSuggesting(true);
    const series = selectedTitle.series; const publisher = selectedTitle.publisher; let targetLevel = null;

    if (series) {
      const { data } = await supabase.from('copies').select(`level_id, levels ( id, position, shelves ( name ) ), titles!inner ( series )`).ilike('titles.series', `%${series.split(';')[0].trim()}%`).not('level_id', 'is', null).limit(1);
      if (data && data.length > 0) targetLevel = data[0].levels as any;
    }

    if (!targetLevel && publisher) {
      const publisherParts = publisher.split(';').map((p: string) => p.trim());
      for (const part of publisherParts) {
        if (part.length < 3) continue;
        const { data } = await supabase.from('copies').select(`level_id, levels ( id, position, shelves ( name ) ), titles!inner ( publisher )`).ilike('titles.publisher', `%${part}%`).not('level_id', 'is', null).limit(1);
        if (data && data.length > 0) { targetLevel = data[0].levels as any; break; }
      }
    }

    setSuggesting(false);

    if (targetLevel) {
      Alert.alert("Рекомендация", `Найдено место: ${targetLevel.shelves.name}, Полка №${targetLevel.position}.\n\nПоставить туда?`, [
        { text: "Отмена", style: "cancel" },
        { text: "Поставить", onPress: async () => {
            await supabase.from('copies').update({ level_id: targetLevel.id, status: 'on_shelf' }).eq('id', copyToPlace.id);
            setManageModalVisible(false); fetchTitles();
        }}
      ]);
    } else Alert.alert("Рекомендация", "Подходящих полок не найдено.");
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
      
      <View style={styles.headerContainer}>
        <Text style={styles.title}>Каталог</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{titles.length} наим.</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: '#34C759' }]}>
          <Text style={styles.badgeText}>{totalPhysicalCopies} шт.</Text>
        </View>
      </View>

      {loading ? <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 50 }} /> : (
        <FlatList
          data={titles} keyExtractor={(item) => item.id} contentContainerStyle={{ paddingBottom: insets.bottom + 80 }} showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 50, color: '#888' }}>В каталоге пока пусто</Text>}
          renderItem={({ item }) => {
            const totalCopies = item.copies?.length || 0;
            const onShelf = item.copies?.filter((c: any) => c.level_id).length || 0;
            return (
              <TouchableOpacity style={styles.card} onPress={() => openManageModal(item)}>
                {item.cover_url ? <Image source={{ uri: item.cover_url }} style={styles.coverImage} resizeMode="cover" /> : <View style={[styles.coverImage, styles.noCover]}><Ionicons name="book" size={24} color="#ccc" /></View>}
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.cardTitle}>{item.name} {item.volume ? `(Том ${item.volume})` : ''}</Text>
                  <Text style={styles.cardSubtitle} numberOfLines={1}>{item.author ? `${item.author} | ` : ''}{item.publisher || 'Без издательства'}</Text>
                  <Text style={styles.cardStats}>Всего: {totalCopies} | На полках: {onShelf} | На складе: {totalCopies - onShelf}</Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color="#ccc" />
              </TouchableOpacity>
            );
          }}
        />
      )}

      <TouchableOpacity style={[styles.fab, { right: 20, bottom: Math.max(insets.bottom, 16) }]} onPress={() => { setName(''); setAuthor(''); setPublisher(''); setSeries(''); setVolume(''); setWidth(''); setHeight(''); setDepth(''); setCover(''); setIsbn(''); setModalVisible(true); }}>
        <Ionicons name="add" size={30} color="white" />
      </TouchableOpacity>

      <TouchableOpacity style={[styles.fab, { left: 20, bottom: Math.max(insets.bottom, 16), backgroundColor: '#34C759' }]} onPress={() => navigation.navigate('Scanner')}>
        <Ionicons name="barcode-outline" size={30} color="white" />
      </TouchableOpacity>

      {/* Модалка создания */}
      <Modal visible={modalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Новый комикс</Text>
              {cover ? <Image source={{ uri: cover }} style={{ width: 80, height: 120, alignSelf: 'center', marginBottom: 12, borderRadius: 6 }} resizeMode="cover" /> : null}
              <Text style={styles.inputLabel}>Название *</Text>
              <TextInput style={styles.input} placeholder="Например: Ван-Пис" value={name} onChangeText={setName} />
              <Text style={styles.inputLabel}>Автор</Text>
              <TextInput style={styles.input} placeholder="Эйитиро Ода" value={author} onChangeText={setAuthor} />
              <Text style={styles.inputLabel}>Издательство</Text>
              <TextInput style={styles.input} placeholder="Азбука" value={publisher} onChangeText={setPublisher} />
              <Text style={styles.inputLabel}>Серия</Text>
              <TextInput style={styles.input} placeholder="Ван-Пис" value={series} onChangeText={setSeries} />
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}><Text style={styles.inputLabel}>Номер тома</Text><TextInput style={styles.input} placeholder="1" keyboardType="numeric" value={volume} onChangeText={setVolume} /></View>
                <View style={{ flex: 1 }}><Text style={styles.inputLabel}>ISBN (штрихкод)</Text><TextInput style={styles.input} placeholder="978-..." keyboardType="numeric" value={isbn} onChangeText={setIsbn} /></View>
              </View>
              <Text style={styles.sectionTitle}>Размеры (мм)</Text>
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}><Text style={styles.inputLabel}>Толщина *</Text><TextInput style={styles.input} placeholder="15" keyboardType="numeric" value={width} onChangeText={setWidth} /></View>
                <View style={{ flex: 1 }}><Text style={styles.inputLabel}>Высота *</Text><TextInput style={styles.input} placeholder="250" keyboardType="numeric" value={height} onChangeText={setHeight} /></View>
              </View>
              <Text style={styles.inputLabel}>Глубина (необязательно)</Text>
              <TextInput style={styles.input} placeholder="15" keyboardType="numeric" value={depth} onChangeText={setDepth} />
              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#ccc' }]} onPress={() => setModalVisible(false)}><Text>Отмена</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#007AFF' }]} onPress={handleAddTitle}><Text style={{ color: 'white', fontWeight: 'bold' }}>Сохранить</Text></TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Карточка книги */}
      <Modal visible={manageModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              {selectedTitle?.cover_url ? <Image source={{ uri: selectedTitle.cover_url }} style={{ width: 70, height: 105, borderRadius: 6, marginRight: 12 }} /> : null}
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { marginBottom: 4 }]} numberOfLines={2}>{selectedTitle?.name}</Text>
                <Text style={{ fontSize: 14, color: '#666' }}>{selectedTitle?.author || 'Автор не указан'}</Text>
                <Text style={{ fontSize: 14, color: '#666' }}>{selectedTitle?.publisher}</Text>
              </View>
              <TouchableOpacity style={{ padding: 8 }} onPress={openEditModal}>
                <Ionicons name="pencil" size={24} color="#007AFF" />
              </TouchableOpacity>
            </View>

            {selectedTitle?.isbn && (
              <View style={{ alignItems: 'center', marginBottom: 16, backgroundColor: '#fff', padding: 10, borderRadius: 8 }}>
                <Barcode value={selectedTitle.isbn} format="EAN13" singleBarWidth={2} height={60} lineColor="#000" backgroundColor="#fff" />
                <Text style={{ marginTop: 8, fontSize: 14, letterSpacing: 2 }}>{selectedTitle.isbn}</Text>
              </View>
            )}
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, gap: 10 }}>
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#ffeaea' }]} onPress={removeCopy}>
                <Ionicons name="remove-circle" size={32} color="#e74c3c" />
                <Text style={[styles.actionText, { color: '#e74c3c' }]}>Убрать</Text>
              </TouchableOpacity>

              <View style={[styles.actionButton, { backgroundColor: 'transparent', elevation: 0 }]}>
                <Text style={{ fontSize: 40, fontWeight: 'bold', color: '#333' }}>{titleCopies.length}</Text>
                <Text style={{ fontSize: 12, color: '#666' }}>В наличии</Text>
              </View>

              <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#eafaf1' }]} onPress={addCopyToTitle}>
                <Ionicons name="add-circle" size={32} color="#34C759" />
                <Text style={[styles.actionText, { color: '#34C759' }]}>Добавить</Text>
              </TouchableOpacity>
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, color: '#666', textAlign: 'center' }}>
                На полках: {titleCopies.filter(c => c.level_id).length} | На складе: {titleCopies.filter(c => !c.level_id).length}
              </Text>
            </View>

            {titleCopies.some(c => c.level_id) && (
              <TouchableOpacity 
                style={[styles.menuButton, { backgroundColor: '#e3f2fd' }]} 
                onPress={() => {
                  const locations: { [key: string]: number } = {};
                  titleCopies.forEach(c => {
                    if (c.levels) {
                      const key = `${c.levels.shelves.name} | Полка №${c.levels.position}`;
                      locations[key] = (locations[key] || 0) + 1;
                    }
                  });

                  const message = Object.entries(locations)
                    .map(([loc, count]) => `• ${loc} (${count} шт.)`)
                    .join('\n');

                  Alert.alert("Где лежит книга", message || "На полках нет экземпляров");
                }}
              >
                <Ionicons name="location" size={24} color="#007AFF" />
                <Text style={[styles.menuText, { color: '#007AFF' }]}>Где лежит книга</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.menuButton, { backgroundColor: '#fff5e6' }]} onPress={handleSuggestFromCatalog} disabled={suggesting}>
              <Ionicons name="sparkles" size={24} color="#f39c12" />
              <Text style={[styles.menuText, { color: '#f39c12' }]}>{suggesting ? 'Ищем...' : 'Подсказать место'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.menuButton, { backgroundColor: '#ffeaea' }]} onPress={deleteTitleEntirely}>
              <Ionicons name="trash" size={24} color="#e74c3c" />
              <Text style={[styles.menuText, { color: '#e74c3c' }]}>Удалить из базы</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#ccc', width: '100%', marginTop: 10 }]} onPress={() => setManageModalVisible(false)}>
              <Text style={{ fontWeight: 'bold' }}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Модалка редактирования */}
      <Modal visible={editModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Редактировать книгу</Text>
              <Text style={styles.inputLabel}>Название *</Text>
              <TextInput style={styles.input} value={editName} onChangeText={setEditName} />
              <Text style={styles.inputLabel}>Автор</Text>
              <TextInput style={styles.input} value={editAuthor} onChangeText={setEditAuthor} />
              <Text style={styles.inputLabel}>Издательство</Text>
              <TextInput style={styles.input} value={editPublisher} onChangeText={setEditPublisher} />
              <Text style={styles.inputLabel}>Серия</Text>
              <TextInput style={styles.input} value={editSeries} onChangeText={setEditSeries} />
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}><Text style={styles.inputLabel}>Номер тома</Text><TextInput style={styles.input} keyboardType="numeric" value={editVolume} onChangeText={setEditVolume} /></View>
                <View style={{ flex: 1 }}><Text style={styles.inputLabel}>ISBN</Text><TextInput style={styles.input} keyboardType="numeric" value={editIsbn} onChangeText={setEditIsbn} /></View>
              </View>
              <Text style={styles.sectionTitle}>Размеры (мм)</Text>
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}><Text style={styles.inputLabel}>Толщина</Text><TextInput style={styles.input} keyboardType="numeric" value={editWidth} onChangeText={setEditWidth} /></View>
                <View style={{ flex: 1 }}><Text style={styles.inputLabel}>Высота</Text><TextInput style={styles.input} keyboardType="numeric" value={editHeight} onChangeText={setEditHeight} /></View>
              </View>
              <Text style={styles.inputLabel}>Глубина</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={editDepth} onChangeText={setEditDepth} />
              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#ccc' }]} onPress={() => setEditModalVisible(false)}><Text>Отмена</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#007AFF' }]} onPress={handleSaveEdit}><Text style={{ color: 'white', fontWeight: 'bold' }}>Сохранить</Text></TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', paddingHorizontal: 16 },
  headerContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  badge: { backgroundColor: '#007AFF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginLeft: 10 },
  badgeText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 12, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#ddd' },
  coverImage: { width: 50, height: 75, borderRadius: 6, backgroundColor: '#eee' },
  noCover: { justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  cardSubtitle: { fontSize: 14, color: '#666', marginTop: 2 },
  cardStats: { fontSize: 12, color: '#007AFF', marginTop: 6, fontWeight: 'bold' },
  fab: { position: 'absolute', backgroundColor: '#007AFF', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', padding: 20, borderRadius: 12, maxHeight: '85%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#007AFF', marginBottom: 8, marginTop: 8 },
  inputLabel: { fontSize: 12, color: '#888', marginBottom: 4, marginLeft: 4 },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, fontSize: 16, marginBottom: 12, color: '#333' },
  row: { flexDirection: 'row' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 10 },
  modalBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  
  actionButton: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 12 },
  actionText: { fontSize: 12, fontWeight: 'bold', marginTop: 4 },
  menuButton: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 10 },
  menuText: { fontSize: 16, fontWeight: 'bold', marginLeft: 12 }
});