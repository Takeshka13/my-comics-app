import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert, TextInput } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

export default function AddToShelfScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { levelId, freeWidth } = route.params || {};
  const insets = useSafeAreaInsets();

  const [allBooks, setAllBooks] = useState<any[]>([]); // Все книги со склада
  const [displayedBooks, setDisplayedBooks] = useState<any[]>([]); // То, что видим
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [shelfTheme, setShelfTheme] = useState<string | null>(null);
  const [ignoreTheme, setIgnoreTheme] = useState(false); 

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      
      // Узнаем тему полки
      if (levelId) {
        const { data } = await supabase.from('levels').select('reserved_theme').eq('id', levelId).single();
        if (data?.reserved_theme) setShelfTheme(data.reserved_theme);
      }

      // Загружаем ВСЕ книги со склада
      const { data, error } = await supabase
        .from('copies')
        .select(`
          id, width_mm, height_mm, title_id,
          titles ( name, publisher, series )
        `)
        .is('level_id', null);

      if (!error && data) {
        const grouped: { [key: string]: any[] } = {};
        data.forEach(copy => {
          if (!grouped[copy.title_id]) grouped[copy.title_id] = [];
          grouped[copy.title_id].push(copy);
        });

        const formatted = Object.values(grouped).map(group => {
          let t = group[0].titles;
          if (Array.isArray(t)) t = t[0];
          if (!t) t = {};

          return {
            id: group[0].id,
            title_id: group[0].title_id,
            width_mm: group[0].width_mm,
            height_mm: group[0].height_mm,
            // Принудительно приводим к строке и нижнему регистру
            titleName: String(t.name || '').trim(),
            titlePublisher: String(t.publisher || '').trim(),
            titleSeries: String(t.series || '').trim(),
            count: group.length,
            allIds: group.map(c => c.id)
          };
        });

        setAllBooks(formatted);
        setDisplayedBooks(formatted);
      }
      setLoading(false);
    };

    init();
  }, [levelId]);

  // Поиск и фильтрация
  useEffect(() => {
    let result = [...allBooks];

    // 1. Поиск (ищем по всем трем полям)
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.trim().toLowerCase();
      
      result = result.filter(item => {
        // Переводим все в нижний регистр для сравнения
        const name = item.titleName.toLowerCase();
        const pub = item.titlePublisher.toLowerCase();
        const ser = item.titleSeries.toLowerCase();

        // Ищем вхождение текста
        return name.includes(q) || pub.includes(q) || ser.includes(q);
      });
    }

    // 2. Фильтр темы
    if (shelfTheme && !ignoreTheme) {
      const theme = shelfTheme.trim().toLowerCase();
      
      // ВАЖНО: Если пользователь что-то ищет, мы ИГНОРИРУЕМ фильтр темы, 
      // чтобы он мог найти то, что хочет, даже если полка зарезервирована.
      if (searchQuery.trim().length === 0) {
        result = result.filter(item => {
          const name = item.titleName.toLowerCase();
          const pub = item.titlePublisher.toLowerCase();
          const ser = item.titleSeries.toLowerCase();
          
          return name.includes(theme) || pub.includes(theme) || ser.includes(theme);
        });
      }
    }

    setDisplayedBooks(result);
  }, [searchQuery, allBooks, shelfTheme, ignoreTheme]);

  const handleAddToShelf = async (item: any) => {
    if (!levelId) return;

    const { data: existing } = await supabase.from('copies').select('id').eq('level_id', levelId).eq('title_id', item.title_id);
    const isBackstock = existing && existing.length > 0;

    if (!isBackstock && item.width_mm > freeWidth) {
      Alert.alert("Не влезает!", `Свободно ${freeWidth} мм, а комикс ${item.width_mm} мм.`);
      return;
    }

    const copyToPlaceId = item.allIds[0];
    const { error } = await supabase.from('copies').update({ level_id: levelId, status: 'on_shelf' }).eq('id', copyToPlaceId);

    if (error) {
      Alert.alert("Ошибка", error.message);
    } else {
      Alert.alert("Успешно!", isBackstock ? "Добавлено в подтоварку." : "Поставлено на полку.");
      navigation.goBack();
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={styles.title}>Выберите комикс</Text>
        {shelfTheme && (
          <TouchableOpacity 
            style={[styles.themeBadge, ignoreTheme && { backgroundColor: '#ccc' }]} 
            onPress={() => setIgnoreTheme(!ignoreTheme)}
          >
            <Text style={styles.themeText}>
              {ignoreTheme ? 'Тема отключена' : `Тема: ${shelfTheme}`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      
      <Text style={styles.subtitle}>Свободно: {freeWidth} мм</Text>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color="#888" />
        <TextInput 
          style={styles.searchInput}
          placeholder="Поиск по названию..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#888" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={displayedBooks}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 50 }}>
              <Text style={{ color: '#888', marginBottom: 10 }}>Ничего не найдено</Text>
              {shelfTheme && !ignoreTheme && (
                <TouchableOpacity onPress={() => setIgnoreTheme(true)} style={{ padding: 10, backgroundColor: '#e6f2ff', borderRadius: 8 }}>
                  <Text style={{ color: '#007AFF', fontWeight: 'bold' }}>Искать по всем книгам</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.titleName}</Text>
                <Text style={styles.cardSubtitle}>{item.titlePublisher || 'Без издательства'}</Text>
                <Text style={styles.cardDetails}>{item.width_mm}×{item.height_mm} мм</Text>
              </View>
              <View style={styles.actions}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>×{item.count}</Text>
                </View>
                <TouchableOpacity style={[styles.addBtn, { backgroundColor: '#e6f2ff' }]} onPress={() => handleAddToShelf(item)}>
                  <Ionicons name="add" size={24} color="#007AFF" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', padding: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 16 },
  themeBadge: { backgroundColor: '#f39c12', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  themeText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#ddd', marginBottom: 16 },
  searchInput: { flex: 1, fontSize: 16, color: '#333', marginLeft: 8 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#ddd' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  cardSubtitle: { fontSize: 14, color: '#666', marginTop: 2 },
  cardDetails: { fontSize: 12, color: '#888', marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  badge: { backgroundColor: '#007AFF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: 'white', fontWeight: 'bold', fontSize: 12 }
});