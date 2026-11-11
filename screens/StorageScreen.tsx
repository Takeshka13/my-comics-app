import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

export default function StorageScreen() {
  const insets = useSafeAreaInsets();
  const [groupedItems, setGroupedItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStorage = async () => {
    setLoading(true);
    // Ищем все экземпляры, у которых нет привязки к полке
    const { data, error } = await supabase
      .from('copies')
      .select(`
        id, width_mm, height_mm, title_id,
        titles ( name, publisher, series, volume )
      `)
      .is('level_id', null)
      .order('created_at', { ascending: false });

    if (!error && data) {
      // ГРУППИРУЕМ по title_id
      const groups: { [key: string]: any[] } = {};
      data.forEach(copy => {
        if (!groups[copy.title_id]) groups[copy.title_id] = [];
        groups[copy.title_id].push(copy);
      });

      // Формируем массив для отображения
      const formatted = Object.values(groups).map(group => ({
        ...group[0], // Данные первого экземпляра
        count: group.length // Количество на складе
      }));
      
      setGroupedItems(formatted);
    }
    setLoading(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchStorage();
    }, [])
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
      <Text style={styles.title}>Склад</Text>
      
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={groupedItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 50, color: '#888' }}>На складе пусто</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.iconBox}>
                <Ionicons name="archive" size={24} color="#666" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>
                  {item.titles.name} {item.titles.volume ? `(Том ${item.titles.volume})` : ''}
                </Text>
                <Text style={styles.cardSubtitle}>{item.titles.publisher || 'Без издательства'}</Text>
                <Text style={styles.cardDetails}>Размер: {item.width_mm}×{item.height_mm} мм</Text>
              </View>
              
              {/* Бейджик с количеством */}
              <View style={styles.badge}>
                <Text style={styles.badgeText}>×{item.count}</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', paddingHorizontal: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 16 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#ddd' },
  iconBox: { width: 40, height: 40, backgroundColor: '#f0f0f0', borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  cardSubtitle: { fontSize: 14, color: '#666', marginTop: 2 },
  cardDetails: { fontSize: 12, color: '#888', marginTop: 6 },
  
  badge: { 
    backgroundColor: '#007AFF', 
    borderRadius: 12, 
    paddingHorizontal: 10, 
    paddingVertical: 4, 
    marginLeft: 10 
  },
  badgeText: { 
    color: 'white', 
    fontWeight: 'bold', 
    fontSize: 14 
  }
});