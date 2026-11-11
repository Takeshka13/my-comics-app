import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image, Dimensions } from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#34495e', '#e67e22', '#16a085', '#c0392b'];
const SCREEN_WIDTH = Dimensions.get('window').width;

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

    const { data: copies } = await supabase
      .from('copies')
      .select(`
        id, width_mm, height_mm, title_id,
        titles ( name, publisher, author, cover_url, series, volume )
      `)
      .eq('level_id', levelId)
      .order('created_at');
      
    if (copies) {
      const groups: { [key: string]: any[] } = {};
      copies.forEach(copy => {
        if (!groups[copy.title_id]) groups[copy.title_id] = [];
        groups[copy.title_id].push(copy);
      });

      const formatted = Object.values(groups).map((group, idx) => ({
        ...group[0],
        count: group.length,
        allIds: group.map(c => c.id),
        color: COLORS[idx % COLORS.length]
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
    let idsToRemove = removeAll ? copyIds : [copyIds[0]];
    const { error } = await supabase
      .from('copies')
      .update({ level_id: null, status: 'storage' })
      .in('id', idsToRemove);
      
    if (!error) fetchLevelData();
    else Alert.alert('Ошибка', error.message);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#007AFF" /></View>;
  if (!levelId) return <View style={styles.center}><Text>Ошибка: полка не найдена</Text></View>;

  const shelfWidthMm = levelData?.width_mm || 800;
  const usedWidth = groupedItems.reduce((sum, item) => sum + item.width_mm, 0);
  const freeWidth = shelfWidthMm - usedWidth;
  
  const visualAreaWidth = SCREEN_WIDTH - 40; 

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
      <Text style={styles.title}>{levelName || 'Полка'}</Text>
      
      <View style={[styles.statsCard, freeWidth < 0 && { borderColor: '#e74c3c', borderWidth: 2 }]}>
        <Text style={styles.statsText}>Длина полки: {shelfWidthMm} мм</Text>
        <Text style={styles.statsText}>Занято: {usedWidth} мм</Text>
        <Text style={[styles.statsText, { fontWeight: 'bold', color: freeWidth >= 0 ? 'green' : 'red' }]}>
          Свободно: {freeWidth} мм
        </Text>
      </View>

      {/* Визуализация полки */}
      <View style={styles.shelfContainer}>
        <View style={styles.shelfVisual}>
          {groupedItems.map((item, index) => {
            const widthPercent = item.width_mm / shelfWidthMm;
            const pixelWidth = Math.max(4, widthPercent * visualAreaWidth); 
            
            const heightPercent = Math.min(1, item.height_mm / (levelData?.height_mm || 300));
            const pixelHeight = heightPercent * 100; 

            return (
              <View 
                key={item.id} 
                style={[
                  styles.bookSpine, 
                  { 
                    width: pixelWidth,
                    height: pixelHeight, 
                    backgroundColor: item.color
                  }
                ]}
              >
                {/* Обложка (если есть) */}
                {item.titles?.cover_url && (
                  <View style={{ flex: 1, width: '100%', overflow: 'hidden', borderTopLeftRadius: 3, borderTopRightRadius: 3 }}>
                    <Image 
                      source={{ uri: item.titles.cover_url }} 
                      style={{ width: '100%', height: '100%', opacity: 0.8 }} 
                      resizeMode="cover"
                    />
                  </View>
                )}
              </View>
            );
          })}

          {/* Свободное место */}
          {freeWidth > 0 && (
            <View style={styles.freeSpaceBlock}>
              <Text style={{ fontSize: 10, color: '#aaa' }}>Свободно</Text>
            </View>
          )}
        </View>
        
        {/* Деревянная полка снизу */}
        <View style={styles.shelfBoard} />
      </View>

      <Text style={styles.listTitle}>Книги на полке:</Text>
      
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {groupedItems.length === 0 ? (
          <Text style={{ textAlign: 'center', marginTop: 10, color: '#888' }}>Пусто</Text>
        ) : (
          groupedItems.map((item) => (
            <View key={item.id} style={styles.listItem}>
              {/* Миниатюра обложки */}
              {item.titles?.cover_url ? (
                <Image source={{ uri: item.titles.cover_url }} style={styles.listImage} />
              ) : (
                <View style={[styles.listImage, { backgroundColor: item.color, justifyContent: 'center', alignItems: 'center' }]}>
                  <Ionicons name="book" size={20} color="white" />
                </View>
              )}

              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.listItemTitle} numberOfLines={2}>
                  {item.titles.name} {item.titles.volume ? `(Том ${item.titles.volume})` : ''}
                </Text>
                <Text style={styles.listItemSubtitle} numberOfLines={1}>
                  {item.titles.publisher || 'Без издательства'} {item.titles.author ? `| ${item.titles.author}` : ''}
                </Text>
                <Text style={styles.listItemDetails}>
                  Экземпляров: {item.count}
                </Text>
              </View>

              <TouchableOpacity 
                style={styles.removeBtn} 
                onPress={() => {
                  Alert.alert("Убрать с полки?", "Выберите действие", [
                    { text: "Отмена", style: "cancel" },
                    { text: "Убрать 1", onPress: () => removeFromShelf(item.allIds, false) },
                    { text: "Убрать все", style: "destructive", onPress: () => removeFromShelf(item.allIds, true) }
                  ]);
                }}
              >
                <Ionicons name="trash" size={20} color="#e74c3c" />
              </TouchableOpacity>
            </View>
          ))
        )}
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
        <Text style={styles.buttonText}>Поставить комиксы</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', paddingHorizontal: 16, paddingTop: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#333', marginBottom: 16 },
  
  statsCard: { backgroundColor: 'white', padding: 16, borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#ddd' },
  statsText: { fontSize: 16, color: '#333', marginBottom: 4 },
  
  shelfContainer: { marginBottom: 20 },
  shelfVisual: { 
    flexDirection: 'row', 
    alignItems: 'flex-end', 
    height: 110, 
    paddingHorizontal: 2,
    paddingTop: 10,
    gap: 2,
    backgroundColor: '#e8e8e8',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    overflow: 'hidden', 
  },
  shelfBoard: {
    height: 8,
    backgroundColor: '#8b4513',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },

  bookSpine: { 
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    position: 'relative',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },

  freeSpaceBlock: {
    flex: 1, 
    height: 100,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },

  listTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  list: { flex: 1, marginBottom: 16 },
  listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 10, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#ddd' },
  listImage: { width: 40, height: 60, borderRadius: 4, backgroundColor: '#eee' },
  listItemTitle: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  listItemSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },
  listItemDetails: { fontSize: 12, color: '#007AFF', marginTop: 4, fontWeight: 'bold' },
  removeBtn: { padding: 8 },

  button: { backgroundColor: '#007AFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 8 },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16, marginLeft: 8 }
});