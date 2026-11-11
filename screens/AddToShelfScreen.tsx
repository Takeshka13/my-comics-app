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

  const [allBooks, setAllBooks] = useState<any[]>([]);
  const [displayedBooks, setDisplayedBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [shelfThemes, setShelfThemes] = useState<string[]>([]);
  const [ignoreTheme, setIgnoreTheme] = useState(false); 

  const [selectedBooks, setSelectedBooks] = useState<{ [key: string]: any }>({});

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      
      // 1. Загружаем темы полки
      if (levelId) {
        const { data } = await supabase.from('levels').select('reserved_theme').eq('id', levelId).single();
        if (data?.reserved_theme) {
          if (Array.isArray(data.reserved_theme)) {
            setShelfThemes(data.reserved_theme);
          } else if (typeof data.reserved_theme === 'string') {
            setShelfThemes(data.reserved_theme.split(',').map((t: string) => t.trim()));
          }
        }
      }

      // 2. Загружаем ВСЕ экземпляры со склада с пагинацией
      let allData: any[] = [];
      let from = 0;
      let to = 999;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('copies')
          .select(`
            id, width_mm, height_mm, title_id,
            titles ( name, publisher, series )
          `)
          .is('level_id', null)
          .order('created_at', { ascending: true })
          .range(from, to);

        if (error) {
          console.log("Ошибка загрузки:", error);
          break;
        }

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          from += 1000;
          to += 1000;
          if (data.length < 1000) hasMore = false;
        } else {
          hasMore = false;
        }
      }

      // 3. Группируем по title_id
      if (allData.length > 0) {
        const grouped: { [key: string]: any[] } = {};
        allData.forEach(copy => {
          if (!copy.title_id) return;
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

    // 1. Поиск по тексту
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(item => {
        const name = item.titleName.toLowerCase();
        const pub = item.titlePublisher.toLowerCase();
        const ser = item.titleSeries.toLowerCase();
        return name.includes(q) || pub.includes(q) || ser.includes(q);
      });
    }

    // 2. Фильтр по темам полки (если не отключен и есть поиск не активен)
    if (shelfThemes.length > 0 && !ignoreTheme) {
      if (searchQuery.trim().length === 0) {
        result = result.filter(item => {
          const name = item.titleName.toLowerCase();
          const pub = item.titlePublisher.toLowerCase();
          const ser = item.titleSeries.toLowerCase();
          return shelfThemes.some(theme => {
            const t = theme.toLowerCase();
            return name.includes(t) || pub.includes(t) || ser.includes(t);
          });
        });
      }
    }

    setDisplayedBooks(result);
  }, [searchQuery, allBooks, shelfThemes, ignoreTheme]);

  const toggleSelection = (item: any) => {
    setSelectedBooks(prev => {
      const newSelected = { ...prev };
      if (newSelected[item.title_id]) {
        delete newSelected[item.title_id];
      } else {
        newSelected[item.title_id] = item;
      }
      return newSelected;
    });
  };

  const selectedArray = Object.values(selectedBooks);
  const totalSelectedWidth = selectedArray.reduce((sum, item) => sum + item.width_mm, 0);
  const isOverflow = totalSelectedWidth > freeWidth;

  const handleBulkAdd = async () => {
    if (selectedArray.length === 0 || !levelId) return;

    if (isOverflow) {
      Alert.alert(
        "Не влезает!", 
        `Свободно ${freeWidth} мм, а выбранные книги занимают ${totalSelectedWidth} мм.\n\nУберите лишние или выберите другую полку.`,
        [{ text: "ОК" }]
      );
      return;
    }

    const copyIdsToPlace = selectedArray.map(item => item.allIds[0]);

    const { error } = await supabase
      .from('copies')
      .update({ level_id: levelId, status: 'on_shelf' })
      .in('id', copyIdsToPlace);

    if (error) {
      Alert.alert("Ошибка базы", error.message);
    } else {
      Alert.alert("Успешно!", `На полку поставлено ${copyIdsToPlace.length} книг.`);
      navigation.goBack();
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={styles.title}>Выберите комиксы</Text>
        {shelfThemes.length > 0 && (
          <TouchableOpacity 
            style={[styles.themeBadge, ignoreTheme && { backgroundColor: '#ccc' }]} 
            onPress={() => setIgnoreTheme(!ignoreTheme)}
          >
            <Text style={styles.themeText}>
              {ignoreTheme ? 'Тема отключена' : `Тема: ${shelfThemes.join(', ')}`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      
      <Text style={styles.subtitle}>Свободно: {freeWidth} мм</Text>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color="#888" />
        <TextInput 
          style={styles.searchInput}
          placeholder="Поиск по названию, автору, издательству..."
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
          contentContainerStyle={{ paddingBottom: selectedArray.length > 0 ? 100 : 20 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 50 }}>
              <Text style={{ color: '#888', marginBottom: 10 }}>Ничего не найдено</Text>
              {shelfThemes.length > 0 && !ignoreTheme && (
                <TouchableOpacity onPress={() => setIgnoreTheme(true)} style={{ padding: 10, backgroundColor: '#e6f2ff', borderRadius: 8 }}>
                  <Text style={{ color: '#007AFF', fontWeight: 'bold' }}>Искать по всем книгам</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item }) => {
            const isSelected = !!selectedBooks[item.title_id];
            
            return (
              <TouchableOpacity 
                style={[styles.card, isSelected && { borderColor: '#007AFF', borderWidth: 2 }]}
                onPress={() => toggleSelection(item)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                  {isSelected && <Ionicons name="checkmark" size={16} color="white" />}
                </View>

                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.cardTitle}>{item.titleName}</Text>
                  <Text style={styles.cardSubtitle}>{item.titlePublisher || 'Без издательства'}</Text>
                  <Text style={styles.cardDetails}>{item.width_mm}×{item.height_mm} мм</Text>
                </View>
                
                <View style={styles.actions}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>×{item.count}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {selectedArray.length > 0 && (
        <View style={[styles.bulkPanel, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bulkTitle}>Выбрано: {selectedArray.length} шт.</Text>
            <Text style={[styles.bulkSubtitle, isOverflow && { color: '#e74c3c' }]}>
              Толщина: {totalSelectedWidth} мм {isOverflow && '(Не влезает!)'}
            </Text>
          </View>
          <TouchableOpacity 
            style={[styles.bulkBtn, isOverflow && { backgroundColor: '#ccc' }]} 
            onPress={handleBulkAdd}
          >
            <Text style={styles.bulkBtnText}>Поставить</Text>
          </TouchableOpacity>
        </View>
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
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#ccc', justifyContent: 'center', alignItems: 'center' },
  checkboxActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  cardSubtitle: { fontSize: 14, color: '#666', marginTop: 2 },
  cardDetails: { fontSize: 12, color: '#888', marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { backgroundColor: '#007AFF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
  bulkPanel: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'white', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, borderTopWidth: 1, borderColor: '#ddd', elevation: 10 },
  bulkTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  bulkSubtitle: { fontSize: 14, color: '#666', marginTop: 2 },
  bulkBtn: { backgroundColor: '#007AFF', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  bulkBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});