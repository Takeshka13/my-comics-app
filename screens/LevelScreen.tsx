import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#34495e'];

export default function LevelScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { levelId, levelName } = route.params || {};
  const insets = useSafeAreaInsets();

  const [levelData, setLevelData] = useState<any>(null);
  const [groupedItems, setGroupedItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLevelData = async () => {
    setLoading(true);
    const { data: level } = await supabase.from('levels').select('*').eq('id', levelId).single();
    setLevelData(level);

    // Получаем все экземпляры на полке
    const { data: copies } = await supabase
      .from('copies')
      .select(`
        id, width_mm, height_mm, title_id,
        titles ( name, publisher )
      `)
      .eq('level_id', levelId)
      .order('created_at');
      
    if (copies) {
      // ГРУППИРУЕМ по title_id
      const groups: { [key: string]: any[] } = {};
      copies.forEach(copy => {
        if (!groups[copy.title_id]) groups[copy.title_id] = [];
        groups[copy.title_id].push(copy);
      });

      // Преобразуем в массив для рендера. 
      // Берем первый экземпляр для визуала, остальные считаем подтоваркой.
      const formatted = Object.values(groups).map(group => ({
        ...group[0], // Данные переднего экземпляра
        backstockCount: group.length - 1, // Сколько спрятано за ним
        allIds: group.map(c => c.id) // ID всех экземпляров этой группы
      }));
      
      setGroupedItems(formatted);
    }
    
    setLoading(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      if (levelId) fetchLevelData();
    }, [levelId])
  );

  const removeFromShelf = async (copyIds: string[], removeAll: boolean = false) => {
    let idsToRemove = copyIds;
    
    if (!removeAll) {
      // Убираем только передний экземпляр, если не просили убрать все
      idsToRemove = [copyIds[0]]; 
    }

    const { error } = await supabase
      .from('copies')
      .update({ level_id: null, status: 'storage' })
      .in('id', idsToRemove);
      
    if (!error) {
      fetchLevelData();
    } else {
      Alert.alert('Ошибка', error.message);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#007AFF" /></View>;
  if (!levelId) return <View style={styles.center}><Text>Ошибка: полка не найдена</Text></View>;

  const usedWidth = groupedItems.reduce((sum, item) => sum + item.width_mm, 0);
  const freeWidth = (levelData?.width_mm || 0) - usedWidth;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
      <Text style={styles.title}>{levelName || 'Полка'}</Text>
      
      <View style={styles.statsCard}>
        <Text style={styles.statsText}>Длина полки: {levelData?.width_mm} мм</Text>
        <Text style={styles.statsText}>Занято: {usedWidth} мм</Text>
        <Text style={[styles.statsText, { fontWeight: 'bold', color: freeWidth >= 0 ? 'green' : 'red' }]}>
          Свободно: {freeWidth} мм
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.shelfWrapper}>
        <View style={styles.shelfVisual}>
          {groupedItems.length === 0 ? (
            <Text style={{ color: '#888', alignSelf: 'center', width: 100, textAlign: 'center' }}>Пусто</Text>
          ) : (
            groupedItems.map((item, index) => (
              <TouchableOpacity 
                key={item.id} 
                style={[
                  styles.bookSpine, 
                  { 
                    width: Math.max(16, item.width_mm / 2),
                    height: Math.min(100, (item.height_mm / (levelData?.height_mm || 300)) * 100), 
                    backgroundColor: COLORS[index % COLORS.length]
                  }
                ]} 
                onPress={() => {
                  // Если это подтоварка, предлагаем выбор
                  if (item.backstockCount > 0) {
                    Alert.alert(
                      item.titles.name,
                      `На полке ${item.backstockCount + 1} экз.`,
                      [
                        { text: "Закрыть", style: "cancel" },
                        { text: "Убрать 1 (передний)", onPress: () => removeFromShelf(item.allIds, false) },
                        { text: "Убрать все", style: "destructive", onPress: () => removeFromShelf(item.allIds, true) }
                      ]
                    );
                  } else {
                    // Обычный комикс
                    Alert.alert(
                      item.titles.name,
                      `Толщина: ${item.width_mm} мм\nИздательство: ${item.titles.publisher || '-'}`,
                      [
                        { text: "Закрыть", style: "cancel" },
                        { text: "Убрать с полки", style: "destructive", onPress: () => removeFromShelf(item.allIds, true) }
                      ]
                    );
                  }
                }}
              >
                {/* Бейджик с количеством подтоварки */}
                {item.backstockCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>+{item.backstockCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      <TouchableOpacity 
        style={styles.button} 
        onPress={() => {
          if (!levelData) return Alert.alert("Ошибка", "Данные о полке не загружены");
          navigation.navigate('AddToShelf', { 
            levelId, 
            freeWidth, 
            levelHeight: levelData.height_mm 
          });
        }}
      >
        <Ionicons name="add" size={20} color="white" />
        <Text style={styles.buttonText}>Поставить комикс</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#333', marginBottom: 16 },
  statsCard: { backgroundColor: 'white', padding: 16, borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#ddd' },
  statsText: { fontSize: 16, color: '#333', marginBottom: 4 },
  
  shelfWrapper: { flexGrow: 0, marginBottom: 16 },
  shelfVisual: { 
    flexDirection: 'row', 
    alignItems: 'flex-end', 
    backgroundColor: '#dcdcdc', 
    height: 120, 
    padding: 8, 
    borderRadius: 8, 
    borderBottomWidth: 6,
    borderBottomColor: '#8b4513',
    gap: 2
  },
  bookSpine: { 
    borderRadius: 3,
    elevation: 2,
    position: 'relative',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 4
  },
  badge: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 1,
    position: 'absolute',
    top: 4,
    borderWidth: 1,
    borderColor: '#ccc'
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#333'
  },

  button: { backgroundColor: '#007AFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 8 },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16, marginLeft: 8 }
});