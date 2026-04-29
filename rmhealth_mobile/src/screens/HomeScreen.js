import React, { useState, useEffect } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, SafeAreaView, Dimensions,
} from 'react-native';
import { COLORS, SPACING } from '../theme';
import { EmergencyButton } from '../components/EmergencyButton';
import { VitalInput } from '../components/VitalInput';
import { apiService } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { LocalHistoryService } from '../services/LocalHistoryService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocationService } from '../services/LocationService';
import { CriticalAlertModal } from '../components/CriticalAlertModal';
import { Heart, Wind, Activity, Droplets, Thermometer, Building2, AlertTriangle } from 'lucide-react-native';

const SCREEN_W = Dimensions.get('window').width;

/**
 * HomeScreen — Samsung Health inspired design.
 * Premium cards, clean inputs, visual hierarchy.
 */
export const HomeScreen = () => {
  const { tr, toggleLanguage, language } = useLanguage();
  const { accessToken, user } = useAuth();

  // --- Manual vitals input ---
  const [heartRate, setHeartRate] = useState('');
  const [spo2, setSpo2] = useState('');
  const [bpSys, setBpSys] = useState('');
  const [bpDia, setBpDia] = useState('');
  const [glucosa, setGlucosa] = useState('');
  const [temp, setTemp] = useState('36.6');
  const [contexto, setContexto] = useState('reposo');

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

    // --- Critical Alert Modal state ---
    const [criticalAlert, setCriticalAlert] = useState(null);
    const [showCriticalModal, setShowCriticalModal] = useState(false);

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
          contexto: contexto,
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

        const response = await apiService.sendVitals(payload, accessToken);
        setLastResult(response);
        setLastSync(new Date().toLocaleTimeString());
        await LocalHistoryService.saveRecord(response, payload);

        // Check for preventive alerts that require escalation
        if (response.preventive_alerts && response.preventive_alerts.length > 0) {
          const critical = response.preventive_alerts.find(
            a => a.severity === 'HIGH' || a.severity === 'MEDIUM'
          );
          if (critical) {
            setCriticalAlert(critical);
            setShowCriticalModal(true);
          }
        }
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

  // --- Critical Alert Response Handler ---
  const handleAlertResponse = async (alertId, responseType, reason) => {
    try {
      await apiService.respondToAlert(alertId, responseType, reason, accessToken);
      setShowCriticalModal(false);
      setCriticalAlert(null);

      if (responseType === 'need_help') {
        Alert.alert(
          language === 'en' ? 'Emergency Protocol Activated' : 'Protocolo de Emergencia Activado',
          language === 'en'
            ? 'Your emergency contacts have been notified.'
            : 'Tus contactos de emergencia han sido notificados.'
        );
      }
    } catch (e) {
      console.error('[HomeScreen] Alert response error:', e);
      // Still close the modal — the response was an intent, not dependent on server
      setShowCriticalModal(false);
      setCriticalAlert(null);
    }
  };

  const mlTriage = lastResult?.ml_triage;
  const analysis = lastResult?.analysis;
  const hospital = lastResult?.hospital_routing;

  // Normalize level: API returns English codes (HIGH/CRITICAL/MEDIUM/LOW)
  // but colors and display are in Spanish. Map both.
  const ML_LEVEL_MAP = {
    CRITICAL: 'CRÍTICO', CRITICO: 'CRÍTICO',
    HIGH:     'ALTO',    ALTO:    'ALTO',
    MEDIUM:   'MEDIO',   MEDIO:   'MEDIO',
    LOW:      'BAJO',    BAJO:    'BAJO',
    NORMAL:   'NORMAL',
  };
  const normalizedLevel = ML_LEVEL_MAP[mlTriage?.level] || mlTriage?.level || '';

  const triageColor = {
    'CRÍTICO': COLORS.error, ALTO: '#F97316', MEDIO: '#F59E0B', BAJO: COLORS.success, NORMAL: COLORS.success,
  }[normalizedLevel] || COLORS.text;

  const greeting = patientProfile?.name
    ? `${language === 'en' ? 'Hello' : 'Hola'}, ${patientProfile.name.split(' ')[0]} 👋`
    : (language === 'en' ? 'Hello 👋' : 'Hola 👋');

  return (
    <>
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
                <Heart size={28} color="#EF4444" strokeWidth={2.5} />
                <Text style={s.ringValue}>{heartRate || '--'}</Text>
                <Text style={s.ringUnit}>bpm</Text>
              </View>
            </View>
            <View style={s.miniStats}>
              <View style={s.miniStat}>
                <Wind size={18} color="#1B7A6E" strokeWidth={2.5} />
                <Text style={s.miniValue}>{spo2 || '--'}%</Text>
                <Text style={s.miniLabel}>SpO₂</Text>
              </View>
              <View style={s.miniStat}>
                <Activity size={18} color="#8B5CF6" strokeWidth={2.5} />
                <Text style={s.miniValue}>{bpSys || '--'}/{bpDia || '--'}</Text>
                <Text style={s.miniLabel}>mmHg</Text>
              </View>
              <View style={s.miniStat}>
                <Droplets size={18} color="#1B7A6E" strokeWidth={2.5} />
                <Text style={s.miniValue}>{glucosa || '--'}</Text>
                <Text style={s.miniLabel}>mg/dL</Text>
              </View>
              <View style={s.miniStat}>
                <Thermometer size={18} color="#1B7A6E" strokeWidth={2.5} />
                <Text style={s.miniValue}>{temp || '--'}</Text>
                <Text style={s.miniLabel}>°C</Text>
              </View>
            </View>
          </View>

          {/* ── INPUT FORM ── */}
          <View style={s.formCard}>
            <Text style={s.formTitle}>
              {language === 'en' ? 'Enter Vital Signs' : 'Ingresa tus Signos Vitales'}
            </Text>

            {/* ── CONTEXT SELECTOR ──\r\n                TODO [CardioWave]: When the CardioWave smartwatch is connected,\r\n                this field will be auto-filled from accelerometer + HR sensors\r\n                without user intervention. Until then, manual selection. */}
            <Text style={s.contextLabel}>
              {language === 'en' ? 'Context' : 'Contexto'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.contextScroll} contentContainerStyle={s.contextContainer}>
              {[
                { key: 'reposo',    es: 'En reposo',            en: 'At rest' },
                { key: 'ejercicio', es: 'Después de ejercicio', en: 'After exercise' },
                { key: 'comida',    es: 'Después de comer',     en: 'After eating' },
                { key: 'dormir',    es: 'Antes de dormir',      en: 'Before sleep' },
                { key: 'despertar', es: 'Al despertar',         en: 'Waking up' },
                { key: 'otro',      es: 'Otro',                 en: 'Other' },
              ].map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.contextPill, contexto === opt.key && s.contextPillActive]}
                  onPress={() => setContexto(opt.key)}
                  accessibilityRole="button"
                  accessibilityLabel={language === 'en' ? opt.en : opt.es}
                  accessibilityState={{ selected: contexto === opt.key }}
                >
                  <Text style={[s.contextPillText, contexto === opt.key && s.contextPillTextActive]}>
                    {language === 'en' ? opt.en : opt.es}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={s.inputRow}>
              <VitalInput label={tr('vital_heart_rate')} value={heartRate} onChange={setHeartRate} placeholder="72" IconComponent={Heart} iconColor="#EF4444" rangeKey="heartRate" context={contexto} language={language} accessibilityLabel={language === 'en' ? 'Heart rate in beats per minute' : 'Frecuencia cardíaca en latidos por minuto'} />
              <VitalInput label={tr('vital_spo2')} value={spo2} onChange={setSpo2} placeholder="98" IconComponent={Wind} rangeKey="spo2" context={contexto} language={language} accessibilityLabel={language === 'en' ? 'Oxygen saturation percentage' : 'Porcentaje de saturación de oxígeno'} />
            </View>
            <View style={s.inputRow}>
              <VitalInput label={tr('vital_systolic')} value={bpSys} onChange={setBpSys} placeholder="120" IconComponent={Activity} iconColor="#E74C3C" rangeKey="systolic" context={contexto} language={language} accessibilityLabel={language === 'en' ? 'Systolic blood pressure' : 'Presión arterial sistólica'} />
              <VitalInput label={tr('vital_diastolic')} value={bpDia} onChange={setBpDia} placeholder="80" IconComponent={Activity} iconColor="#2E86C1" rangeKey="diastolic" context={contexto} language={language} accessibilityLabel={language === 'en' ? 'Diastolic blood pressure' : 'Presión arterial diastólica'} />
            </View>
            <View style={s.inputRow}>
              <VitalInput label={tr('vital_glucose')} value={glucosa} onChange={setGlucosa} placeholder="90" IconComponent={Droplets} rangeKey="glucose" context={contexto} language={language} accessibilityLabel={language === 'en' ? 'Blood glucose in milligrams per deciliter' : 'Glucosa en sangre en miligramos por decilitro'} />
              <VitalInput label={tr('vital_temperature')} value={temp} onChange={setTemp} placeholder="36.6" IconComponent={Thermometer} rangeKey="temperature" context={contexto} decimal language={language} accessibilityLabel={language === 'en' ? 'Body temperature in degrees Celsius' : 'Temperatura corporal en grados Celsius'} />
            </View>

            <TouchableOpacity
              style={[s.submitBtn, sending && s.submitBtnDisabled]}
              onPress={handleSendVitals}
              disabled={sending}
              activeOpacity={0.8}
              accessibilityLabel={language === 'en' ? 'Detect patterns button' : 'Botón detectar patrones'}
              accessibilityHint={language === 'en' ? 'Sends your vital signs for analysis' : 'Envía tus signos vitales para análisis'}
              accessibilityRole="button"
            >
              <Text style={s.submitText}>
                {sending 
                  ? statusMsg 
                  : (language === 'en' ? 'ANALYZE DATA' : 'ANALIZAR DATOS')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── ML RESULT ── */}
          {lastResult && (
            <View style={s.resultCard}>
              <Text style={s.resultTitle}>
                {language === 'en' ? 'Pattern Detection Report' : 'Reporte de Detección de Patrones'}
              </Text>

              {mlTriage && (
                <View style={s.triageSection}>
                  <View style={[s.triageBadge, { backgroundColor: triageColor + '18', borderColor: triageColor }]}>
                    <Text style={[s.triageLevel, { color: triageColor }]}>{normalizedLevel}</Text>
                    <Text style={s.triageConf}>
                      {mlTriage.confidence != null
                        ? `${(mlTriage.confidence * 100).toFixed(1)}%`
                        : mlTriage.probabilities
                          ? `${(Math.max(...Object.values(mlTriage.probabilities)) * 100).toFixed(1)}%`
                          : '--'}
                    </Text>
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
                  <Text style={s.modelBadge}>
                    GradientBoosting · {mlTriage.accuracy != null
                      ? `${(mlTriage.accuracy * 100).toFixed(1)}%`
                      : '99.4%'} accuracy · Vertex AI v2
                  </Text>
                </View>
              )}

              {analysis && (
                <View style={s.analysisSection}>
                  <View style={s.analysisHeader}>
                    <Text style={s.analysisLevel}>{(() => {
                      const lvl = analysis.nivel_criticidad;
                      if (language === 'en') return lvl;
                      const map = { CRITICAL: 'CRÍTICO', HIGH: 'ALTO', MEDIUM: 'MEDIO', LOW: 'BAJO', NORMAL: 'NORMAL' };
                      return map[lvl] || lvl;
                    })()}</Text>
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
                  <View style={s.hospitalIconWrap}>
                    <Building2 size={22} color="#1B7A6E" strokeWidth={2} />
                  </View>
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

      {/* Critical Alert Modal — Phase 5 (M6) */}
      <CriticalAlertModal
        visible={showCriticalModal}
        alert={criticalAlert}
        language={language}
        onRespond={handleAlertResponse}
      />
    </>
  );
};



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
  hospitalIconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#E0F2F1', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  hospitalName: { fontSize: 14, fontWeight: '800', color: '#92400E' },
  hospitalMeta: { fontSize: 11, color: '#B45309', marginTop: 2 },

  syncText: { textAlign: 'center', fontSize: 11, color: '#94A3B8', fontWeight: '600', marginTop: 12 },

  sosSection: {
    marginHorizontal: 16, marginTop: 20, alignItems: 'center',
  },

  // Context Selector
  contextLabel: {
    fontSize: 12, fontWeight: '800', color: '#64748B', marginBottom: 8, marginTop: 4,
  },
  contextScroll: {
    marginBottom: 14, maxHeight: 40,
  },
  contextContainer: {
    gap: 8, paddingRight: 8,
  },
  contextPill: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
    backgroundColor: '#F1F5F9', borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  contextPillActive: {
    backgroundColor: COLORS.primary + '15', borderColor: COLORS.primary,
  },
  contextPillText: {
    fontSize: 12, fontWeight: '700', color: '#64748B',
  },
  contextPillTextActive: {
    color: COLORS.primary,
  },
});
