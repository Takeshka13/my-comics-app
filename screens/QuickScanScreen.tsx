import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

export default function QuickScanScreen() {
  const navigation = useNavigation<any>();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanMode, setScanMode] = useState<'book' | 'shelf'>('book');
  const [scannedBook, setScannedBook] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('Наведите на штрихкод книги');

  useEffect(() => {
    const getCameraPermissions = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    };
    getCameraPermissions();
  }, []);

  const handleBarCodeScanned = async ({ data, type }: { data: string, type: string }) => {
    // 1. РЕЖИМ СКАНИРОВАНИЯ КНИГИ
    if (scanMode === 'book' && (type === 'ean13' || type === 'ean8')) {
      setLoading(true);
      setStatusText('Ищем книгу в базе...');

      const { data: titleData } = await supabase.from('titles').select('*').eq('isbn', data).maybeSingle();

      if (!titleData) {
        setLoading(false);
        Alert.alert("Книга не найдена", `ISBN: ${data}\nСначала добавьте её в каталог (вкладка Каталог).`);
        return;
      }

      const { data: copyData } = await supabase.from('copies').select('id').eq('title_id', titleData.id).is('level_id', null).limit(1).maybeSingle();

      let copyIdToUse = copyData?.id;

      // Если свободных нет, создаем новый экземпляр
      if (!copyIdToUse) {
        const { data: newCopy, error } = await supabase.from('copies').insert([{
          title_id: titleData.id,
          width_mm: titleData.default_width_mm || 15,
          height_mm: titleData.default_height_mm || 250,
          depth_mm: titleData.default_depth_mm || 15,
          status: 'storage'
        }]).select().single();

        if (error || !newCopy) {
          Alert.alert("Ошибка", "Не удалось создать экземпляр книги");
          setLoading(false);
          return;
        }
        copyIdToUse = newCopy.id;
      }

      // Безопасно сохраняем (copyIdToUse теперь точно строка)
      if (copyIdToUse) {
        setScannedBook({ title: titleData, copyId: copyIdToUse });
        setScanMode('shelf');
        setStatusText('Теперь наведите на QR-код полки');
      }
      setLoading(false);
    }

    // 2. РЕЖИМ СКАНИРОВАНИЯ ПОЛКИ
    else if (scanMode === 'shelf' && type === 'qr') {
      setLoading(true);
      setStatusText('Проверяем полку...');
      const levelId = data;

      const { data: levelData } = await supabase.from('levels').select('*').eq('id', levelId).single();
      if (!levelData) {
        Alert.alert("Ошибка", "Полка не найдена в базе");
        setLoading(false);
        setScanMode('book');
        return;
      }

      const { data: copiesOnShelf } = await supabase.from('copies').select('width_mm, title_id').eq('level_id', levelId);
      
      const usedWidth = copiesOnShelf?.reduce((sum, c) => sum + (c.width_mm || 0), 0) || 0;
      const freeWidth = levelData.width_mm - usedWidth;
      const isAlreadyOnShelf = copiesOnShelf?.some(c => c.title_id === scannedBook.title.id);
      
      if (!isAlreadyOnShelf && scannedBook.title.default_width_mm > freeWidth) {
        Alert.alert("Не влезает!", `Свободно ${freeWidth} мм, а книга ${scannedBook.title.default_width_mm} мм.`);
        setScanMode('book'); setScannedBook(null); setStatusText('Наведите на штрихкод книги'); setLoading(false);
        return;
      }

      if (levelData.reserved_theme && Array.isArray(levelData.reserved_theme) && levelData.reserved_theme.length > 0) {
        const pub = scannedBook.title.publisher?.toLowerCase() || '';
        const ser = scannedBook.title.series?.toLowerCase() || '';
        const matches = levelData.reserved_theme.some((t: string) => pub.includes(t.toLowerCase()) || ser.includes(t.toLowerCase()));
        if (!matches) {
          Alert.alert("Не та тема!", `Эта полка зарезервирована под: ${levelData.reserved_theme.join(', ')}`);
          setScanMode('book'); setScannedBook(null); setLoading(false);
          return;
        }
      }

      await supabase.from('copies').update({ level_id: levelId, status: 'on_shelf' }).eq('id', scannedBook.copyId);
      Alert.alert("Успешно!", `«${scannedBook.title.name}» поставлена на полку №${levelData.position}.`);
      
      setScannedBook(null); setScanMode('book'); setStatusText('Наведите на штрихкод следующей книги'); setLoading(false);
    }
  };

  if (hasPermission === null) return <View style={styles.center}><Text>Запрос доступа к камере...</Text></View>;
  if (hasPermission === false) return <View style={styles.center}><Text>Нет доступа к камере</Text></View>;

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        onBarcodeScanned={loading ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "qr"] }}
      />
      <View style={styles.overlay}>
        <View style={[styles.scanArea, scanMode === 'shelf' && { borderColor: '#FFD700' }]} />
        <View style={styles.statusContainer}>
          <Text style={styles.hint}>{statusText}</Text>
          {scannedBook && <Text style={styles.scannedName}>Книга: {scannedBook.title.name}</Text>}
        </View>
      </View>
      {loading && <View style={styles.loadingOverlay}><ActivityIndicator size="large" color="white" /></View>}
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Ionicons name="close" size={30} color="white" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  scanArea: { width: 250, height: 250, borderWidth: 4, borderColor: '#00FF00', borderRadius: 20 },
  statusContainer: { position: 'absolute', top: 100, backgroundColor: 'rgba(0,0,0,0.7)', padding: 16, borderRadius: 12, alignItems: 'center' },
  hint: { color: 'white', fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  scannedName: { color: '#FFD700', fontSize: 16, marginTop: 8, fontWeight: 'bold' },
  backBtn: { position: 'absolute', top: 50, left: 20, backgroundColor: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 20 },
});