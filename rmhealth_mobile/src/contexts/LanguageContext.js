import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t, LANGUAGES } from '../i18n/translations';

import * as Localization from 'expo-localization';

const LANGUAGE_KEY = '@rmhealth_language';

const LanguageContext = createContext();

/**
 * LanguageProvider — Persists language selection across sessions.
 * Default: Detects device language (ES/EN)
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
      } else {
        // Auto-detect device language — defensive multi-fallback
        // expo-localization API varies by version; try each method safely
        let detectedLang = 'es'; // safe default
        try {
          // Method 1: getLocales() — expo-localization >= 14
          if (typeof Localization.getLocales === 'function') {
            const locales = Localization.getLocales();
            if (locales && locales.length > 0) {
              const locale = locales[0];
              // languageTag = "en-US", languageCode = "en"
              const code = locale.languageCode
                ?? locale.languageTag?.split('-')[0]
                ?? locale.locale?.split('-')[0];
              if (code) detectedLang = code.toLowerCase();
            }
          }
          // Method 2: Localization.locale (deprecated but always safe)
          else if (Localization.locale) {
            detectedLang = Localization.locale.split('-')[0].toLowerCase();
          }
        } catch (locErr) {
          console.warn('[LanguageContext] Locale detection failed, defaulting to ES:', locErr.message);
        }
        setLanguageState(detectedLang === 'en' ? LANGUAGES.EN : LANGUAGES.ES);
      }
    } catch (e) {
      console.error('[LanguageContext] Load failed:', e);
      // Always recover — never leave app in broken state
      setLanguageState(LANGUAGES.ES);
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
