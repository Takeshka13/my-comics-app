import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase'; // <-- ДОБАВЛЕН ИМПОРТ

const GOOGLE_BOOKS_API_KEY = 'ТВОЙ_КЛЮЧ_СЮДА'; // ВСТАВЬ СВОЙ КЛЮЧ

export default function ScannerScreen() {
  const navigation = useNavigation<any>();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');

  useEffect(() => {
    const getCameraPermissions = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    };
    getCameraPermissions();
  }, []);

  const searchGoogleBooks = async (isbn: string) => {
    try {
      setStatusText('Ищем в Google Books...');
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&key=${GOOGLE_BOOKS_API_KEY}`);
      const json = await res.json();
      
      if (json.items && json.items.length > 0) {
        const book = json.items[0].volumeInfo;
        const volumeMatch = book.title?.match(/(?:Vol\.?|Том)\s*(\d+)/i) || book.title?.match(/(\d+)$/);
        
        return {
          name: book.title + (book.subtitle ? `: ${book.subtitle}` : ''),
          publisher: book.publisher || '',
          cover: book.imageLinks?.thumbnail || '',
          author: book.authors ? book.authors.join(', ') : '',
          series: book.seriesInfo?.shortSeriesName || '',
          volume: volumeMatch ? parseInt(volumeMatch[1]) : null,
        };
      }
    } catch (e) {
      console.log("Google Books error", e);
    }
    return null;
  };

  const searchOpenLibrary = async (isbn: string) => {
    try {
      setStatusText('Ищем в Open Library...');
      const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
      const json = await res.json();
      const book = json[`ISBN:${isbn}`];
      if (book) {
        return {
          name: book.title || '',
          publisher: book.publishers?.[0]?.name || '',
          cover: book.cover?.medium || book.cover?.small || '',
          author: book.authors?.map((a: any) => a.name).join(', ') || '',
          series: '',
          volume: null,
        };
      }
    } catch (e) {
      console.log("OpenLibrary error", e);
    }
    return null;
  };

  const getDirectCover = (isbn: string) => {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    setScanned(true);
    setLoading(true);
    setStatusText('Проверяем базу...');

    // ПРОВЕРКА НА ДУБЛИКАТ
    const { data: existingTitle } = await supabase
      .from('titles')
      .select('id, name')
      .eq('isbn', data)
      .maybeSingle();

    if (existingTitle) {
      setLoading(false);
      Alert.alert(
        "Книга уже в базе",
        `«${existingTitle.name}» уже добавлена.\n\nПерейти в её карточку?`,
        [
          { text: "Отмена", style: "cancel", onPress: () => setScanned(false) },
          { text: "Перейти", onPress: () => {
              navigation.navigate('Main', {
                screen: 'CatalogTab',
                params: { openTitleId: existingTitle.id }
              });
          }}
        ]
      );
      return;
    }

    // ЕСЛИ НЕТ, ИЩЕМ В ИНТЕРНЕТЕ
    let bookInfo = await searchGoogleBooks(data);
    if (!bookInfo) bookInfo = await searchOpenLibrary(data);
    if (bookInfo && !bookInfo.cover) bookInfo.cover = getDirectCover(data);

    setLoading(false);

    if (bookInfo) {
      navigation.navigate('Main', {
        screen: 'CatalogTab',
        params: {
          scannedData: {
            isbn: data,
            name: bookInfo.name || '',
            publisher: bookInfo.publisher || '',
            cover: bookInfo.cover || '',
            author: bookInfo.author || '',
            series: bookInfo.series || '',
            volume: bookInfo.volume || null,
            width: null, height: null, depth: null,
          }
        }
      });
    } else {
      Alert.alert(
        "Книга не найдена", 
        `Штрихкод (ISBN): ${data}\nНет данных в базах. Добавим вручную?`,
        [{ text: "ОК", onPress: () => {
            navigation.navigate('Main', {
              screen: 'CatalogTab',
              params: {
                scannedData: { isbn: data, name: '', publisher: '', cover: '', width: null, height: null, depth: null, author: '', series: '', volume: null }
              }
            });
        }}]
      );
    }
  };

  if (hasPermission === null) return <View style={styles.center}><Text>Запрос доступа к камере...</Text></View>;
  if (hasPermission === false) return <View style={styles.center}><Text>Нет доступа к камере</Text></View>;

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a"] }}
      />
      
      <View style={styles.overlay}>
        <View style={styles.scanArea} />
        <Text style={styles.hint}>Наведите камеру на штрихкод (ISBN)</Text>
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="white" />
          <Text style={{ color: 'white', marginTop: 10 }}>{statusText}</Text>
        </View>
      )}

      {scanned && !loading && (
        <TouchableOpacity style={styles.rescanBtn} onPress={() => setScanned(false)}>
          <Ionicons name="camera-reverse" size={24} color="white" />
          <Text style={styles.rescanText}>Сканировать снова</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  scanArea: { width: 250, height: 150, borderWidth: 2, borderColor: '#00FF00', borderRadius: 12, backgroundColor: 'rgba(0,255,0,0.1)' },
  hint: { color: 'white', marginTop: 20, fontSize: 16, fontWeight: 'bold' },
  rescanBtn: { position: 'absolute', bottom: 50, alignSelf: 'center', backgroundColor: '#007AFF', flexDirection: 'row', padding: 16, borderRadius: 30, alignItems: 'center' },
  rescanText: { color: 'white', fontWeight: 'bold', marginLeft: 8 }
});