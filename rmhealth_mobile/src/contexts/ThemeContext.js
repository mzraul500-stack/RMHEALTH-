import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

const THEME_KEY = '@rmhealth_high_contrast';

const ThemeContext = createContext();

export const BRAND_COLORS = {
  primary: '#1B7A6E',    // Teal
  secondary: '#115E59',  // Darker Teal
  accent: '#E67E22',     // Orange
  background: '#F8FAFC', // Off-white
  surface: '#FFFFFF',    // Pure white
  text: '#1E293B',       // Slate dark
  textMuted: '#64748B',  // Slate muted
  border: '#E2E8F0',     // Light border
  error: '#EF4444',      // Red
  success: '#10B981',    // Green
  warning: '#F59E0B',    // Yellow/Orange
  navInactive: '#0F172A',
};

export const HIGH_CONTRAST_COLORS = {
  primary: '#000000',
  secondary: '#000000',
  accent: '#000000',
  background: '#FFFFFF',
  surface: '#FFFFFF',
  text: '#000000',
  textMuted: '#000000',
  border: '#000000',
  error: '#000000',
  success: '#000000',
  warning: '#000000',
  navInactive: '#000000',
};

export function ThemeProvider({ children }) {
  const [isHighContrast, setIsHighContrast] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    try {
      const saved = await AsyncStorage.getItem(THEME_KEY);
      if (saved === 'true') {
        setIsHighContrast(true);
      }
    } catch (e) {
      console.error('[ThemeContext] Load failed:', e);
    } finally {
      setIsReady(true);
    }
  };

  const toggleHighContrast = async () => {
    try {
      const next = !isHighContrast;
      await AsyncStorage.setItem(THEME_KEY, String(next));
      setIsHighContrast(next);
    } catch (e) {
      console.error('[ThemeContext] Save failed:', e);
    }
  };

  const colors = isHighContrast ? HIGH_CONTRAST_COLORS : BRAND_COLORS;

  return (
    <ThemeContext.Provider value={{
      isHighContrast,
      toggleHighContrast,
      colors,
      isReady,
    }}>
      {isReady ? children : null}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
