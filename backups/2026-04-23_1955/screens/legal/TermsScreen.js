import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../contexts/LanguageContext';
import { logAuditEvent, AUDIT_EVENTS } from '../../services/AuditLogService';
import { COLORS, SPACING } from '../../theme';

const TERMS_KEY = '@rmhealth/terms_accepted';

export function TermsScreen({ onAccept }) {
  const { tr, language, toggleLanguage } = useLanguage();

  const handleAccept = async () => {
    const record = {
      accepted: true,
      timestamp: new Date().toISOString(),
      language,
      version: '1.0',
    };
    await AsyncStorage.setItem(TERMS_KEY, JSON.stringify(record));
    await logAuditEvent(AUDIT_EVENTS.TERMS_ACCEPTED, language, record);
    onAccept();
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity style={styles.langButton} onPress={toggleLanguage}>
          <Text style={styles.langText}>{tr('language_switch')}</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{tr('terms_title')}</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{tr('terms_version')}: 1.0</Text>
          <Text style={styles.metaText}>{tr('terms_date')}: {new Date().toLocaleDateString()}</Text>
        </View>
        <Text style={styles.metaText}>{tr('terms_jurisdiction')}</Text>

        <View style={styles.bodyContainer}>
          <Text style={styles.bodyText}>{tr('terms_body')}</Text>
        </View>

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
      </ScrollView>

      <TouchableOpacity style={styles.acceptButton} onPress={handleAccept}>
        <Text style={styles.acceptText}>{tr('terms_accept')}</Text>
      </TouchableOpacity>
    </View>
  );
}

export async function isTermsAccepted() {
  try {
    const raw = await AsyncStorage.getItem(TERMS_KEY);
    return raw !== null;
  } catch { return false; }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: SPACING.lg, paddingBottom: 100 },
  langButton: {
    alignSelf: 'flex-end', backgroundColor: COLORS.surface,
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: 20, borderWidth: 1, borderColor: COLORS.border,
  },
  langText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  title: {
    fontSize: 26, fontWeight: '900', color: COLORS.text,
    marginVertical: SPACING.lg, letterSpacing: -0.5,
  },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  metaText: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  bodyContainer: {
    marginTop: SPACING.lg, backgroundColor: COLORS.surface,
    borderRadius: 12, padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  bodyText: { fontSize: 14, color: COLORS.text, lineHeight: 24 },
  fdaBox: {
    backgroundColor: '#FEF3C7', borderRadius: 12, padding: SPACING.md,
    borderWidth: 1, borderColor: '#F59E0B', marginTop: SPACING.lg,
  },
  fdaText: { fontSize: 13, fontWeight: '700', color: '#92400E', fontStyle: 'italic' },
  fdaRef: { fontSize: 11, color: '#B45309', marginTop: 2 },
  acceptButton: {
    margin: SPACING.md, padding: 16, borderRadius: 14,
    backgroundColor: COLORS.primary, alignItems: 'center',
    elevation: 4,
  },
  acceptText: { color: '#FFF', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
});
