import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * ClinicalDisclaimer — Persistent, non-closeable banner.
 * Must appear on HomeScreen and every screen displaying vital signs data.
 * 
 * FDA General Wellness / COFEPRIS Clase I requirement.
 */
export function ClinicalDisclaimer() {
  const { tr } = useLanguage();

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>⚕️</Text>
      <Text style={styles.text}>{tr('disclaimer_banner')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 10,
    marginHorizontal: 16,
    marginTop: 8,
    alignItems: 'flex-start',
  },
  icon: {
    fontSize: 16,
    marginRight: 8,
    marginTop: 1,
  },
  text: {
    flex: 1,
    fontSize: 11,
    color: '#991B1B',
    lineHeight: 16,
    fontWeight: '500',
  },
});
