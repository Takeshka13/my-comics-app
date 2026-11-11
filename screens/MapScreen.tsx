import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert, Dimensions, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import { supabase } from '../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#34495e'];

const ShelfItem = ({ shelf, isEditing, isActive, onActivate, onNavigate, onSave }: any) => {
  const translateX = useSharedValue(shelf.map_x || 20);
  const translateY = useSharedValue(shelf.map_y || 20);
  const rotationValue = useSharedValue(shelf.rotation || 0);

  useEffect(() => {
    translateX.value = shelf.map_x || 20;
    translateY.value = shelf.map_y || 20;
    rotationValue.value = shelf.rotation || 0;
  }, [shelf.map_x, shelf.map_y, shelf.rotation]);

  const panGesture = Gesture.Pan()
    .enabled(isEditing && !isActive)
    .onUpdate((event) => {
      translateX.value = (shelf.map_x || 20) + event.translationX;
      translateY.value = (shelf.map_y || 20) + event.translationY;
    })
    .onEnd((event) => {
      const newX = Math.max(0, Math.min(SCREEN_WIDTH - 120, Math.round(((shelf.map_x || 20) + event.translationX) / 40) * 40));
      const newY = Math.max(0, Math.round(((shelf.map_y || 20) + event.translationY) / 40) * 40);
      
      translateX.value = newX;
      translateY.value = newY;
      runOnJS(onSave)(shelf.id, newX, newY, shelf.rotation || 0);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotationValue.value}deg` }
    ],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.shelfContainer, animatedStyle]}>
        <View 
          style={[
            styles.shelfBox, 
            { backgroundColor: shelf.color || '#e74c3c' }, 
            isEditing && { borderWidth: 2, borderColor: isActive ? 'yellow' : 'transparent' }
          ]}
        >
          {isEditing ? (
            <TouchableOpacity 
              style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }} 
              onPress={() => onActivate(shelf.id)}
            >
              <Text style={styles.shelfText} numberOfLines={2}>{shelf.name}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }} 
              onPress={() => onNavigate(shelf.id, shelf.name)}
            >
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

  const fetchShelves = async () => {
    const { data, error } = await supabase.from('shelves').select('*');
    if (!error) setShelves(data || []);
    setLoading(false);
  };

  useFocusEffect(React.useCallback(() => { fetchShelves(); }, []));

  const saveShelfPosition = async (id: string, x: number, y: number, rot: number) => {
    await supabase.from('shelves').update({ map_x: x, map_y: y, rotation: rot }).eq('id', id);
    fetchShelves();
  };

  const handleRotate = async () => {
    if (!activeShelfId) return;
    const shelf = shelves.find(s => s.id === activeShelfId);
    if (!shelf) return;
    const newRot = ((shelf.rotation || 0) + 90) % 360;
    await supabase.from('shelves').update({ rotation: newRot }).eq('id', activeShelfId);
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
    
    // 1. Создаем стеллаж
    const { data: newShelf, error } = await supabase
      .from('shelves')
      .insert([{ name: newShelfName, map_x: 20, map_y: 20 }])
      .select()
      .single();

    if (error) return Alert.alert('Ошибка стеллажа', error.message);

    // 2. Автоматически создаем 5 полок
    if (newShelf) {
      const defaultLevels = [1, 2, 3, 4, 5].map(pos => ({
        shelf_id: newShelf.id,
        position: pos,
        width_mm: 800,
        height_mm: 300,
        depth_mm: 250,
        display_mode: 'spine'
      }));
      
      const { error: levelError } = await supabase.from('levels').insert(defaultLevels);
      
      if (levelError) {
        console.log("Ошибка создания полок:", levelError);
        Alert.alert("Ошибка полок", levelError.message);
      }
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

      <View style={styles.mapArea}>
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
      </View>

      {isEditing && activeShelf && (
        <View style={[styles.controlPanel, { zIndex: 100, elevation: 10 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={styles.controlTitle} numberOfLines={1}>{activeShelf.name}</Text>
            <TouchableOpacity 
              style={styles.renameBtn} 
              onPress={() => {
                setRenameValue(activeShelf.name);
                setRenameModalVisible(true);
              }}
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
            <TouchableOpacity style={styles.actionBtn} onPress={handleRotate}>
              <Ionicons name="refresh" size={20} color="white" />
              <Text style={styles.actionText}>Поворот</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#e74c3c' }]} onPress={() => setDeleteModalVisible(true)}>
              <Ionicons name="trash" size={20} color="white" />
              <Text style={styles.actionText}>Удалить</Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity style={styles.closePanelBtn} onPress={() => setActiveShelfId(null)}>
            <Text style={{ color: '#888', fontWeight: 'bold' }}>Закрыть панель</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16), zIndex: 50 }]}>
        <TouchableOpacity style={styles.button} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={20} color="white" />
          <Text style={styles.buttonText}>Добавить стеллаж</Text>
        </TouchableOpacity>
      </View>

      {/* Модалка создания */}
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

      {/* Модалка переименования */}
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

      {/* Модалка удаления */}
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
  
  mapArea: { flex: 1, backgroundColor: '#e0e0e0', marginHorizontal: 16, borderRadius: 12, overflow: 'hidden', position: 'relative', marginBottom: 16 },
  
  shelfContainer: { position: 'absolute', width: 100, height: 60 },
  shelfBox: { flex: 1, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  shelfText: { color: 'white', fontWeight: 'bold', textAlign: 'center', fontSize: 12 },
  
  controlPanel: { backgroundColor: 'white', marginHorizontal: 16, marginBottom: 16, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#ddd' },
  controlTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', flex: 1 },
  renameBtn: { flexDirection: 'row', alignItems: 'center', padding: 4 },
  paletteRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  colorOption: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
  activeColor: { borderColor: '#333' },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', backgroundColor: '#34495e', padding: 12, borderRadius: 8, justifyContent: 'center', alignItems: 'center', gap: 8 },
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
});