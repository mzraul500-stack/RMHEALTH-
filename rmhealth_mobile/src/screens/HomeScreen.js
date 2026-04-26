import React, { useState, useEffect } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, SafeAreaView, Dimensions,
} from 'react-native';
import { COLORS, SPACING } from '../theme';
import { EmergencyButton } from '../components/EmergencyButton';
import { apiService } from '../api/client';
import { useLanguage } from '../contexts/LanguageContext';
import { LocalHistoryService } from '../services/LocalHistoryService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocationService } from '../services/LocationService';

const SCREEN_W = Dimensions.get('window').width;

/**
 * HomeScreen — Samsung Health inspired design.
 * Premium cards, clean inputs, visual hierarchy.
 */
export const HomeScreen = () => {
  const { tr, toggleLanguage, language } = useLanguage();

  // --- Manual vitals input ---
  const [heartRate, setHeartRate] = useState('');
  const [spo2, setSpo2] = useState('');
  const [bpSys, setBpSys] = useState('');
  const [bpDia, setBpDia] = useState('');
  const [glucosa, setGlucosa] = useState('');
  const [temp, setTemp] = useState('36.6');

  // --- API response state ---
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [patientProfile, setPatientProfile] = useState(null);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const raw = await AsyncStorage.getItem('@rmhealth/patient_profile');
        if (raw) setPatientProfile(JSON.parse(raw));
      } catch (e) { console.warn('[HomeScreen] Profile load failed:', e); }
    };
    loadProfile();
  }, []);

    const [statusMsg, setStatusMsg] = useState('');

    const handleSendVitals = async () => {
      // ... (previous logic for parsing)
      const hr = parseInt(heartRate, 10);
      const ox = parseInt(spo2, 10);
      const sys = parseInt(bpSys, 10);
      const dia = parseInt(bpDia, 10);
      const t = parseFloat(temp);

      if (isNaN(hr) || isNaN(ox) || isNaN(sys) || isNaN(dia)) {
        Alert.alert(
          language === 'en' ? 'Incomplete Data' : 'Datos incompletos',
          language === 'en'
            ? 'Enter at least: heart rate, oxygen, systolic and diastolic pressure.'
            : 'Escribe al menos: pulso, oxígeno, presión sistólica y diastólica.'
        );
        return;
      }

      setSending(true);
      setStatusMsg(language === 'en' ? 'GETTING LOCATION...' : 'OBTENIENDO UBICACIÓN...');
      try {
        // 1. Get real location (now with 5s timeout)
        const coords = await LocationService.getCurrentLocation();
        
        setStatusMsg(language === 'en' ? 'ANALYZING DATA...' : 'ANALIZANDO DATOS...');
        const payload = {
          usuario_id: patientProfile?.name?.toLowerCase().replace(/\s+/g, '_') || 'paciente_001',
          ecg: 1.0, ppg: 1.0,
          oxigeno: ox, presion_sistolica: sys, presion_diastolica: dia,
          frecuencia_cardiaca: hr, temperatura: t || 36.6,
          glucosa: parseFloat(glucosa) || 90.0,
          ubicacion_lat: coords.lat, ubicacion_lon: coords.lon,
          dispositivo_id: 'manual_input', emergencia_detectada: false,
          // FULL CLINICAL CONTEXT FOR FDA/COFEPRIS COMPLIANCE
          patient_context: {
            nombre_completo: patientProfile?.name || 'Usuario RMHealth',
            edad: parseInt(patientProfile?.age) || 30,
            diabetico: !!patientProfile?.conditions?.diabetico,
            hipertenso: !!patientProfile?.conditions?.hipertenso,
            cardiopata: !!patientProfile?.conditions?.cardiopata,
            tipo_sangre: patientProfile?.blood || 'No especificado',
            contacto_emergencia_nombre: patientProfile?.contactName || '',
            contacto_emergencia_tel: patientProfile?.contactPhone || '',
            alergias: patientProfile?.allergies ? patientProfile.allergies.split(',').map(a => a.trim()) : []
          }
        };

        const response = await apiService.sendVitals(payload);
        setLastResult(response);
        setLastSync(new Date().toLocaleTimeString());
        await LocalHistoryService.saveRecord(response, payload);
      } catch (err) {
        // ... (existing catch logic)
        const isOffline = err.message?.includes('Network') || err.message?.includes('fetch');
        Alert.alert(
          isOffline
            ? (language === 'en' ? 'No Internet' : 'Sin conexión')
            : (language === 'en' ? 'Error' : 'Error de conexión'),
          isOffline
            ? (language === 'en' ? 'Check your internet.' : 'Revisa tu conexión.')
            : (language === 'en' ? 'Could not reach server.' : 'No se pudo contactar al servidor.')
        );
        setLastResult(null);
      } finally { 
        setSending(false); 
        setStatusMsg('');
      }
    };

  const handleManualSOS = async () => {
    try {
      const coords = await LocationService.getCurrentLocation();
      const payload = {
        usuario_id: patientProfile?.name?.toLowerCase().replace(/\s+/g, '_') || 'paciente_001',
        ecg: 1.0, ppg: 1.0, oxigeno: 82,
        presion_sistolica: 210, presion_diastolica: 130,
        frecuencia_cardiaca: 180, temperatura: parseFloat(temp) || 36.6,
        ubicacion_lat: coords.lat, ubicacion_lon: coords.lon,
        dispositivo_id: 'manual_sos', emergencia_detectada: true,
        // FULL CLINICAL CONTEXT FOR FDA/COFEPRIS COMPLIANCE
        patient_context: {
          nombre_completo: patientProfile?.name || 'Usuario RMHealth',
          edad: parseInt(patientProfile?.age) || 30,
          diabetico: !!patientProfile?.conditions?.diabetico,
          hipertenso: !!patientProfile?.conditions?.hipertenso,
          cardiopata: !!patientProfile?.conditions?.cardiopata,
          tipo_sangre: patientProfile?.blood || 'No especificado',
          contacto_emergencia_nombre: patientProfile?.contactName || '',
          contacto_emergencia_tel: patientProfile?.contactPhone || '',
          alergias: patientProfile?.allergies ? patientProfile.allergies.split(',').map(a => a.trim()) : []
        }
      };
      const response = await apiService.sendVitals(payload);
      setLastResult(response);
      setLastSync(new Date().toLocaleTimeString());
      await LocalHistoryService.saveSOS(response);
      Alert.alert(
        language === 'en' ? 'ALERT SENT' : 'ALERTA ENVIADA',
        language === 'en' ? 'Emergency protocol activated.' : 'Protocolo de emergencia activado.'
      );
    } catch (e) {
      Alert.alert('Error', language === 'en' ? 'Could not reach server.' : 'No se pudo contactar al servidor.');
    }
  };

  const mlTriage = lastResult?.ml_triage;
  const analysis = lastResult?.analysis;
  const hospital = lastResult?.hospital_routing;

  const triageColor = {
    BAJO: COLORS.success, MEDIO: '#F59E0B', ALTO: '#F97316', CRITICO: COLORS.error,
  }[mlTriage?.level] || COLORS.text;

  const greeting = patientProfile?.name
    ? `${language === 'en' ? 'Hello' : 'Hola'}, ${patientProfile.name.split(' ')[0]} 👋`
    : (language === 'en' ? 'Hello 👋' : 'Hola 👋');

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* ── HEADER ── */}
          <View style={s.header}>
            <View>
              <Text style={s.greeting}>{patientProfile?.name ? patientProfile.name.split(' ')[0] : 'RMHealth'}</Text>
            </View>
            <TouchableOpacity style={s.langBtn} onPress={toggleLanguage}>
              <Text style={s.langText}>{tr('language_switch')}</Text>
            </TouchableOpacity>
          </View>

          {/* ── STATUS RING ── */}
          <View style={s.ringCard}>
            <View style={s.ringOuter}>
              <View style={s.ringInner}>
                <Text style={s.ringIcon}>❤️</Text>
                <Text style={s.ringValue}>{heartRate || '--'}</Text>
                <Text style={s.ringUnit}>bpm</Text>
              </View>
            </View>
            <View style={s.miniStats}>
              <View style={s.miniStat}>
                <Text style={s.miniIcon}>🫁</Text>
                <Text style={s.miniValue}>{spo2 || '--'}%</Text>
                <Text style={s.miniLabel}>SpO₂</Text>
              </View>
              <View style={s.miniStat}>
                <Text style={s.miniIcon}>🩸</Text>
                <Text style={s.miniValue}>{bpSys || '--'}/{bpDia || '--'}</Text>
                <Text style={s.miniLabel}>mmHg</Text>
              </View>
              <View style={s.miniStat}>
                <Text style={s.miniIcon}>🍬</Text>
                <Text style={s.miniValue}>{glucosa || '--'}</Text>
                <Text style={s.miniLabel}>mg/dL</Text>
              </View>
              <View style={s.miniStat}>
                <Text style={s.miniIcon}>🌡️</Text>
                <Text style={s.miniValue}>{temp || '--'}</Text>
                <Text style={s.miniLabel}>°C</Text>
              </View>
            </View>
          </View>

          {/* ── INPUT FORM ── */}
          <View style={s.formCard}>
            <Text style={s.formTitle}>
              {language === 'en' ? '📝 Enter Vital Signs' : '📝 Ingresa tus Signos Vitales'}
            </Text>

            <View style={s.inputRow}>
              <VitalInput label={tr('vital_heart_rate')} value={heartRate} onChange={setHeartRate} placeholder="72" icon="❤️" />
              <VitalInput label={tr('vital_spo2')} value={spo2} onChange={setSpo2} placeholder="98" icon="🫁" />
            </View>
            <View style={s.inputRow}>
              <VitalInput label={tr('vital_systolic')} value={bpSys} onChange={setBpSys} placeholder="120" icon="🔴" />
              <VitalInput label={tr('vital_diastolic')} value={bpDia} onChange={setBpDia} placeholder="80" icon="🔵" />
            </View>
            <View style={s.inputRow}>
              <VitalInput label={tr('vital_glucose')} value={glucosa} onChange={setGlucosa} placeholder="90" icon="🍬" />
              <VitalInput label={tr('vital_temperature')} value={temp} onChange={setTemp} placeholder="36.6" icon="🌡️" decimal />
            </View>

            <TouchableOpacity
              style={[s.submitBtn, sending && s.submitBtnDisabled]}
              onPress={handleSendVitals}
              disabled={sending}
              activeOpacity={0.8}
            >
              <Text style={s.submitText}>
                {sending 
                  ? statusMsg 
                  : (language === 'en' ? '🔬 DETECT PATTERNS' : '🔬 DETECTAR PATRONES')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── ML RESULT ── */}
          {lastResult && (
            <View style={s.resultCard}>
              <Text style={s.resultTitle}>
                {language === 'en' ? '🧠 Pattern Detection Report' : '🧠 Reporte de Detección de Patrones'}
              </Text>

              {mlTriage && (
                <View style={s.triageSection}>
                  <View style={[s.triageBadge, { backgroundColor: triageColor + '18', borderColor: triageColor }]}>
                    <Text style={[s.triageLevel, { color: triageColor }]}>{mlTriage.level}</Text>
                    <Text style={s.triageConf}>{(mlTriage.confidence * 100).toFixed(1)}%</Text>
                  </View>

                  {mlTriage.probabilities && (
                    <View style={s.probContainer}>
                      {Object.entries(mlTriage.probabilities).map(([label, prob]) => (
                        <View key={label} style={s.probRow}>
                          <Text style={s.probLabel}>{label}</Text>
                          <View style={s.probBarBg}>
                            <View style={[s.probBarFill, { width: `${prob * 100}%`, backgroundColor: triageColor }]} />
                          </View>
                          <Text style={s.probValue}>{(prob * 100).toFixed(1)}%</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <Text style={s.modelBadge}>GradientBoosting · 91.8% accuracy</Text>
                </View>
              )}

              {analysis && (
                <View style={s.analysisSection}>
                  <View style={s.analysisHeader}>
                    <Text style={s.analysisLevel}>{analysis.nivel_criticidad}</Text>
                    <Text style={s.analysisScore}>Score: {analysis.score_riesgo?.toFixed(0)}/100</Text>
                  </View>
                  <Text style={s.analysisRec}>{analysis.recomendacion}</Text>
                  {analysis.factores_riesgo?.map((f, i) => (
                    <Text key={i} style={s.factorItem}>• {f}</Text>
                  ))}
                </View>
              )}

              {hospital && (
                <View style={s.hospitalCard}>
                  <Text style={s.hospitalIcon}>🏥</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.hospitalName}>{hospital.name}</Text>
                    <Text style={s.hospitalMeta}>
                      {hospital.eta_minutes} min · {hospital.distance_km} km · {hospital.protocol}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {lastSync && (
            <Text style={s.syncText}>
              {language === 'en' ? 'Last analysis' : 'Último análisis'}: {lastSync}
            </Text>
          )}

          {/* ── SOS ── */}
          <View style={s.sosSection}>
            <EmergencyButton onPress={handleManualSOS} />
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>
    </SafeAreaView>
  );
};

// ── REUSABLE INPUT COMPONENT ──
function VitalInput({ label, value, onChange, placeholder, icon, decimal }) {
  return (
    <View style={s.inputGroup}>
      <Text style={s.inputLabel}>{icon} {label}</Text>
      <TextInput
        style={s.input}
        keyboardType={decimal ? 'decimal-pad' : 'numeric'}
        placeholder={placeholder}
        placeholderTextColor="#B0BEC5"
        value={value}
        onChangeText={onChange}
        maxLength={decimal ? 4 : 3}
      />
    </View>
  );
}

// ============================================================
// STYLES — Samsung Health inspired, premium cards
// ============================================================
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingBottom: 100 },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8,
  },
  greeting: { fontSize: 26, fontWeight: '900', color: COLORS.secondary },
  headerSub: { fontSize: 14, color: '#64748B', marginTop: 2, fontWeight: '500' },
  langBtn: {
    backgroundColor: COLORS.primary + '15', paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.primary + '40',
  },
  langText: { fontSize: 13, fontWeight: '800', color: COLORS.primary },

  // Status Ring Card
  ringCard: {
    backgroundColor: COLORS.surface, marginHorizontal: 16, marginTop: 12,
    borderRadius: 24, padding: 20, elevation: 6,
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  ringOuter: {
    width: 140, height: 140, borderRadius: 70,
    borderWidth: 6, borderColor: COLORS.primary + '30',
    justifyContent: 'center', alignItems: 'center', alignSelf: 'center',
    marginBottom: 16,
  },
  ringInner: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: COLORS.primary + '10',
    justifyContent: 'center', alignItems: 'center',
  },
  ringIcon: { fontSize: 24 },
  ringValue: { fontSize: 36, fontWeight: '900', color: COLORS.secondary, marginTop: -2 },
  ringUnit: { fontSize: 12, color: '#64748B', fontWeight: '600', marginTop: -4 },
  miniStats: { flexDirection: 'row', justifyContent: 'space-around' },
  miniStat: { alignItems: 'center', flex: 1 },
  miniIcon: { fontSize: 18 },
  miniValue: { fontSize: 16, fontWeight: '800', color: COLORS.secondary, marginTop: 2 },
  miniLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '600' },

  // Form Card
  formCard: {
    backgroundColor: COLORS.surface, marginHorizontal: 16, marginTop: 16,
    borderRadius: 20, padding: 20, elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  formTitle: { fontSize: 17, fontWeight: '800', color: COLORS.secondary, marginBottom: 16 },
  inputRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  inputGroup: { flex: 1 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 6 },
  input: {
    backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
    fontSize: 20, fontWeight: '700', color: COLORS.secondary, textAlign: 'center',
  },
  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 6, elevation: 4,
    shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 1 },

  // Result Card
  resultCard: {
    backgroundColor: COLORS.surface, marginHorizontal: 16, marginTop: 16,
    borderRadius: 20, padding: 20, elevation: 4,
    borderWidth: 1, borderColor: COLORS.border,
  },
  resultTitle: { fontSize: 17, fontWeight: '800', color: COLORS.secondary, marginBottom: 14 },
  triageSection: { marginBottom: 14 },
  triageBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, paddingVertical: 14, borderWidth: 2, marginBottom: 12,
  },
  triageLevel: { fontSize: 24, fontWeight: '900' },
  triageConf: { fontSize: 14, fontWeight: '700', color: '#64748B', marginLeft: 12 },
  probContainer: { gap: 6 },
  probRow: { flexDirection: 'row', alignItems: 'center' },
  probLabel: { width: 60, fontSize: 11, fontWeight: '700', color: '#64748B' },
  probBarBg: { flex: 1, height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden', marginHorizontal: 8 },
  probBarFill: { height: '100%', borderRadius: 4 },
  probValue: { width: 42, fontSize: 11, fontWeight: '700', color: '#64748B', textAlign: 'right' },
  modelBadge: { fontSize: 10, color: '#94A3B8', textAlign: 'center', marginTop: 10, fontWeight: '600' },

  analysisSection: {
    backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 12,
  },
  analysisHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  analysisLevel: { fontSize: 16, fontWeight: '900', color: COLORS.secondary },
  analysisScore: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  analysisRec: { fontSize: 13, fontWeight: '600', color: COLORS.primary, marginBottom: 8 },
  factorItem: { fontSize: 12, color: '#64748B', lineHeight: 18 },

  hospitalCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7',
    borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#F59E0B',
  },
  hospitalIcon: { fontSize: 28, marginRight: 12 },
  hospitalName: { fontSize: 14, fontWeight: '800', color: '#92400E' },
  hospitalMeta: { fontSize: 11, color: '#B45309', marginTop: 2 },

  syncText: { textAlign: 'center', fontSize: 11, color: '#94A3B8', fontWeight: '600', marginTop: 12 },

  sosSection: {
    marginHorizontal: 16, marginTop: 20, alignItems: 'center',
  },
});
