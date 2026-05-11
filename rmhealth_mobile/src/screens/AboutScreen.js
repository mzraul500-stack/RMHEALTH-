import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useLanguage } from '../contexts/LanguageContext';
import { ClinicalDisclaimer } from '../components/ClinicalDisclaimer';
import { COLORS, SPACING } from '../theme';
import { APP_VERSION, APP_BUILD_TAG } from '../config/appVersion';

/**
 * AboutScreen — Regulatory-compliant app information.
 * Shows classification, registration, and regulatory references.
 */
export function AboutScreen() {
  const { tr, language, toggleLanguage } = useLanguage();

  const rows = [
    { label: tr('about_name'), value: 'RmHealth' },
    { label: tr('about_version'), value: APP_VERSION },
    { label: tr('about_developer'), value: 'Raúl Morales Zepeda' },
    { label: tr('about_contact'), value: 'rmlive@rmhealth.ai' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.langButton} onPress={toggleLanguage}>
        <Text style={styles.langText}>{tr('language_switch')}</Text>
      </TouchableOpacity>

      <View style={styles.logoContainer}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>RM</Text>
        </View>
        <Text style={styles.appName}>RmHealth</Text>
        <Text style={styles.appTag}>{APP_BUILD_TAG}</Text>
      </View>

      {rows.map(({ label, value }) => (
        <View key={label} style={styles.row}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue}>{value}</Text>
        </View>
      ))}

      {/* FDA/COFEPRIS — always both languages */}
      <View style={styles.fdaBox}>
        <Text style={styles.fdaText}>
          "This application is not intended to diagnose, treat, cure, or prevent any disease."
        </Text>
        <Text style={styles.fdaRef}>— FDA General Wellness: Policy for Low Risk Devices</Text>
        <Text style={[styles.fdaText, { marginTop: 8 }]}>
          "Esta aplicación no está destinada a diagnosticar, tratar, curar ni prevenir ninguna enfermedad."
        </Text>
        <Text style={styles.fdaRef}>— Política de Bienestar General FDA / COFEPRIS Clase I</Text>
      </View>

      {/* Clinical Disclaimer */}
      <View style={{ marginTop: SPACING.md }}>
        <ClinicalDisclaimer />
      </View>

      <Text style={styles.copyright}>
        © 2025-2026 Raúl Morales Zepeda. Todos los derechos reservados.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, paddingBottom: 100 },
  langButton: {
    alignSelf: 'flex-end', backgroundColor: COLORS.surface,
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: 20, borderWidth: 1, borderColor: COLORS.border,
  },
  langText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  logoContainer: { alignItems: 'center', marginVertical: SPACING.xl },
  logo: {
    width: 80, height: 80, borderRadius: 20,
    backgroundColor: COLORS.primary, justifyContent: 'center',
    alignItems: 'center', marginBottom: SPACING.sm,
  },
  logoText: { color: '#FFF', fontSize: 32, fontWeight: '900' },
  appName: { fontSize: 28, fontWeight: '900', color: COLORS.text },
  appTag: { fontSize: 14, color: '#64748B', fontWeight: '600' },
  row: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  rowLabel: { fontSize: 14, fontWeight: '700', color: '#64748B', flex: 1 },
  rowValue: { fontSize: 14, fontWeight: '600', color: COLORS.text, flex: 1.5, textAlign: 'right' },
  fdaBox: {
    backgroundColor: '#FEF3C7', borderRadius: 12, padding: SPACING.md,
    borderWidth: 1, borderColor: '#F59E0B', marginTop: SPACING.xl,
  },
  fdaText: { fontSize: 13, fontWeight: '700', color: '#92400E', fontStyle: 'italic' },
  fdaRef: { fontSize: 11, color: '#B45309', marginTop: 2 },
  copyright: {
    fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: SPACING.xl,
  },
});
