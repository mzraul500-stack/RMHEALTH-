import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, BackHandler, SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../contexts/LanguageContext';
import { logAuditEvent, AUDIT_EVENTS } from '../../services/AuditLogService';
import { COLORS, SPACING } from '../../theme';

const PRIVACY_KEY = '@rmhealth/privacy_accepted';

/**
 * PrivacyNoticeScreen — Shown on first launch only.
 * Blocks app access until accepted.
 * Compliant with LFPDPPP (Mexico) and GDPR-style data rights.
 */
export function PrivacyNoticeScreen({ onAccept }) {
  const { tr, language, toggleLanguage } = useLanguage();

  const handleAccept = async () => {
    const record = {
      accepted: true,
      timestamp: new Date().toISOString(),
      language,
      version: '1.0',
    };
    await AsyncStorage.setItem(PRIVACY_KEY, JSON.stringify(record));
    await logAuditEvent(AUDIT_EVENTS.PRIVACY_ACCEPTED, language, record);
    onAccept();
  };

  const handleDecline = () => {
    Alert.alert(
      tr('privacy_title'),
      tr('privacy_decline_message'),
      [{ text: 'OK', onPress: () => BackHandler.exitApp() }]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Language Toggle */}
        <TouchableOpacity style={styles.langButton} onPress={toggleLanguage}>
          <Text style={styles.langText}>{tr('language_switch')}</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{tr('privacy_title')}</Text>

        {/* Sections */}
        <Section label={tr('privacy_controller')} value={tr('privacy_controller_value')} />
        <Section label={tr('privacy_data_collected')} value={tr('privacy_data_collected_value')} />
        <Section label={tr('privacy_purpose')} value={tr('privacy_purpose_value')} />
        <Section label={tr('privacy_rights')} value={tr('privacy_rights_value')} />
        <Section label={tr('privacy_transfers')} value={tr('privacy_transfers_value')} />

        {/* Law reference */}
        <Text style={styles.lawRef}>{tr('privacy_law_reference')}</Text>

        {/* FDA/COFEPRIS bilingual line — ALWAYS both languages */}
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

      {/* Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.declineButton} onPress={handleDecline}>
          <Text style={styles.declineText}>{tr('privacy_decline')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.acceptButton} onPress={handleAccept}>
          <Text style={styles.acceptText}>{tr('privacy_accept')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function Section({ label, value }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Text style={styles.sectionValue}>{value}</Text>
    </View>
  );
}

/** Check if privacy has been accepted */
export async function isPrivacyAccepted() {
  try {
    const raw = await AsyncStorage.getItem(PRIVACY_KEY);
    return raw !== null;
  } catch { return false; }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: SPACING.lg, paddingBottom: 100 },
  langButton: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.surface,
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: 20, borderWidth: 1, borderColor: COLORS.border,
  },
  langText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  title: {
    fontSize: 26, fontWeight: '900', color: COLORS.text,
    marginVertical: SPACING.lg, letterSpacing: -0.5,
  },
  section: {
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: 12, padding: SPACING.md,
    borderLeftWidth: 4, borderLeftColor: COLORS.primary,
  },
  sectionLabel: {
    fontSize: 13, fontWeight: '800', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
  },
  sectionValue: { fontSize: 15, color: COLORS.text, lineHeight: 22 },
  lawRef: {
    fontSize: 12, color: '#64748B', fontStyle: 'italic',
    textAlign: 'center', marginVertical: SPACING.md,
  },
  fdaBox: {
    backgroundColor: '#FEF3C7', borderRadius: 12, padding: SPACING.md,
    borderWidth: 1, borderColor: '#F59E0B', marginVertical: SPACING.md,
  },
  fdaText: { fontSize: 13, fontWeight: '700', color: '#92400E', fontStyle: 'italic' },
  fdaRef: { fontSize: 11, color: '#B45309', marginTop: 2 },
  buttonRow: {
    flexDirection: 'row', padding: SPACING.md, paddingBottom: 30,
    borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.background,
  },
  declineButton: {
    flex: 1, padding: 16, borderRadius: 12, marginRight: 8,
    borderWidth: 2, borderColor: '#EF4444', alignItems: 'center',
  },
  declineText: { color: '#EF4444', fontWeight: '800', fontSize: 15 },
  acceptButton: {
    flex: 2, padding: 16, borderRadius: 12,
    backgroundColor: COLORS.primary, alignItems: 'center',
    elevation: 4, shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6,
  },
  acceptText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
});
