/**
 * Wejhetna App - React Native + FastAPI test connection (styled)
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

  const isError = backendStatus.toLowerCase().includes('error');
  const isLoading = backendStatus.toLowerCase().includes('load');

  const statusStyle = isError
    ? styles.statusError
    : isLoading
    ? styles.statusLoading
    : styles.statusOk;

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: safeAreaInsets.top,
          paddingBottom: safeAreaInsets.bottom,
        },
      ]}>
      <View style={styles.card}>
        <Text style={styles.logo}>🧭</Text>
        <Text style={styles.title}>Wejhetna</Text>
        <Text style={styles.subtitle}>Negev navigation & services</Text>

        <View style={styles.separator} />

        <Text style={styles.label}>Backend status</Text>
        <Text style={[styles.statusBase, statusStyle]}>{backendStatus}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#020617', // very dark background
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderRadius: 24,
    backgroundColor: '#0f172a', // dark blue
    elevation: 8, // Android shadow
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 8},
    alignItems: 'center',
  },
  logo: {
    fontSize: 40,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#e5e7eb',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#9ca3af',
    marginBottom: 20,
  },
  separator: {
    width: '60%',
    height: 1,
    backgroundColor: '#1f2937',
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    color: '#9ca3af',
    marginBottom: 6,
  },
  statusBase: {
    fontSize: 20,
    fontWeight: '700',
  },
  statusOk: {
    color: '#22c55e', // green
  },
  statusLoading: {
    color: '#fbbf24', // yellow
  },
  statusError: {
    color: '#f97373', // red
  },
});

export default App;
