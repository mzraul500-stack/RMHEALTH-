import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { COLORS, SPACING } from '../theme';
import { EmergencyButton } from '../components/EmergencyButton';
import { apiService } from '../api/client';
import { Logo } from '../components/Logo';
import { useLanguage } from '../contexts/LanguageContext';
import { LocalHistoryService } from '../services/LocalHistoryService';

/**
 * HomeScreen — Manual Vitals Entry + ML Triage Display
 *
 * Replaces the old simulated data feed with a manual form.
 * When the user presses "ENVIAR A IA", the data is sent to the
 * real API which runs it through the GradientBoosting model
 * (triage_classifier.joblib, 91.8% accuracy) and returns
 * the ML classification alongside the heuristic analysis.
 *
 * Future: useRealVitals will replace this form once a Galaxy
 * Watch is connected via Health Connect.
 */
export const HomeScreen = ({ navigation }) => {
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

  /**
   * Send manual vitals to the real API.
   * The backend runs: ai_engine.classify_triage() → MedicalEngine.analyze()
   */
  const handleSendVitals = async () => {
    // Validate required fields
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

    const payload = {
      usuario_id: 'raul_morales_001',
      ecg: 1.0,
      ppg: 1.0,
      oxigeno: ox,
      presion_sistolica: sys,
      presion_diastolica: dia,
      frecuencia_cardiaca: hr,
      temperatura: t || 36.6,
      glucosa: parseFloat(glucosa) || 90.0,
      ubicacion_lat: 16.8634,   // Acapulco default
      ubicacion_lon: -99.8901,
      dispositivo_id: 'manual_input',
      emergencia_detectada: false,
    };

    setSending(true);
    try {
      const response = await apiService.sendVitals(payload);
      setLastResult(response);
      setLastSync(new Date().toLocaleTimeString());
      // Save to local history
      await LocalHistoryService.saveRecord(response, payload);
    } catch (err) {
      const isOffline = err.message?.includes('Network') || err.message?.includes('fetch');
      Alert.alert(
        isOffline
          ? (language === 'en' ? 'No Internet Connection' : 'Sin conexión a internet')
          : (language === 'en' ? 'Connection Error' : 'Error de conexión'),
        isOffline
          ? (language === 'en' ? 'Check your internet connection and try again.' : 'Revisa tu conexión a internet e intenta de nuevo.')
          : (language === 'en' ? 'Could not reach the server. Try again later.' : 'No se pudo contactar al servidor. Intenta más tarde.')
      );
      setLastResult(null);
    } finally {
      setSending(false);
    }
  };

  /**
   * Manual SOS — sends critical vitals to force emergency protocol.
   */
  const handleManualSOS = async () => {
    const payload = {
      usuario_id: 'raul_morales_001',
      ecg: 1.0,
      ppg: 1.0,
      oxigeno: 82,
      presion_sistolica: 210,
      presion_diastolica: 130,
      frecuencia_cardiaca: 180,
      temperatura: parseFloat(temp) || 36.6,
      ubicacion_lat: 16.8634,
      ubicacion_lon: -99.8901,
      dispositivo_id: 'manual_sos',
      emergencia_detectada: true,
    };

    try {
      const response = await apiService.sendVitals(payload);
      setLastResult(response);
      setLastSync(new Date().toLocaleTimeString());
      // Save SOS to local history
      await LocalHistoryService.saveSOS(response);
      Alert.alert(
        language === 'en' ? 'ALERT SENT' : 'ALERTA ENVIADA',
        language === 'en' ? 'Emergency protocol activated.' : 'Protocolo de emergencia activado en el servidor.'
      );
    } catch (e) {
      Alert.alert(
        'Error',
        language === 'en' ? 'Could not reach emergency center.' : 'No se pudo contactar al centro de urgencias.'
      );
    }
  };

  // --- Derive display values from ML result ---
  const mlTriage = lastResult?.ml_triage;
  const analysis = lastResult?.analysis;
  const hospital = lastResult?.hospital_routing;

  const triageColor = {
    BAJO: COLORS.success,
    MEDIO: '#F59E0B',
    ALTO: '#F97316',
    CRITICO: COLORS.error,
  }[mlTriage?.level] || COLORS.text;

  return (
    <View style={styles.container}>
      {/* Navigation */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.navButton} onPress={() => navigation.navigate('Medications')}>
          <Text style={styles.navButtonText}>💊 {tr('nav_medications').toUpperCase()}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => navigation.navigate('History')}>
          <Text style={styles.navButtonText}>📋 {tr('nav_history').toUpperCase()}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => navigation.navigate('DeviceSettings')}>
          <Text style={styles.navButtonText}>⌚ RELOJES</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => navigation.navigate('Profile')}>
          <Text style={styles.navButtonText}>👤 {tr('nav_profile').toUpperCase()}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={() => navigation.navigate('About')}>
          <Text style={styles.navButtonText}>ℹ️</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.langToggle} onPress={toggleLanguage}>
          <Text style={styles.langToggleText}>{tr('language_switch')}</Text>
        </TouchableOpacity>
      </View>


      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={60}
      >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={{ marginBottom: SPACING.md }}>
          <Logo size={1.0} />
        </View>

        {/* ======= MANUAL VITALS FORM ======= */}
        <Text style={styles.sectionTitle}>{tr('home_subtitle')}</Text>

        <View style={styles.formCard}>
          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{tr('vital_heart_rate')}</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="72"
                placeholderTextColor="#999"
                value={heartRate}
                onChangeText={setHeartRate}
                maxLength={3}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{tr('vital_spo2')}</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="98"
                placeholderTextColor="#999"
                value={spo2}
                onChangeText={setSpo2}
                maxLength={3}
              />
            </View>
          </View>

          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{tr('vital_systolic')}</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="120"
                placeholderTextColor="#999"
                value={bpSys}
                onChangeText={setBpSys}
                maxLength={3}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{tr('vital_diastolic')}</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="80"
                placeholderTextColor="#999"
                value={bpDia}
                onChangeText={setBpDia}
                maxLength={3}
              />
            </View>
          </View>

          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{tr('vital_glucose')}</Text>
              <TextInput
                style={[styles.input, styles.inputGlucose]}
                keyboardType="numeric"
                placeholder="90"
                placeholderTextColor="#999"
                value={glucosa}
                onChangeText={setGlucosa}
                maxLength={3}
              />
              <Text style={styles.glucoseNote}>Feature #1 del modelo IA (23%)</Text>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{tr('vital_temperature')}</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                placeholder="36.6"
                placeholderTextColor="#999"
                value={temp}
                onChangeText={setTemp}
                maxLength={4}
              />
            </View>
            <View style={styles.inputGroup}>
              {/* Send button inline */}
              <Text style={styles.inputLabel}> </Text>
              <TouchableOpacity
                style={[styles.sendButton, sending && styles.sendButtonDisabled]}
                onPress={handleSendVitals}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.sendButtonText}>{tr('vital_submit').toUpperCase()}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>


        {/* ======= ML TRIAGE RESULT ======= */}
        {lastResult && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>Resultado del Modelo de IA</Text>

            {/* ML Classification */}
            {mlTriage && (
              <View style={styles.triageBox}>
                <Text style={styles.triageLabel}>Clasificación ML</Text>
                <Text style={[styles.triageLevel, { color: triageColor }]}>
                  {mlTriage.level}
                </Text>
                <Text style={styles.triageConfidence}>
                  Confianza: {(mlTriage.confidence * 100).toFixed(1)}%
                </Text>
                {mlTriage.probabilities && (
                  <View style={styles.probRow}>
                    {Object.entries(mlTriage.probabilities).map(([label, prob]) => (
                      <View key={label} style={styles.probItem}>
                        <Text style={styles.probLabel}>{label}</Text>
                        <View style={styles.probBarBg}>
                          <View style={[styles.probBarFill, { width: `${prob * 100}%` }]} />
                        </View>
                        <Text style={styles.probValue}>{(prob * 100).toFixed(1)}%</Text>
                      </View>
                    ))}
                  </View>
                )}
                <Text style={styles.modelBadge}>
                  {mlTriage.model_available ? 'GradientBoosting (91.8% acc)' : 'Modelo no disponible'}
                </Text>
              </View>
            )}

            {/* Heuristic Analysis */}
            {analysis && (
              <View style={styles.analysisBox}>
                <Text style={styles.analysisTitle}>Override Clínico (Heurístico)</Text>
                <Text style={styles.analysisField}>
                  Nivel: {analysis.nivel_criticidad}
                </Text>
                <Text style={styles.analysisField}>
                  Score: {analysis.score_riesgo?.toFixed(1)}/100
                </Text>
                <Text style={styles.analysisField}>
                  {analysis.recomendacion}
                </Text>
                {analysis.factores_riesgo?.length > 0 && (
                  <View style={styles.factorsList}>
                    {analysis.factores_riesgo.map((f, i) => (
                      <Text key={i} style={styles.factorItem}>• {f}</Text>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Hospital Routing (if emergency) */}
            {hospital && (
              <View style={styles.hospitalBox}>
                <Text style={styles.hospitalTitle}>Hospital Asignado</Text>
                <Text style={styles.hospitalName}>{hospital.name}</Text>
                <Text style={styles.hospitalDetail}>
                  ETA: {hospital.eta_minutes} min | {hospital.distance_km} km | {hospital.protocol}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Sync Status */}
        {lastSync && (
          <Text style={styles.syncText}>Última consulta: {lastSync}</Text>
        )}

        {/* SOS */}
        <View style={styles.actionCenter}>
          <Text style={styles.actionTitle}>Centro de Emergencias</Text>
          <EmergencyButton onPress={handleManualSOS} />
        </View>

      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  navBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  navButton: {
    backgroundColor: '#1E88E5',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  navButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  scrollContent: {
    padding: SPACING.lg,
    alignItems: 'center',
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    alignSelf: 'flex-start',
    marginBottom: SPACING.md,
  },

  // --- Form ---
  formCard: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: SPACING.lg,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    marginBottom: SPACING.lg,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.secondary,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputGlucose: {
    borderColor: '#F59E0B',
    borderWidth: 2,
    backgroundColor: '#FFFBEB',
  },
  glucoseNote: {
    fontSize: 10,
    color: '#D97706',
    fontWeight: '600',
    marginTop: 3,
    textAlign: 'center',
  },
  sendButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },

  // --- ML Result ---
  resultCard: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: SPACING.lg,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    marginBottom: SPACING.md,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },

  // Triage
  triageBox: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
    paddingBottom: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  triageLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  triageLevel: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 2,
  },
  triageConfidence: {
    fontSize: 14,
    color: COLORS.text,
    marginTop: 4,
  },
  modelBadge: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 8,
    fontStyle: 'italic',
  },

  // Probability bars
  probRow: {
    width: '100%',
    marginTop: SPACING.md,
  },
  probItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  probLabel: {
    width: 65,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  probBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  probBarFill: {
    height: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 4,
  },
  probValue: {
    width: 48,
    fontSize: 11,
    color: '#64748B',
    textAlign: 'right',
  },

  // Heuristic analysis
  analysisBox: {
    marginBottom: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  analysisTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  analysisField: {
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 4,
  },
  factorsList: {
    marginTop: 8,
    paddingLeft: 4,
  },
  factorItem: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 2,
  },

  // Hospital
  hospitalBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: SPACING.md,
  },
  hospitalTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  hospitalName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#78350F',
    marginBottom: 4,
  },
  hospitalDetail: {
    fontSize: 12,
    color: '#92400E',
  },

  // Sync & SOS
  syncText: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: SPACING.md,
  },
  actionCenter: {
    marginTop: SPACING.md,
    alignItems: 'center',
    width: '100%',
  },
  actionTitle: {
    color: COLORS.text,
    fontSize: 16,
    marginBottom: SPACING.md,
  },
  langToggle: {
    backgroundColor: COLORS.primary + '20',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  langToggleText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
});
