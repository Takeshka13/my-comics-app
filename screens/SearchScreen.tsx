import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, ActivityIndicator, Image, Modal, ScrollView, Alert, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Barcode from 'react-native-barcode-svg';
import { supabase } from '../lib/supabase';

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Состояния для модалки управления
  const [manageModalVisible, setManageModalVisible] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<any>(null);
  const [titleCopies, setTitleCopies] = useState<any[]>([]);
  const [suggesting, setSuggesting] = useState(false);

  // Состояния для редактирования
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

  const handleSearch = async (text: string) => {
    setQuery(text);
    if (text.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('titles')
      .select(`
        id, name, author, publisher, series, volume, cover_url, isbn,
        default_width_mm, default_height_mm, default_depth_mm,
        copies (
          id, level_id,
          levels (
            id, position, shelf_id,
            shelves ( id, name )
          )
        )
      `)
      .ilike('name', `%${text}%`);

    if (!error) setResults(data || []);
    setLoading(false);
  };

  // --- ЛОГИКА УПРАВЛЕНИЯ (как в Каталоге) ---

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
      handleSearch(query); // Обновляем поиск
    }
  };

  const removeCopy = async () => {
    if (!selectedTitle || titleCopies.length === 0) return Alert.alert('Внимание', 'Уже 0 экземпляров.');
    const copyToRemove = titleCopies[titleCopies.length - 1];
    if (copyToRemove.level_id) await supabase.from('copies').update({ level_id: null }).eq('id', copyToRemove.id);
    await supabase.from('copies').delete().eq('id', copyToRemove.id);
    const { data } = await supabase.from('copies').select('*').eq('title_id', selectedTitle.id);
    setTitleCopies(data || []);
    handleSearch(query); // Обновляем поиск
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
      handleSearch(query);
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
          else { setManageModalVisible(false); handleSearch(query); }
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
            setManageModalVisible(false); handleSearch(query);
        }}
      ]);
    } else Alert.alert("Рекомендация", "Подходящих полок не найдено.");
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
      <Text style={styles.title}>Поиск</Text>
      
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color="#888" style={{ marginRight: 8 }} />
        <TextInput 
          style={styles.input}
          placeholder="Введите название..."
          value={query}
          onChangeText={handleSearch}
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => handleSearch('')}>
            <Ionicons name="close-circle" size={20} color="#888" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            query.length > 1 ? (
              <Text style={{ textAlign: 'center', marginTop: 50, color: '#888' }}>Ничего не найдено</Text>
            ) : (
              <View />
            )
          }
          renderItem={({ item }) => {
            const locations: { [key: string]: { count: number, levelId: string, shelfName: string } } = {};
            let storageCount = 0;

            item.copies.forEach((copy: any) => {
              if (copy.levels) {
                const shelfName = copy.levels.shelves?.name || 'Стеллаж';
                const levelPos = copy.levels.position;
                const key = `${shelfName} | Полка ${levelPos}`;
                
                if (!locations[key]) {
                  locations[key] = { count: 0, levelId: copy.levels.id, shelfName: copy.levels.shelves?.name };
                }
                locations[key].count++;
              } else {
                storageCount++;
              }
            });

            return (
              // НАЖАТИЕ ОТКРЫВАЕТ МОДАЛКУ
              <TouchableOpacity style={styles.card} onPress={() => openManageModal(item)}>
                <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                  {item.cover_url ? (
                    <Image source={{ uri: item.cover_url }} style={styles.coverImage} resizeMode="cover" />
                  ) : (
                    <View style={[styles.coverImage, styles.noCover]}>
                      <Ionicons name="book" size={24} color="#ccc" />
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.cardTitle}>{item.name} {item.volume ? `(Том ${item.volume})` : ''}</Text>
                    <Text style={styles.cardSubtitle}>{item.author || 'Автор не указан'}</Text>
                    <Text style={styles.cardSubtitle}>{item.publisher || 'Без издательства'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#ccc" style={{ alignSelf: 'center' }} />
                </View>
                
                <View style={styles.locationBox}>
                  {Object.entries(locations).map(([loc, data], idx) => (
                    <TouchableOpacity 
                      key={idx} 
                      style={styles.locationRow}
                      onPress={(e) => {
                        e.stopPropagation(); 
                        navigation.navigate('Level', { levelId: data.levelId, levelName: loc });
                      }}
                    >
                      <Ionicons name="location" size={16} color="#007AFF" />
                      <Text style={styles.locationText}>{loc}: {data.count} шт.</Text>
                      <Ionicons name="chevron-forward" size={16} color="#ccc" />
                    </TouchableOpacity>
                  ))}
                  {storageCount > 0 && (
                    <View style={styles.locationRow}>
                      <Ionicons name="archive" size={16} color="#f39c12" />
                      <Text style={[styles.locationText, { color: '#f39c12' }]}>На складе: {storageCount} шт.</Text>
                    </View>
                  )}
                  {item.copies.length === 0 && (
                    <Text style={{ color: '#e74c3c', fontSize: 12 }}>Нет в наличии (0 шт.)</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* КАРТОЧКА КНИГИ (МОДАЛКА) */}
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
                  const message = Object.entries(locations).map(([loc, count]) => `• ${loc} (${count} шт.)`).join('\n');
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

      {/* МОДАЛКА РЕДАКТИРОВАНИЯ */}
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
  title: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 16 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#ddd', marginBottom: 16 },
  input: { flex: 1, fontSize: 16, color: '#333' },
  card: { backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#ddd' },
  coverImage: { width: 50, height: 75, borderRadius: 6, backgroundColor: '#eee' },
  noCover: { justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  cardSubtitle: { fontSize: 14, color: '#666', marginTop: 2 },
  locationBox: { backgroundColor: '#f9f9f9', padding: 10, borderRadius: 8 },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, backgroundColor: 'white', padding: 8, borderRadius: 6 },
  locationText: { fontSize: 14, color: '#007AFF', marginLeft: 6, fontWeight: '500', flex: 1 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', padding: 20, borderRadius: 12, maxHeight: '85%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#007AFF', marginBottom: 8, marginTop: 8 },
  inputLabel: { fontSize: 12, color: '#888', marginBottom: 4, marginLeft: 4 },
  row: { flexDirection: 'row' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 10 },
  modalBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  actionButton: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 12 },
  actionText: { fontSize: 12, fontWeight: 'bold', marginTop: 4 },
  menuButton: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 10 },
  menuText: { fontSize: 16, fontWeight: 'bold', marginLeft: 12 },
  // Добавил стили для инпутов в модалке
  inputStyle: { borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, fontSize: 16, marginBottom: 12, color: '#333' },
});