import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t, LANGUAGES } from '../i18n/translations';

const LANGUAGE_KEY = '@rmhealth_language';

const LanguageContext = createContext();

/**
 * LanguageProvider — Persists language selection across sessions.
 * Default: Spanish ('es')
 */
export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(LANGUAGES.ES);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    loadLanguage();
  }, []);

  const loadLanguage = async () => {
    try {
      const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
      if (saved && (saved === LANGUAGES.ES || saved === LANGUAGES.EN)) {
        setLanguageState(saved);
      }
    } catch (e) {
      console.error('[LanguageContext] Load failed:', e);
    } finally {
      setIsReady(true);
    }
  };

  const setLanguage = async (lang) => {
    try {
      await AsyncStorage.setItem(LANGUAGE_KEY, lang);
      setLanguageState(lang);
    } catch (e) {
      console.error('[LanguageContext] Save failed:', e);
    }
  };

  const toggleLanguage = () => {
    const next = language === LANGUAGES.ES ? LANGUAGES.EN : LANGUAGES.ES;
    setLanguage(next);
  };

  // Translation helper — returns the string for the current language
  const tr = (key) => {
    return (t[language] && t[language][key]) || (t.es[key]) || key;
  };

  return (
    <LanguageContext.Provider value={{
      language,
      setLanguage,
      toggleLanguage,
      tr,
      isReady,
      LANGUAGES,
    }}>
      {isReady ? children : null}
    </LanguageContext.Provider>
  );
}

/**
 * Hook to access the language context
 */
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
