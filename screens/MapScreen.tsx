import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert, Dimensions, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import Svg, { Defs, Pattern, Path, Rect } from 'react-native-svg';
import { supabase } from '../lib/supabase';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CANVAS_SIZE = 2000; // Размер виртуальной карты
const GRID_STEP = 20; // Шаг сетки привязки
const MIN_SCALE = 0.4;
const MAX_SCALE = 1.0;

const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#34495e'];

// Ограничение позиции с учетом масштаба
const clampPan = (x: number, y: number, scaleVal: number) => {
  'worklet';
  const contentW = CANVAS_SIZE * scaleVal;
  const contentH = CANVAS_SIZE * scaleVal;
  
  // Доступная область для просмотра (экран минус отступы)
  const availW = SCREEN_WIDTH - 32; 
  const availH = SCREEN_HEIGHT - 200; 
  
  let minX, maxX, minY, maxY;
  
  // Если контент больше экрана — можно двигать
  if (contentW > availW) {
    minX = availW - contentW;
    maxX = 0;
  } else {
    // Если меньше — центрируем
    minX = (availW - contentW) / 2;
    maxX = minX;
  }
  
  if (contentH > availH) {
    minY = availH - contentH;
    maxY = 0;
  } else {
    minY = (availH - contentH) / 2;
    maxY = minY;
  }
  
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
};

const GridBackground = () => (
  <Svg width={CANVAS_SIZE} height={CANVAS_SIZE} style={StyleSheet.absoluteFill}>
    <Defs>
      <Pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
        <Path d="M 100 0 L 0 0 0 100" fill="none" stroke="#ddd" strokeWidth="1" />
      </Pattern>
    </Defs>
    <Rect width="100%" height="100%" fill="url(#grid)" />
  </Svg>
);

