/**
 * Wejhetna App - React Native + FastAPI test connection \
 * try 2 
 * try 2 567
 */

import React, {useEffect, useState} from 'react';
import {
  StatusBar,
  StyleSheet,
  useColorScheme,
  View,
  Text,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const safeAreaInsets = useSafeAreaInsets();
  const [backendStatus, setBackendStatus] = useState<string>('Loading...');

  useEffect(() => {
    const fetchBackendStatus = async () => {
      try {
        // באמולטור אנדרואיד, localhost של המחשב הוא 10.0.2.2
        const response = await fetch('http://10.0.2.2:8000/health');
        const json = await response.json();
        setBackendStatus(json.status ?? 'Unknown');
      } catch (error) {
        console.error('Error connecting to backend:', error);
        setBackendStatus('Error connecting to backend');
      }
    };

    fetchBackendStatus();
  }, []);

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: safeAreaInsets.top,
          paddingBottom: safeAreaInsets.bottom,
        },
      ]}>
      <Text style={styles.title}>Wejhetna App</Text>
      <Text style={styles.label}>Backend status:</Text>
      <Text style={styles.status}>{backendStatus}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
  },
  label: {
    fontSize: 18,
    marginBottom: 8,
  },
  status: {
    fontSize: 20,
    fontWeight: '600',
  },
});

export default App;
