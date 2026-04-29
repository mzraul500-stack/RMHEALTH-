/**
 * ConsentOnboardingScreen — Granular Consent (M2)
 *
 * 5 independent consent toggles with clear descriptions.
 * Each stored individually with: user_id, type, accepted, timestamp, version.
 *
 * Regulatory basis:
 * - GDPR Art. 7: Specific, informed, freely given consent
 * - LFPDPPP Art. 8-9: Consent for sensitive data
 * - NOM-024-SSA3: Patient data authorization
 *
 * © 2025 MORALES ZEPEDA RAUL | Registro INDAUTOR: 03-2025-070109072500-01
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { logAuditEvent, AUDIT_EVENTS } from '../../services/AuditLogService';
import { COLORS, SPACING } from '../../theme';
import { Activity, MapPin, Pill, UserCheck, TrendingUp, Shield, Check } from 'lucide-react-native';

const ICON_MAP = {
  vital_signs: Activity,
  location: MapPin,
  medications: Pill,
  emergency_contacts: UserCheck,
  analytics: TrendingUp,
};

const CONSENT_VERSION = '1.0';

const CONSENT_ITEMS = [
  {
    key: 'vital_signs',
    icon: 'vital_signs',
    required: true,
    titleEs: 'Signos Vitales',
    titleEn: 'Vital Signs',
    descEs: 'Almacenar y procesar tus signos vitales (frecuencia cardíaca, SpO₂, presión arterial, glucosa, temperatura) para generar análisis de patrones.',
    descEn: 'Store and process your vital signs (heart rate, SpO₂, blood pressure, glucose, temperature) to generate pattern analysis.',
  },
  {
    key: 'location',
    icon: 'location',
    required: false,
    titleEs: 'Ubicación para Emergencias',
    titleEn: 'Location for Emergencies',
    descEs: 'Usar tu ubicación GPS cuando se detecte una emergencia para enviar coordenadas al servicio de auxilio más cercano.',
    descEn: 'Use your GPS location when an emergency is detected to send coordinates to the nearest emergency service.',
  },
  {
    key: 'medications',
    icon: 'medications',
    required: false,
    titleEs: 'Historial de Medicamentos',
    titleEn: 'Medication History',
    descEs: 'Almacenar tus medicamentos, dosis y horarios para recordatorios y verificar interacciones.',
    descEn: 'Store your medications, doses and schedules for reminders and to check interactions.',
  },
  {
    key: 'emergency_contacts',
    icon: 'emergency_contacts',
    required: false,
    titleEs: 'Contactos de Emergencia',
    titleEn: 'Emergency Contacts',
    descEs: 'Compartir datos de emergencia con las personas que designes como contactos de emergencia.',
    descEn: 'Share emergency data with the people you designate as emergency contacts.',
  },
  {
    key: 'analytics',
    icon: 'analytics',
    required: false,
    titleEs: 'Análisis de Tendencias',
    titleEn: 'Trend Analysis',
    descEs: 'Analizar tus datos históricos para detectar patrones y generar recomendaciones personalizadas de bienestar.',
    descEn: 'Analyze your historical data to detect patterns and generate personalized wellness recommendations.',
  },
];

export function ConsentOnboardingScreen({ onComplete }) {
  const { language } = useLanguage();
  const { accessToken, user } = useAuth();
  const insets = useSafeAreaInsets();
  const [consents, setConsents] = useState(() => {
    const initial = {};
    CONSENT_ITEMS.forEach(item => {
      initial[item.key] = item.required; // required ones start ON
    });
    return initial;
  });
  const [saving, setSaving] = useState(false);

  const isEs = language === 'es';

  const toggle = (key, required) => {
    if (required) {
      Alert.alert(
        isEs ? 'Consentimiento Requerido' : 'Required Consent',
        isEs
          ? 'Este consentimiento es necesario para usar la funcionalidad principal de RmHealth.'
          : 'This consent is required to use the main functionality of RmHealth.',
      );
      return;
    }
    setConsents(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    if (!consents.vital_signs) {
      Alert.alert(
        isEs ? 'Consentimiento Requerido' : 'Required Consent',
        isEs
          ? 'Debes aceptar el procesamiento de signos vitales para continuar.'
          : 'You must accept vital signs processing to continue.',
      );
      return;
    }

    setSaving(true);
    try {
      const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL
        || 'https://rmhealth-api-292048010515.us-central1.run.app/api';

      const response = await fetch(`${API_BASE}/consents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          consents,
          text_version: CONSENT_VERSION,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      await logAuditEvent('CONSENTS_SAVED', language, {
        consents,
        version: CONSENT_VERSION,
      });

      onComplete();
    } catch (e) {
      console.error('[Consent] Save failed:', e);
      Alert.alert(
        'Error',
        isEs
          ? 'No se pudieron guardar los consentimientos. Intenta de nuevo.'
          : 'Could not save consents. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[s.safe, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: 100 + insets.bottom }]}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerIconWrap}>
            <Shield size={36} color="#1B7A6E" strokeWidth={2} />
          </View>
          <Text style={s.title}>
            {isEs ? 'Permisos de Datos' : 'Data Permissions'}
          </Text>
          <Text style={s.subtitle}>
            {isEs
              ? 'Elige qué datos deseas que RmHealth procese. Puedes cambiar estas opciones en cualquier momento desde Configuración.'
              : 'Choose which data you want RmHealth to process. You can change these options at any time from Settings.'}
          </Text>
        </View>

        {/* Consent Items */}
        {CONSENT_ITEMS.map((item) => (
          <View key={item.key} style={[s.card, consents[item.key] && s.cardActive]}>
            <View style={s.cardHeader}>
              <View style={s.cardIconWrap}>
                {React.createElement(ICON_MAP[item.icon] || Activity, { size: 24, color: '#1B7A6E', strokeWidth: 2 })}
              </View>
              <View style={s.cardInfo}>
                <View style={s.cardTitleRow}>
                  <Text style={s.cardTitle}>
                    {isEs ? item.titleEs : item.titleEn}
                  </Text>
                  {item.required && (
                    <View style={s.requiredBadge}>
                      <Text style={s.requiredText}>
                        {isEs ? 'Requerido' : 'Required'}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={s.cardDesc}>
                  {isEs ? item.descEs : item.descEn}
                </Text>
              </View>
              <Switch
                value={consents[item.key]}
                onValueChange={() => toggle(item.key, item.required)}
                trackColor={{ false: '#E2E8F0', true: COLORS.primary + '60' }}
                thumbColor={consents[item.key] ? COLORS.primary : '#94A3B8'}
                ios_backgroundColor="#E2E8F0"
                accessibilityLabel={isEs ? item.titleEs : item.titleEn}
              />
            </View>
          </View>
        ))}

        {/* Legal note */}
        <View style={s.legalBox}>
          <Text style={s.legalText}>
            {isEs
              ? 'Conforme a LFPDPPP Art. 8, GDPR Art. 7 y NOM-024-SSA3. Puedes revocar cualquier consentimiento desde Configuración → Privacidad.'
              : 'Pursuant to LFPDPPP Art. 8, GDPR Art. 7 and NOM-024-SSA3. You can revoke any consent from Settings → Privacy.'}
          </Text>
        </View>
      </ScrollView>

      {/* Save button */}
      <TouchableOpacity
        style={[s.saveBtn, { marginBottom: insets.bottom + 16 }, saving && s.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
        accessibilityLabel={isEs ? 'Guardar permisos' : 'Save permissions'}
        accessibilityRole="button"
      >
        {saving ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Check size={20} color="#FFF" strokeWidth={3} style={{ marginRight: 8 }} />
            <Text style={s.saveBtnText}>
              {isEs ? 'Guardar y Continuar' : 'Save and Continue'}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20 },

  header: { alignItems: 'center', marginBottom: 24 },
  headerIconWrap: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#E0F2F1',
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  title: {
    fontSize: 26, fontWeight: '900', color: COLORS.secondary,
    letterSpacing: -0.5, textAlign: 'center',
  },
  subtitle: {
    fontSize: 14, color: '#64748B', textAlign: 'center',
    lineHeight: 20, marginTop: 8, paddingHorizontal: 10,
  },

  card: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 16,
    marginBottom: 12, borderWidth: 1.5, borderColor: COLORS.border,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4,
  },
  cardActive: {
    borderColor: COLORS.primary + '50',
    backgroundColor: COLORS.primary + '06',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
  },
  cardIconWrap: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: '#E0F2F1',
    justifyContent: 'center', alignItems: 'center', marginRight: 12, marginTop: 2,
  },
  cardInfo: { flex: 1, marginRight: 8 },
  cardTitleRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16, fontWeight: '800', color: COLORS.secondary,
  },
  requiredBadge: {
    backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 8, marginLeft: 8, borderWidth: 1, borderColor: '#F59E0B',
  },
  requiredText: {
    fontSize: 10, fontWeight: '800', color: '#92400E',
  },
  cardDesc: {
    fontSize: 13, color: '#64748B', lineHeight: 18,
  },

  legalBox: {
    backgroundColor: '#F1F5F9', borderRadius: 12, padding: 14,
    marginTop: 8,
  },
  legalText: {
    fontSize: 11, color: '#64748B', lineHeight: 16, textAlign: 'center',
  },

  saveBtn: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.primary, marginHorizontal: 16,
    paddingVertical: 18, borderRadius: 16, alignItems: 'center',
    elevation: 6, shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    color: '#FFF', fontSize: 17, fontWeight: '900', letterSpacing: 0.5,
  },
});
