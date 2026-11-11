import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

const AVAILABLE_THEMES = [
  'Марвел', 'DC', 'Азбука', 'Комильфо', 'Bubble', 'Аниме', 
  'Манга', 'Атака титанов', 'Человек-паук', 'Майор Гром', 'Комиксы'
];

export default function ShelfScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { shelfId, shelfName } = route.params || {};
  const insets = useSafeAreaInsets();

  const [levels, setLevels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Модалка создания
  const [modalVisible, setModalVisible] = useState(false);
  const [position, setPosition] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [depth, setDepth] = useState('');
  const [theme, setTheme] = useState('');

  // Модалка редактирования
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingLevelId, setEditingLevelId] = useState<string | null>(null);
  const [editPosition, setEditPosition] = useState('');
  const [editWidth, setEditWidth] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const [editDepth, setEditDepth] = useState('');
  const [editTheme, setEditTheme] = useState('');

  // Состояние для кастомного ввода темы
  const [isCustomTheme, setIsCustomTheme] = useState(false);

  // --- СОСТОЯНИЯ ДЛЯ ПЕРЕМЕЩЕНИЯ ПОЛКИ ---
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [levelToMove, setLevelToMove] = useState<any>(null);
  const [otherShelves, setOtherShelves] = useState<any[]>([]);

  const fetchLevels = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('levels')
      .select('*')
      .eq('shelf_id', shelfId)
      .order('position', { ascending: true });
    
    if (!error) setLevels(data || []);
    setLoading(false);
  };

  const fetchOtherShelves = async () => {
    const { data } = await supabase.from('shelves').select('id, name');
    if (data) {
      // Убираем из списка текущий стеллаж
      setOtherShelves(data.filter(s => s.id !== shelfId));
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      if (shelfId) {
        fetchLevels();
        fetchOtherShelves();
      }
    }, [shelfId])
  );

  const handleAddLevel = async () => {
    if (!position || !width || !height || !depth) {
      Alert.alert('Ошибка', 'Заполните все поля');
      return;
    }

    const { error } = await supabase
      .from('levels')
      .insert([{ 
        shelf_id: shelfId, 
        position: parseInt(position), 
        width_mm: parseInt(width),
        height_mm: parseInt(height),
        depth_mm: parseInt(depth),
        reserved_theme: theme.split(',').map(t => t.trim()).filter(t => t) || null
      }]);

    if (error) {
      Alert.alert('Ошибка базы', error.message);
    } else {
      setPosition(''); setWidth(''); setHeight(''); setDepth(''); setTheme('');
      setIsCustomTheme(false);
      setModalVisible(false);
      fetchLevels();
    }
  };

  const openEditModal = (level: any) => {
    setEditingLevelId(level.id);
    setEditPosition(level.position.toString());
    setEditWidth(level.width_mm.toString());
    setEditHeight(level.height_mm.toString());
    setEditDepth(level.depth_mm.toString());
    
    // Если тема — массив, склеиваем в строку через запятую для редактирования
    let themeString = '';
    if (Array.isArray(level.reserved_theme)) {
      themeString = level.reserved_theme.join(', ');
    } else if (typeof level.reserved_theme === 'string') {
      themeString = level.reserved_theme;
    }
    setEditTheme(themeString);

    if (themeString && !AVAILABLE_THEMES.includes(themeString)) {
      setIsCustomTheme(true);
    } else {
      setIsCustomTheme(false);
    }
    setEditModalVisible(true);
  };

  const handleEditLevel = async () => {
    if (!editPosition || !editWidth || !editHeight || !editDepth || !editingLevelId) {
      Alert.alert('Ошибка', 'Заполните все поля');
      return;
    }

    const { error } = await supabase
      .from('levels')
      .update({ 
        position: parseInt(editPosition), 
        width_mm: parseInt(editWidth),
        height_mm: parseInt(editHeight),
        depth_mm: parseInt(editDepth),
        reserved_theme: editTheme.split(',').map(t => t.trim()).filter(t => t) || null
      })
      .eq('id', editingLevelId);

    if (error) {
      Alert.alert('Ошибка базы', error.message);
    } else {
      setEditModalVisible(false);
      fetchLevels();
    }
  };

  // --- ФУНКЦИЯ ПЕРЕМЕЩЕНИЯ ---
  const openMoveModal = (level: any) => {
    setLevelToMove(level);
    setMoveModalVisible(true);
  };

  const handleMoveLevel = async (targetShelfId: string) => {
    if (!levelToMove) return;
    
    // Меняем привязку полки к стеллажу
    const { error } = await supabase
      .from('levels')
      .update({ shelf_id: targetShelfId })
      .eq('id', levelToMove.id);

    if (error) {
      Alert.alert('Ошибка переноса', error.message);
    } else {
      Alert.alert("Успех", "Полка и все книги на ней перенесены на другой стеллаж.");
      setMoveModalVisible(false);
      setLevelToMove(null);
      fetchLevels(); // Обновляем список (полка исчезнет отсюда)
    }
  };

  const deleteLevel = async (levelId: string) => {
    Alert.alert("Удалить полку?", "Все комиксы с неё упадут на склад.", [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: async () => {
        await supabase.from('copies').update({ level_id: null, status: 'storage' }).eq('level_id', levelId);
        await supabase.from('levels').delete().eq('id', levelId);
        fetchLevels();
      }}
    ]);
  };

  const renderThemeSelector = (selectedTheme: string, onSelect: (val: string) => void) => (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 8 }}>Тема (фильтр):</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {AVAILABLE_THEMES.map(t => (
            <TouchableOpacity 
              key={t} 
              style={[styles.tagBtn, selectedTheme.includes(t) && styles.tagBtnActive]}
              onPress={() => onSelect(selectedTheme.includes(t) ? '' : t)}
            >
              <Text style={[styles.tagText, selectedTheme.includes(t) && styles.tagTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity 
            style={[styles.tagBtn, { backgroundColor: isCustomTheme ? '#007AFF' : '#e0e0e0' }]}
            onPress={() => {
              setIsCustomTheme(true);
              onSelect(''); 
            }}
          >
            <Text style={[styles.tagText, isCustomTheme && { color: 'white' }]}>Другая...</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      {isCustomTheme && (
        <TextInput 
          style={[styles.input, { marginTop: 8 }]} 
          placeholder="Введите свою тему (например: BUBBLE)" 
          value={selectedTheme} 
          onChangeText={onSelect} 
        />
      )}
    </View>
  );

  if (!shelfId) return <View style={styles.center}><Text>Ошибка: стеллаж не найден</Text></View>;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
      <Text style={styles.title}>{shelfName || 'Стеллаж'}</Text>
      
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 20 }} />
      ) : (
        <ScrollView style={styles.levelsList} showsVerticalScrollIndicator={false}>
          {levels.length === 0 ? (
            <Text style={{ textAlign: 'center', marginTop: 20 }}>Полок пока нет</Text>
          ) : (
            levels.map((level) => (
              <View key={level.id} style={styles.levelCard}>
                <TouchableOpacity 
                  style={{ flex: 1 }}
                  onPress={() => navigation.navigate('Level', { levelId: level.id, levelName: `Полка №${level.position}` })}
                >
                  <Text style={styles.levelTitle}>Полка №{level.position}</Text>
                  {level.reserved_theme && level.reserved_theme.length > 0 && (
                    <View style={styles.themeBadge}>
                      <Text style={styles.themeText}>{level.reserved_theme.join(', ')}</Text>
                    </View>
                  )}
                  <Text style={styles.levelDetails}>
                    Д: {level.width_mm} мм | В: {level.height_mm} мм | Г: {level.depth_mm} мм
                  </Text>
                </TouchableOpacity>
                
                <View style={styles.actions}>
                  {/* Кнопка перемещения */}
                  <TouchableOpacity style={styles.iconBtn} onPress={() => openMoveModal(level)}>
                    <Ionicons name="swap-horizontal" size={20} color="#f39c12" />
                  </TouchableOpacity>
                  {/* Кнопка редактирования */}
                  <TouchableOpacity style={styles.iconBtn} onPress={() => openEditModal(level)}>
                    <Ionicons name="pencil" size={20} color="#007AFF" />
                  </TouchableOpacity>
                  {/* Кнопка удаления */}
                  <TouchableOpacity style={styles.iconBtn} onPress={() => deleteLevel(level.id)}>
                    <Ionicons name="trash" size={20} color="#e74c3c" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <TouchableOpacity style={styles.button} onPress={() => { setIsCustomTheme(false); setTheme(''); setModalVisible(true); }}>
        <Text style={styles.buttonText}>+ Добавить полку</Text>
      </TouchableOpacity>

      {/* Модалка создания */}
      <Modal visible={modalVisible} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>Новая полка</Text>
            
            <TextInput style={styles.input} placeholder="Номер полки" keyboardType="numeric" value={position} onChangeText={setPosition} />
            <TextInput style={styles.input} placeholder="Длина (мм)" keyboardType="numeric" value={width} onChangeText={setWidth} />
            <TextInput style={styles.input} placeholder="Высота (мм)" keyboardType="numeric" value={height} onChangeText={setHeight} />
            <TextInput style={styles.input} placeholder="Глубина (мм)" keyboardType="numeric" value={depth} onChangeText={setDepth} />

            {renderThemeSelector(theme, setTheme)}

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#ccc' }]} onPress={() => setModalVisible(false)}>
                <Text>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#007AFF' }]} onPress={handleAddLevel}>
                <Text style={{ color: 'white', fontWeight: 'bold' }}>Создать</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Модалка редактирования */}
      <Modal visible={editModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>Редактировать полку</Text>
            
            <TextInput style={styles.input} placeholder="Номер полки" keyboardType="numeric" value={editPosition} onChangeText={setEditPosition} />
            <TextInput style={styles.input} placeholder="Длина (мм)" keyboardType="numeric" value={editWidth} onChangeText={setEditWidth} />
            <TextInput style={styles.input} placeholder="Высота (мм)" keyboardType="numeric" value={editHeight} onChangeText={setEditHeight} />
            <TextInput style={styles.input} placeholder="Глубина (мм)" keyboardType="numeric" value={editDepth} onChangeText={setEditDepth} />

            {renderThemeSelector(editTheme, setEditTheme)}

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#ccc' }]} onPress={() => setEditModalVisible(false)}>
                <Text>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#007AFF' }]} onPress={handleEditLevel}>
                <Text style={{ color: 'white', fontWeight: 'bold' }}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* МОДАЛКА ПЕРЕМЕЩЕНИЯ ПОЛКИ */}
      <Modal visible={moveModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '70%' }]}>
            <Text style={styles.modalTitle}>Переместить полку</Text>
            <Text style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
              Выберите стеллаж, на который нужно перенести <Text style={{fontWeight: 'bold'}}>Полку №{levelToMove?.position}</Text>. 
              Все книги переедут вместе с ней.
            </Text>
            
            <ScrollView showsVerticalScrollIndicator={false}>
              {otherShelves.map(s => (
                <TouchableOpacity 
                  key={s.id} 
                  style={styles.shelfOption} 
                  onPress={() => handleMoveLevel(s.id)}
                >
                  <Ionicons name="library" size={20} color="#007AFF" style={{ marginRight: 10 }} />
                  <Text style={{ fontSize: 16, color: '#333' }}>{s.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#ccc' }]} onPress={() => setMoveModalVisible(false)}>
                <Text>Отмена</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', paddingHorizontal: 16, paddingTop: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16, color: '#333' },
  levelsList: { flex: 1, marginBottom: 16 },
  levelCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 16, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#ddd' },
  levelTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  levelDetails: { color: '#666', fontSize: 14 },
  themeBadge: { backgroundColor: '#f39c12', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, alignSelf: 'flex-start', marginBottom: 4 },
  themeText: { color: 'white', fontWeight: 'bold', fontSize: 10 },
  actions: { flexDirection: 'row', gap: 4 },
  iconBtn: { padding: 8 },
  button: { backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 8 },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', padding: 20, borderRadius: 12, maxHeight: '90%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, fontSize: 16, marginBottom: 12 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 8 },
  modalBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  
  tagBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#ddd' },
  tagBtnActive: { backgroundColor: '#e6f2ff', borderColor: '#007AFF' },
  tagText: { fontSize: 14, color: '#333' },
  tagTextActive: { color: '#007AFF', fontWeight: 'bold' },

  shelfOption: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#f9f9f9', borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#eee' }
});