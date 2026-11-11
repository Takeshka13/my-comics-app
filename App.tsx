import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

import MapScreen from './screens/MapScreen';
import ShelfScreen from './screens/ShelfScreen';
import LevelScreen from './screens/LevelScreen';
import AddToShelfScreen from './screens/AddToShelfScreen';
import CatalogScreen from './screens/CatalogScreen';
import ScannerScreen from './screens/ScannerScreen';
import StorageScreen from './screens/StorageScreen';
import SearchScreen from './screens/SearchScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: '#007AFF' }}>
      <Tab.Screen 
        name="MapTab" 
        component={MapScreen} 
        options={{ 
          title: 'Карта',
          tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} />
        }} 
      />
      <Tab.Screen 
        name="CatalogTab" 
        component={CatalogScreen} 
        options={{ 
          title: 'Каталог',
          tabBarIcon: ({ color, size }) => <Ionicons name="library" size={size} color={color} />
        }} 
      />
      <Tab.Screen 
  name="StorageTab" 
  component={StorageScreen} 
  options={{ 
    title: 'Склад',
    tabBarIcon: ({ color, size }) => <Ionicons name="cube" size={size} color={color} />
  }} 
/>
<Tab.Screen 
  name="SearchTab" 
  component={SearchScreen} 
  options={{ 
    title: 'Поиск',
    tabBarIcon: ({ color, size }) => <Ionicons name="search" size={size} color={color} />
  }} 
/>
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="Shelf" component={ShelfScreen} options={{ title: 'Стеллаж' }} />
            <Stack.Screen name="Level" component={LevelScreen} options={{ title: 'Полка' }} />
            <Stack.Screen name="AddToShelf" component={AddToShelfScreen} options={{ title: 'Выбор комикса' }} />
            <Stack.Screen name="Scanner" component={ScannerScreen} options={{ title: 'Сканер', headerShown: true }} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}