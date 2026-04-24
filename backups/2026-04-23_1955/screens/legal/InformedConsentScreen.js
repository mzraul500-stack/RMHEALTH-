import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../contexts/LanguageContext';
import { logAuditEvent, AUDIT_EVENTS } from '../../services/AuditLogService';
import { COLORS, SPACING } from '../../theme';

const CONSENT_KEY = '@rmhealth/informed_consent';

export function InformedConsentScreen({ onAccept }) {
  const { tr, language, toggleLanguage } = useLanguage();
  const [fullName, setFullName] = useState('');
  const [checked, setChecked] = useState(false);

  const handleSign = async () => {
    if (!fullName.trim()) {
      Alert.alert(tr('consent_title'), language === 'es'
        ? 'Debe ingresar su nombre completo.'
        : 'You must enter your full name.');
      return;
    }
    if (!checked) {
      Alert.alert(tr('consent_title'), language === 'es'
        ? 'Debe aceptar el consentimiento informado.'
        : 'You must accept the informed consent.');
      return;
    }

    const record = {
      fullName: fullName.trim(),
      accepted: true,
      timestamp: new Date().toISOString(),
      language,
      version: '1.0',
    };
    await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify(record));
    await logAuditEvent(AUDIT_EVENTS.CONSENT_ACCEPTED, language, record);
    onAccept();
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity style={styles.langButton} onPress={toggleLanguage}>
          <Text style={styles.langText}>{tr('language_switch')}</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{tr('consent_title')}</Text>
        <Text style={styles.intro}>{tr('consent_intro')}</Text>

        <InfoCard icon="📋" title={tr('consent_data_what')} body={tr('consent_data_what_value')} />
        <InfoCard icon="📊" title={tr('consent_data_why')} body={tr('consent_data_why_value')} />
        <InfoCard icon="✍️" title={tr('consent_self_reported')} body={tr('consent_self_reported_value')} />
        <InfoCard icon="🏥" title={tr('consent_not_medical')} body={tr('consent_not_medical_value')} />

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

        {/* Digital Signature */}
        <View style={styles.signatureSection}>
          <Text style={styles.signatureLabel}>{tr('consent_signature_label')}</Text>
          <TextInput
            style={styles.signatureInput}
            value={fullName}
            onChangeText={setFullName}
            placeholder={tr('consent_signature_placeholder')}
            placeholderTextColor="#94A3B8"
            autoCapitalize="words"
          />

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setChecked(!checked)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
              {checked && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>{tr('consent_checkbox')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <TouchableOpacity
        style={[styles.signButton, (!fullName.trim() || !checked) && styles.signButtonDisabled]}
        onPress={handleSign}
        disabled={!fullName.trim() || !checked}
      >
        <Text style={styles.signText}>{tr('consent_accept')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function InfoCard({ icon, title, body }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardIcon}>{icon}</Text>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardBody}>{body}</Text>
      </View>
    </View>
  );
}

export async function isConsentGiven() {
  try {
    const raw = await AsyncStorage.getItem(CONSENT_KEY);
    return raw !== null;
  } catch { return false; }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: SPACING.lg, paddingBottom: 120 },
  langButton: {
    alignSelf: 'flex-end', backgroundColor: COLORS.surface,
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: 20, borderWidth: 1, borderColor: COLORS.border,
  },
  langText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  title: { fontSize: 26, fontWeight: '900', color: COLORS.text, marginTop: SPACING.lg, letterSpacing: -0.5 },
  intro: { fontSize: 15, color: '#64748B', marginVertical: SPACING.md, lineHeight: 22 },
  card: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    borderRadius: 12, padding: SPACING.md, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardIcon: { fontSize: 24, marginRight: 12, marginTop: 2 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  cardBody: { fontSize: 13, color: '#64748B', lineHeight: 20 },
  fdaBox: {
    backgroundColor: '#FEF3C7', borderRadius: 12, padding: SPACING.md,
    borderWidth: 1, borderColor: '#F59E0B', marginVertical: SPACING.md,
  },
  fdaText: { fontSize: 13, fontWeight: '700', color: '#92400E', fontStyle: 'italic' },
  fdaRef: { fontSize: 11, color: '#B45309', marginTop: 2 },
  signatureSection: {
    marginTop: SPACING.lg, backgroundColor: COLORS.surface,
    borderRadius: 12, padding: SPACING.lg,
    borderWidth: 2, borderColor: COLORS.primary,
  },
  signatureLabel: {
    fontSize: 13, fontWeight: '800', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  signatureInput: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    padding: 14, fontSize: 18, fontWeight: '600', color: COLORS.text,
    fontStyle: 'italic', backgroundColor: '#F8FAFC',
  },
  checkboxRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: SPACING.md,
  },
  checkbox: {
    width: 26, height: 26, borderRadius: 6, borderWidth: 2,
    borderColor: COLORS.border, marginRight: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkmark: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  checkboxLabel: { flex: 1, fontSize: 14, color: COLORS.text, lineHeight: 20 },
  signButton: {
    margin: SPACING.md, padding: 16, borderRadius: 14,
    backgroundColor: COLORS.primary, alignItems: 'center',
    elevation: 4,
  },
  signButtonDisabled: { opacity: 0.4 },
  signText: { color: '#FFF', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
});