const ShelfItem = ({ shelf, isEditing, isActive, onActivate, onNavigate, onSave }: any) => {
  const x = useSharedValue(shelf.map_x || 100);
  const y = useSharedValue(shelf.map_y || 100);

  useEffect(() => {
    x.value = shelf.map_x || 100;
    y.value = shelf.map_y || 100;
  }, [shelf.map_x, shelf.map_y]);

  const panGesture = Gesture.Pan()
    .enabled(isEditing && !isActive) 
    .onUpdate((event) => {
      x.value = (shelf.map_x || 100) + event.translationX;
      y.value = (shelf.map_y || 100) + event.translationY;
    })
    .onEnd((event) => {
      // Привязка к сетке с шагом 20
      const newX = Math.max(0, Math.round(((shelf.map_x || 100) + event.translationX) / GRID_STEP) * GRID_STEP);
      const newY = Math.max(0, Math.round(((shelf.map_y || 100) + event.translationY) / GRID_STEP) * GRID_STEP);
      
      x.value = newX;
      y.value = newY;
      runOnJS(onSave)(shelf.id, newX, newY);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.shelfContainer, animatedStyle]}>
        <View 
          style={[
            styles.shelfBox, 
            { backgroundColor: shelf.color || '#e74c3c' }, 
            isEditing && { borderWidth: 3, borderColor: isActive ? '#FFD700' : 'rgba(0,0,0,0.1)' }
          ]}
        >
          <Ionicons name="library" size={24} color="rgba(255,255,255,0.7)" style={{ marginBottom: 4 }} />
          {isEditing ? (
            <TouchableOpacity style={{ flex: 1, alignItems: 'center' }} onPress={() => onActivate(shelf.id)}>
              <Text style={styles.shelfText} numberOfLines={2}>{shelf.name}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={{ flex: 1, alignItems: 'center' }} onPress={() => onNavigate(shelf.id, shelf.name)}>
              <Text style={styles.shelfText} numberOfLines={2}>{shelf.name}</Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </GestureDetector>
  );
};

export default function MapScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  
  const [shelves, setShelves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [activeShelfId, setActiveShelfId] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [newShelfName, setNewShelfName] = useState('');
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  // --- СОСТОЯНИЯ КАМЕРЫ (ЗУМ И ПЕРЕМЕЩЕНИЕ) ---
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);

  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const savedScale = useSharedValue(1);

  // Жест перемещения (Pan)
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      const newX = savedTranslateX.value + event.translationX;
      const newY = savedTranslateY.value + event.translationY;
      const clamped = clampPan(newX, newY, scale.value);
      
      translateX.value = clamped.x;
      translateY.value = clamped.y;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // Жест зума (Pinch)
  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, savedScale.value * event.scale));
      const scaleChange = newScale / scale.value;
      
      // Чтобы зум шел от центра пальцев, корректируем смещение
      const focalX = event.focalX;
      const focalY = event.focalY;
      
      let newX = focalX - (focalX - translateX.value) * scaleChange;
      let newY = focalY - (focalY - translateY.value) * scaleChange;
      
      scale.value = newScale;
      
      const clamped = clampPan(newX, newY, newScale);
      translateX.value = clamped.x;
      translateY.value = clamped.y;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // Объединяем жесты
  const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture);

  const canvasAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value }
    ],
  }));

  const fetchShelves = async () => {
    const { data, error } = await supabase.from('shelves').select('*');
    if (!error) setShelves(data || []);
    setLoading(false);
  };

  useFocusEffect(React.useCallback(() => { fetchShelves(); }, []));

  const saveShelfPosition = async (id: string, x: number, y: number) => {
    await supabase.from('shelves').update({ map_x: x, map_y: y }).eq('id', id);
    fetchShelves();
  };

  const confirmDelete = async () => {
    if (!activeShelfId) return;
    await supabase.from('shelves').delete().eq('id', activeShelfId);
    setDeleteModalVisible(false);
    setActiveShelfId(null);
    fetchShelves();
  };

  const handleColorChange = async (color: string) => {
    if (!activeShelfId) return;
    await supabase.from('shelves').update({ color }).eq('id', activeShelfId);
    fetchShelves();
  };

  const handleRename = async () => {
    if (!renameValue.trim() || !activeShelfId) return;
    await supabase.from('shelves').update({ name: renameValue }).eq('id', activeShelfId);
    setRenameModalVisible(false);
    fetchShelves();
  };

  const handleAddShelf = async () => {
    if (!newShelfName.trim()) return Alert.alert('Ошибка', 'Введите название');
    
    // Вычисляем центр видимой области (с учетом зума)
    const centerX = Math.round((-translateX.value + (SCREEN_WIDTH - 32) / 2) / scale.value);
    const centerY = Math.round((-translateY.value + (SCREEN_HEIGHT - 200) / 2) / scale.value);

    const { data: newShelf, error } = await supabase
      .from('shelves')
      .insert([{ name: newShelfName, map_x: centerX, map_y: centerY }])
      .select()
      .single();

    if (error) return Alert.alert('Ошибка стеллажа', error.message);

    if (newShelf) {
      const defaultLevels = [1, 2, 3, 4, 5].map(pos => ({
        shelf_id: newShelf.id, position: pos, width_mm: 800, height_mm: 300, depth_mm: 250, display_mode: 'spine'
      }));
      await supabase.from('levels').insert(defaultLevels);
    }

    setNewShelfName('');
    setModalVisible(false);
    fetchShelves();
  };

  const toggleEditMode = () => {
    if (isEditing) setActiveShelfId(null);
    setIsEditing(!isEditing);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#007AFF" /></View>;

  const activeShelf = shelves.find(s => s.id === activeShelfId);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.title}>Карта</Text>
        <TouchableOpacity 
          style={[styles.editToggle, isEditing && styles.editToggleActive]} 
          onPress={toggleEditMode}
        >
          <Ionicons name={isEditing ? "checkmark" : "pencil"} size={20} color={isEditing ? "white" : "#007AFF"} />
          <Text style={[styles.editToggleText, isEditing && { color: 'white' }]}>{isEditing ? 'Готово' : 'Изменить'}</Text>
        </TouchableOpacity>
      </View>

      {/* Окно просмотра карты */}
      <View style={styles.mapViewport}>
        <GestureDetector gesture={composedGesture}>
          <Animated.View 
            style={[styles.canvas, canvasAnimatedStyle, { transformOrigin: 'top left' }]}
          >
            <GridBackground />
            
            {shelves.map(shelf => (
              <ShelfItem 
                key={shelf.id} 
                shelf={shelf} 
                isEditing={isEditing}
                isActive={activeShelfId === shelf.id}
                onActivate={setActiveShelfId}
                onNavigate={(id: string, name: string) => navigation.navigate('Shelf', { shelfId: id, shelfName: name })}
                onSave={saveShelfPosition}
              />
            ))}
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Панель управления активным стеллажом */}
      {isEditing && activeShelf && (
        <View style={[styles.controlPanel, { zIndex: 100, elevation: 10 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={styles.controlTitle} numberOfLines={1}>{activeShelf.name}</Text>
            <TouchableOpacity 
              style={styles.renameBtn} 
              onPress={() => { setRenameValue(activeShelf.name); setRenameModalVisible(true); }}
            >
              <Ionicons name="pencil" size={16} color="#007AFF" />
              <Text style={{ color: '#007AFF', fontWeight: 'bold', marginLeft: 4 }}>Имя</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.paletteRow}>
            {COLORS.map(c => (
              <TouchableOpacity 
                key={c} 
                style={[styles.colorOption, { backgroundColor: c }, activeShelf.color === c && styles.activeColor]} 
                onPress={() => handleColorChange(c)}
              />
            ))}
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#e74c3c' }]} onPress={() => setDeleteModalVisible(true)}>
              <Ionicons name="trash" size={20} color="white" />
              <Text style={styles.actionText}>Удалить стеллаж</Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity style={styles.closePanelBtn} onPress={() => setActiveShelfId(null)}>
            <Text style={{ color: '#888', fontWeight: 'bold' }}>Закрыть панель (чтобы двигать)</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16), zIndex: 50 }]}>
        <TouchableOpacity style={styles.button} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={20} color="white" />
          <Text style={styles.buttonText}>Добавить стеллаж</Text>
        </TouchableOpacity>
      </View>

      {/* Модалки */}
      <Modal visible={modalVisible} transparent={true} animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Новый стеллаж</Text>
            <TextInput style={styles.input} placeholder="Название" value={newShelfName} onChangeText={setNewShelfName} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#ccc' }]} onPress={() => setModalVisible(false)}>
                <Text>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#007AFF' }]} onPress={handleAddShelf}>
                <Text style={{ color: 'white', fontWeight: 'bold' }}>Создать</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={renameModalVisible} transparent={true} animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Изменить название</Text>
            <TextInput style={styles.input} placeholder="Название" value={renameValue} onChangeText={setRenameValue} autoFocus />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#ccc' }]} onPress={() => setRenameModalVisible(false)}>
                <Text>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#007AFF' }]} onPress={handleRename}>
                <Text style={{ color: 'white', fontWeight: 'bold' }}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={deleteModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Удалить стеллаж?</Text>
            <Text style={{ fontSize: 14, color: '#666', marginBottom: 20 }}>
              Комиксы и полки сохранятся в базе данных.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#ccc' }]} onPress={() => setDeleteModalVisible(false)}>
                <Text>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#e74c3c' }]} onPress={confirmDelete}>
                <Text style={{ color: 'white', fontWeight: 'bold' }}>Удалить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  editToggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e6f2ff', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20 },
  editToggleActive: { backgroundColor: '#007AFF' },
  editToggleText: { color: '#007AFF', fontWeight: 'bold', marginLeft: 4 },
  
  mapViewport: { flex: 1, backgroundColor: '#f8f8f8', marginHorizontal: 16, borderRadius: 12, overflow: 'hidden', marginBottom: 16 },
  
  // Важно: transformOrigin: 'top left' задаем в стиле, чтобы зум шел от левого верхнего угла (это нужно для наших расчетов)
  canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE, backgroundColor: '#f8f8f8' },
  
  shelfContainer: { position: 'absolute', width: 120, height: 80 },
  shelfBox: { flex: 1, borderRadius: 12, justifyContent: 'center', alignItems: 'center', padding: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 4 },
  shelfText: { color: 'white', fontWeight: 'bold', textAlign: 'center', fontSize: 12 },
  
  controlPanel: { backgroundColor: 'white', marginHorizontal: 16, marginBottom: 16, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#ddd' },
  controlTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', flex: 1 },
  renameBtn: { flexDirection: 'row', alignItems: 'center', padding: 4 },
  paletteRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  colorOption: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
  activeColor: { borderColor: '#333' },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', padding: 12, borderRadius: 8, justifyContent: 'center', alignItems: 'center', gap: 8 },
  actionText: { color: 'white', fontWeight: 'bold' },
  closePanelBtn: { marginTop: 12, alignItems: 'center', padding: 8 },

  bottomBar: { paddingHorizontal: 16, paddingTop: 12 },
  button: { flexDirection: 'row', backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 8 },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', padding: 20, borderRadius: 12 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, fontSize: 16, marginBottom: 16 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  modalBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' }
})