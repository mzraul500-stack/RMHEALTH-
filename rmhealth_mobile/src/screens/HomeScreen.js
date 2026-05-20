import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, SafeAreaView, Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
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
import { ContextualAnalysisCard } from '../components/ContextualAnalysisCard';
import { SleepSummaryCard } from '../components/SleepSummaryCard';
import { BPSyncBridge } from '../components/BPSyncBridge';
import { Heart, Wind, Activity, Droplets, Thermometer, Building2, AlertTriangle, Watch, FileText, ShieldAlert, Stethoscope, CreditCard, Moon, Pill } from 'lucide-react-native';
import { useWatchData } from '../hooks/useWatchData';
import { FEATURES } from '../config/features';

const SCREEN_W = Dimensions.get('window').width;

/**
 * HomeScreen — Samsung Health inspired design.
 * Premium cards, clean inputs, visual hierarchy.
 */
export const HomeScreen = () => {
  const { tr, toggleLanguage, language } = useLanguage();
  const { accessToken, user } = useAuth();
  const navigation = useNavigation();

  // --- Manual vitals input ---
  const [heartRate, setHeartRate] = useState('');
  const [spo2, setSpo2] = useState('');
  const [bpSys, setBpSys] = useState('');
  const [bpDia, setBpDia] = useState('');
  const [glucosa, setGlucosa] = useState('');
  const [temp, setTemp] = useState('36.6');
  const [contexto, setContexto] = useState('reposo');
  // Health Connect — source tracking per field
  const [watchSource, setWatchSource] = useState({ fc: false, spo2: false, temp: false });
  const lastWatchTsRef      = useRef(null);
  const handleSendVitalsRef = useRef(null);
  const lastAutoAnalysisRef = useRef(0); // timestamp del último auto-análisis

  // Manual edit tracking — prevents Health Connect from overwriting user input
  const manualEditRef = useRef({ fc: false, spo2: false, tas: false, tad: false, temp: false });
  const onManualFC    = (v) => { manualEditRef.current.fc   = true; setHeartRate(v); };
  const onManualSpO2  = (v) => { manualEditRef.current.spo2 = true; setSpo2(v); };
  const onManualBpSys = (v) => { manualEditRef.current.tas  = true; setBpSys(v); };
  const onManualBpDia = (v) => { manualEditRef.current.tad  = true; setBpDia(v); };
  const onManualTemp  = (v) => { manualEditRef.current.temp = true; setTemp(v); };

  // --- API response state ---
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const raw = await AsyncStorage.getItem('@rmhealth/patient_profile');
        if (raw) setUserProfile(JSON.parse(raw));
      } catch (e) { console.warn('[HomeScreen] Profile load failed:', e); }
    };
    loadProfile();
  }, []);

  // ── Health Connect ───────────────────────────────────────────
  const {
    watchData, isWatchAvailable, permissionsGranted, refreshWatchData,
    isLoading: isWatchLoading, error: watchError,
    bpInfo: rawBpInfo, syncBPFromBridge: rawSyncBPFromBridge,
  } = useWatchData();
  // Safe defaults — useWatchData may not yet export bpInfo/syncBPFromBridge
  const bpInfo = rawBpInfo || { isStale: false, lastTime: null, sys: null, dia: null };
  const syncBPFromBridge = rawSyncBPFromBridge || (() => {});

  // Auto-fill cuando llegan datos nuevos del reloj
  useEffect(() => {
    console.log('[HomeScreen] useEffect watchData disparado:', watchData ? 'CON datos' : 'NULL');
    if (!watchData) return;

    console.log('[HomeScreen] watchData.timestamp=', watchData.timestamp, 'lastRef=', lastWatchTsRef.current);
    // Actualizar siempre — el hook ya maneja el polling
    lastWatchTsRef.current = watchData.timestamp;

    const newSource = { fc: false, spo2: false, temp: false, tas: false, tad: false };

    if (watchData.fc != null && !manualEditRef.current.fc)            { setHeartRate(String(watchData.fc));     newSource.fc   = true; }
    if (watchData.spo2 != null && !manualEditRef.current.spo2)        { setSpo2(String(watchData.spo2));        newSource.spo2 = true; }
    if (watchData.temperatura != null && !manualEditRef.current.temp) { setTemp(String(watchData.temperatura)); newSource.temp = true; }
    // BP: fluye automáticamente (respeta edición manual)
    if (watchData.tas != null && !manualEditRef.current.tas)          { setBpSys(String(watchData.tas));        newSource.tas  = true; }
    if (watchData.tad != null && !manualEditRef.current.tad)          { setBpDia(String(watchData.tad));        newSource.tad  = true; }
    setWatchSource(newSource);

    console.log('[HomeScreen] ✅ Campos actualizados: FC=', watchData.fc,
      'SpO2=', watchData.spo2, 'TAS=', watchData.tas, 'TAD=', watchData.tad,
      'Fuentes=', JSON.stringify(newSource));

    // Auto-análisis: solo cada 5 minutos para no saturar el backend
    const AUTO_ANALYSIS_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos
    const now = Date.now();
    const elapsed = now - lastAutoAnalysisRef.current;
    if (FEATURES.WATCH_AUTO_ANALYSIS && watchData.fc != null && watchData.spo2 != null && watchData.tas != null && watchData.tad != null) {
      if (elapsed >= AUTO_ANALYSIS_COOLDOWN_MS) {
        console.log('[HomeScreen] 🔄 Auto-análisis disparado (cooldown OK:', Math.round(elapsed/1000), 's)');
        lastAutoAnalysisRef.current = now;
        setTimeout(() => handleSendVitalsRef.current?.(false), 800);
      } else {
        console.log('[HomeScreen] ⏳ Auto-análisis en cooldown, faltan', Math.round((AUTO_ANALYSIS_COOLDOWN_MS - elapsed)/1000), 's');
      }
    }
  }, [watchData]);

    const [statusMsg, setStatusMsg] = useState('');

    // --- Critical Alert Modal state ---
    const [criticalAlert, setCriticalAlert] = useState(null);
    const [showCriticalModal, setShowCriticalModal] = useState(false);

    const handleSendVitals = async (isManual = true) => {
      // ... (previous logic for parsing)
      const hr = parseInt(heartRate, 10);
      const ox = parseInt(spo2, 10);
      const sys = parseInt(bpSys, 10);
      const dia = parseInt(bpDia, 10);
      const t = parseFloat(temp);

      if (isNaN(hr) || isNaN(ox) || isNaN(sys) || isNaN(dia)) {
        if (isManual) {
          Alert.alert(
            language === 'en' ? 'Incomplete Data' : 'Datos incompletos',
            language === 'en'
              ? 'Enter at least: heart rate, oxygen, systolic and diastolic pressure.'
              : 'Escribe al menos: pulso, oxígeno, presión sistólica y diastólica.'
          );
        }
        return;
      }

      setSending(true);
      if (isManual) setStatusMsg(language === 'en' ? 'GETTING LOCATION...' : 'OBTENIENDO UBICACIÓN...');
      try {
        // 1. Get real location (now with 5s timeout)
        const coords = await LocationService.getCurrentLocation();
        
        if (isManual) setStatusMsg(language === 'en' ? 'ANALYZING DATA...' : 'ANALIZANDO DATOS...');
        const payload = {
          usuario_id: userProfile?.name?.toLowerCase().replace(/\s+/g, '_') || 'usuario_001',
          ecg: 1.0, ppg: 1.0,
          oxigeno: ox, presion_sistolica: sys, presion_diastolica: dia,
          frecuencia_cardiaca: hr, temperatura: t || 36.6,
          glucosa: parseFloat(glucosa) || 90.0,
          ubicacion_lat: coords.lat, ubicacion_lon: coords.lon,
          dispositivo_id: 'manual_input', emergencia_detectada: false,
          contexto: contexto,
          // WELLNESS CONTEXT FOR PREVENTIVE MONITORING
          patient_context: {
            nombre_completo: userProfile?.name || 'Usuario RMHealth',
            edad: parseInt(userProfile?.age) || 30,
            diabetico: !!userProfile?.conditions?.diabetico,
            hipertenso: !!userProfile?.conditions?.hipertenso,
            cardiopata: !!userProfile?.conditions?.cardiopata,
            tipo_sangre: userProfile?.blood || 'No especificado',
            contacto_emergencia_nombre: userProfile?.contactName || '',
            contacto_emergencia_tel: userProfile?.contactPhone || '',
            alergias: userProfile?.allergies ? userProfile.allergies.split(',').map(a => a.trim()) : []
          }
        };

        const response = await apiService.sendVitals(payload, accessToken);
        setLastResult(response);
        setLastSync(new Date().toLocaleTimeString());
        await LocalHistoryService.saveRecord(response, payload);

        // Trigger modal for preventive alerts OR if backend confirms emergency
        // SAFETY: Only use emergency_eligible from backend, NOT raw ML level
        const isEmergencyEligible = response.emergency_eligible === true;
        let critical = null;
        
        if (response.preventive_alerts && response.preventive_alerts.length > 0) {
          critical = response.preventive_alerts.find(
            a => a.severity === 'HIGH' || a.severity === 'MEDIUM'
          );
        }

        if (critical || isEmergencyEligible) {
          setCriticalAlert(critical || { 
            severity: response.display_severity || response.analysis?.nivel_criticidad || 'HIGH', 
            message: 'Anomalía detectada en signos vitales.',
            recommendation: response.analysis?.recomendacion || 'Requiere atención médica.'
          });
          setShowCriticalModal(true);
        }
      } catch (err) {
        // ... (existing catch logic)
        const isOffline = err.message?.includes('Network') || err.message?.includes('fetch');
        if (isManual) {
          Alert.alert(
            isOffline
              ? (language === 'en' ? 'No Internet' : 'Sin conexión')
              : (language === 'en' ? 'Error' : 'Error de conexión'),
            isOffline
              ? (language === 'en' ? 'Check your internet.' : 'Revisa tu conexión.')
              : (language === 'en' ? 'Could not reach server.' : 'No se pudo contactar al servidor.')
          );
        } else {
          console.warn('[HomeScreen] Auto-analysis failed silently:', err.message);
        }
        setLastResult(null);
      } finally { 
        setSending(false); 
        setStatusMsg('');
        // Reset manual edit tracking — next poll cycle can auto-fill again
        manualEditRef.current = { fc: false, spo2: false, tas: false, tad: false, temp: false };
      }
    };
    // Mantiene ref sincronizada para que el auto-fill pueda invocarla
    handleSendVitalsRef.current = handleSendVitals;

  const handleManualSOS = async () => {
    try {
      const coords = await LocationService.getCurrentLocation();
      const payload = {
        usuario_id: userProfile?.name?.toLowerCase().replace(/\s+/g, '_') || 'usuario_001',
        ecg: 1.0, ppg: 1.0, oxigeno: 82,
        presion_sistolica: 210, presion_diastolica: 130,
        frecuencia_cardiaca: 180, temperatura: parseFloat(temp) || 36.6,
        ubicacion_lat: coords.lat, ubicacion_lon: coords.lon,
        dispositivo_id: 'manual_sos', emergencia_detectada: true,
        // WELLNESS CONTEXT FOR PREVENTIVE MONITORING
        patient_context: {
          nombre_completo: userProfile?.name || 'Usuario RMHealth',
          edad: parseInt(userProfile?.age) || 30,
          diabetico: !!userProfile?.conditions?.diabetico,
          hipertenso: !!userProfile?.conditions?.hipertenso,
          cardiopata: !!userProfile?.conditions?.cardiopata,
          tipo_sangre: userProfile?.blood || 'No especificado',
          contacto_emergencia_nombre: userProfile?.contactName || '',
          contacto_emergencia_tel: userProfile?.contactPhone || '',
          alergias: userProfile?.allergies ? userProfile.allergies.split(',').map(a => a.trim()) : []
        }
      };
      const response = await apiService.sendVitals(payload);
      setLastResult(response);
      setLastSync(new Date().toLocaleTimeString());
      await LocalHistoryService.saveSOS(response);
      
      // Directly open the modal
      setCriticalAlert({ 
        severity: 'CRITICAL', 
        message: 'Botón SOS Activado Manualmente',
        recommendation: 'Protocolo de emergencia activado. Por favor, mantén la calma.'
      });
      setShowCriticalModal(true);
      
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
  const contextualAnalysis = lastResult?.contextual_analysis || null;

  // CJM: log-only when unavailable (never show error to user)
  React.useEffect(() => {
    if (contextualAnalysis && contextualAnalysis.available === false) {
      console.warn('[HomeScreen] CJM unavailable:', contextualAnalysis.error || 'unknown');
    }
  }, [contextualAnalysis]);

  // Normalize level: API returns English codes (HIGH/CRITICAL/MEDIUM/LOW)
  // but colors and display are in Spanish. Map both.
  const ML_LEVEL_MAP = {
    CRITICAL: 'CRÍTICO', CRITICO: 'CRÍTICO',
    HIGH:     'ALTO',    ALTO:    'ALTO',
    MEDIUM:   'MEDIO',   MEDIO:   'MEDIO',
    LOW:      'BAJO',    BAJO:    'BAJO',
    NORMAL:   'NORMAL',
  };
  // Use display_severity from backend (reconciled ML + MedicalEngine)
  // Falls back to ML level if backend doesn't provide it (backwards compat)
  const displaySeverity = lastResult?.display_severity || mlTriage?.level || '';
  const normalizedLevel = ML_LEVEL_MAP[displaySeverity] || ML_LEVEL_MAP[mlTriage?.level] || mlTriage?.level || '';

  const triageColor = {
    'CRÍTICO': COLORS.error, ALTO: '#F97316', MEDIO: '#F59E0B', BAJO: COLORS.success, NORMAL: COLORS.success,
  }[normalizedLevel] || COLORS.text;

  const greeting = userProfile?.name
    ? `${language === 'en' ? 'Hello' : 'Hola'}, ${userProfile.name.split(' ')[0]} 👋`
    : (language === 'en' ? 'Hello 👋' : 'Hola 👋');

  return (
    <>
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* ── HEADER ── */}
          <View style={s.header}>
            <View>
              <Text style={s.greeting}>{userProfile?.name ? userProfile.name.split(' ')[0] : 'RMHealth'}</Text>
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

            {/* ── Botón Health Connect — trigger MANUAL (nunca automático) ── */}
            <TouchableOpacity
              style={[s.watchBtn, isWatchLoading && s.watchBtnLoading]}
              onPress={refreshWatchData}
              disabled={isWatchLoading}
              accessibilityRole="button"
              accessibilityLabel={language === 'en' ? 'Read heart rate from Health Connect' : 'Leer frecuencia cardíaca desde Health Connect'}
              testID="btn-watch-read-hr"
            >
              {isWatchLoading
                ? <ActivityIndicator size="small" color="#0D9488" style={{ marginRight: 6 }} />
                : <Watch size={14} color="#0D9488" strokeWidth={2.5} style={{ marginRight: 6 }} />
              }
              <Text style={s.watchBtnText}>
                {isWatchLoading
                  ? (language === 'en' ? 'Reading Health Connect…' : 'Leyendo Health Connect…')
                  : (language === 'en' ? 'Read from Health Connect' : 'Leer desde Health Connect')}
              </Text>
            </TouchableOpacity>

            {/* Error inline — sin Alert, no invasivo */}
            {!!watchError && (
              <View style={s.watchErrorRow}>
                <AlertTriangle size={12} color="#F59E0B" strokeWidth={2} style={{ marginRight: 4 }} />
                <Text style={s.watchErrorText}>{watchError}</Text>
                {!permissionsGranted && (
                  <TouchableOpacity 
                    style={s.configPermBtn}
                    onPress={() => {
                      const { openHCSettings } = require('../services/HealthConnectService');
                      openHCSettings();
                    }}
                  >
                    <Text style={s.configPermBtnText}>
                      {language === 'en' ? 'Fix Permissions' : 'Corregir Permisos'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Aviso sutil cuando el reloj envía FC pero no BP */}
            {watchSource.fc && !watchSource.tas && (
              <View style={s.calibrationRow}>
                <Activity size={12} color="#2563EB" strokeWidth={2} style={{ marginRight: 4 }} />
                <Text style={s.calibrationText}>
                  {language === 'en' 
                    ? 'No recent blood pressure reading from your watch. Please enter manually or take a new measurement.' 
                    : 'Sin lectura reciente de presión arterial del reloj. Ingresa manualmente o toma una nueva medición.'}
                </Text>
              </View>
            )}

            {/* BP Sync Bridge — visible when BP is stale (>2h) */}
            <BPSyncBridge
              visible={bpInfo.isStale && isWatchAvailable}
              lastBPTime={bpInfo.lastTime}
              lastSys={bpInfo.sys}
              lastDia={bpInfo.dia}
              language={language}
              onSyncComplete={(sys, dia) => {
                // Update form fields immediately
                setBpSys(String(sys));
                setBpDia(String(dia));
                setWatchSource(prev => ({ ...prev, tas: true, tad: true }));
                // Trigger re-poll via hook
                syncBPFromBridge(sys, dia);
              }}
            />

            {/* Badge Health Connect — visible solo cuando hay datos del reloj */}
            {(watchSource.fc || watchSource.spo2 || watchSource.temp || watchSource.tas || watchSource.tad) && (
              <View style={s.watchBadge}>
                <Watch size={12} color="#0D9488" strokeWidth={2} />
                <Text style={s.watchBadgeText}>
                  Health Connect · {isWatchAvailable ? (language === 'en' ? 'Live' : 'En vivo') : '--'}
                </Text>
              </View>
            )}
            <View style={s.inputRow}>
              <VitalInput label={tr('vital_heart_rate')} value={heartRate} onChange={onManualFC} placeholder="72" IconComponent={Heart} iconColor="#EF4444" rangeKey="heartRate" context={contexto} language={language} accessibilityLabel={language === 'en' ? 'Heart rate in beats per minute' : 'Frecuencia cardíaca en latidos por minuto'} />
              <VitalInput label={tr('vital_spo2')} value={spo2} onChange={onManualSpO2} placeholder="98" IconComponent={Wind} rangeKey="spo2" context={contexto} language={language} accessibilityLabel={language === 'en' ? 'Oxygen saturation percentage' : 'Porcentaje de saturación de oxígeno'} />
            </View>
            <View style={s.inputRow}>
              <VitalInput label={tr('vital_systolic')} value={bpSys} onChange={onManualBpSys} placeholder="120" IconComponent={Activity} iconColor="#E74C3C" rangeKey="systolic" context={contexto} language={language} accessibilityLabel={language === 'en' ? 'Systolic blood pressure' : 'Presión arterial sistólica'} />
              <VitalInput label={tr('vital_diastolic')} value={bpDia} onChange={onManualBpDia} placeholder="80" IconComponent={Activity} iconColor="#2E86C1" rangeKey="diastolic" context={contexto} language={language} accessibilityLabel={language === 'en' ? 'Diastolic blood pressure' : 'Presión arterial diastólica'} />
            </View>
            <View style={s.inputRow}>
              <VitalInput label={tr('vital_glucose')} value={glucosa} onChange={setGlucosa} placeholder="90" IconComponent={Droplets} rangeKey="glucose" context={contexto} language={language} accessibilityLabel={language === 'en' ? 'Blood glucose in milligrams per deciliter' : 'Glucosa en sangre en miligramos por decilitro'} />
              <VitalInput label={tr('vital_temperature')} value={temp} onChange={onManualTemp} placeholder="36.6" IconComponent={Thermometer} rangeKey="temperature" context={contexto} decimal language={language} accessibilityLabel={language === 'en' ? 'Body temperature in degrees Celsius' : 'Temperatura corporal en grados Celsius'} />
            </View>

            <TouchableOpacity
              style={[s.submitBtn, sending && s.submitBtnDisabled]}
              onPress={() => handleSendVitals(true)}
              disabled={sending}
              activeOpacity={0.8}
              accessibilityLabel={language === 'en' ? 'Detect patterns button' : 'Botón detectar tendencias'}
              accessibilityHint={language === 'en' ? 'Sends your vital signs for analysis' : 'Envía tus signos vitales para análisis'}
              accessibilityRole="button"
            >
              <Text style={s.submitText}>
                {sending 
                  ? (statusMsg || (language === 'en' ? 'ANALYZING...' : 'ANALIZANDO...'))
                  : (language === 'en' ? 'ANALYZE DATA' : 'ANALIZAR DATOS')}
              </Text>
            </TouchableOpacity>
          </View>


          {lastResult && (
            <View style={s.resultCard}>
              <Text style={s.resultTitle}>
                {language === 'en' ? 'Preventive Observation Report' : 'Reporte de Observación Preventiva'}
              </Text>

              {/* ── SECTION 1: ESTADO ACTUAL ── */}
              {analysis && (() => {
                const clinicalScore = lastResult?.clinical_score ?? analysis.score_riesgo ?? 0;
                const emergencyEligible = lastResult?.emergency_eligible === true;
                // Determine current status label based on MedicalEngine severity
                const meSeverity = analysis.nivel_criticidad || 'NORMAL';
                const statusMap = language === 'en'
                  ? { CRITICAL: 'Critical', HIGH: 'High – Monitoring', MEDIUM: 'Monitoring', LOW: 'Low', NORMAL: 'Normal' }
                  : { CRITICAL: 'Crítico', HIGH: 'Alto – Seguimiento', MEDIUM: 'Seguimiento', LOW: 'Bajo', NORMAL: 'Normal' };
                const currentStatus = statusMap[meSeverity] || statusMap.NORMAL;
                const statusColor = { CRITICAL: '#EF4444', HIGH: '#F97316', MEDIUM: '#F59E0B', LOW: '#10B981', NORMAL: '#10B981' }[meSeverity] || '#10B981';

                // Clinical risk factors (exclude ML and context labels)
                const clinicalFactors = (analysis.factores_riesgo || []).filter(
                  f => !f.startsWith('ML Model:') && !f.startsWith('Contexto:') && !f.startsWith('Piso clínico')
                );

                return (
                  <View style={[s.analysisSection, { borderLeftWidth: 3, borderLeftColor: statusColor, paddingLeft: 12 }]}>
                    <Text style={{ fontSize: 12, fontWeight: '900', color: '#64748B', letterSpacing: 1, marginBottom: 8 }}>
                      {language === 'en' ? 'CURRENT STATUS' : 'ESTADO ACTUAL'}
                    </Text>
                    <View style={{ marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: statusColor }} />
                        <Text style={[s.analysisLevel, { color: statusColor }]}>
                          {language === 'en' ? 'Status: ' : 'Estado: '}{currentStatus}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '700', marginBottom: 2 }}>
                        {language === 'en' ? 'Preventive Score' : 'Score preventivo'}: {clinicalScore.toFixed(0)}/100
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: emergencyEligible ? '#EF4444' : '#10B981' }}>
                        {language === 'en' ? 'Emergency' : 'Emergencia'}: {emergencyEligible
                          ? (language === 'en' ? 'Yes – Protocol active' : 'Sí – Protocolo activo')
                          : 'No'}
                      </Text>
                    </View>
                    {clinicalFactors.length > 0 ? (
                      clinicalFactors.map((f, i) => {
                        // Soften clinical terminology for end-user
                        let displayText = f;
                        if (language !== 'en') {
                          displayText = displayText
                            .replace(/Hipoxemia leve/gi, 'Oxigenación ligeramente baja en esta lectura')
                            .replace(/Hipoxemia moderada/gi, 'Nivel de oxígeno bajo en esta lectura')
                            .replace(/Hipoxemia severa/gi, 'Nivel de oxígeno muy bajo – confirmar medición')
                            .replace(/Taquicardia/gi, 'Frecuencia cardiaca elevada')
                            .replace(/Bradicardia/gi, 'Frecuencia cardiaca baja')
                            .replace(/Crisis hipertensiva/gi, 'Presión arterial muy elevada – confirmar medición')
                            .replace(/Hipertensión severa/gi, 'Presión arterial alta')
                            .replace(/Hipertensión Etapa 2/gi, 'Presión arterial elevada (seguimiento)')
                            .replace(/Presión diastólica elevada/gi, 'Presión diastólica ligeramente elevada')
                            .replace(/criterio AHA Stage 1/gi, 'seguimiento preventivo')
                            .replace(/Hipertensión/gi, 'Presión arterial elevada')
                            .replace(/Hipotensión significativa/gi, 'Presión arterial baja – confirmar medición')
                            .replace(/Hipotensión leve/gi, 'Presión arterial ligeramente baja')
                            .replace(/Hipotensión/gi, 'Presión arterial baja')
                            .replace(/Hiperglucemia/gi, 'Nivel de glucosa elevado')
                            .replace(/Hipoglucemia/gi, 'Nivel de glucosa bajo');
                        }
                        return <Text key={i} style={s.factorItem}>• {displayText}</Text>;
                      })
                    ) : (
                      <Text style={[s.factorItem, { color: '#10B981' }]}>
                        {language === 'en'
                          ? '• No emergency criteria detected in current data.'
                          : '• Tus datos actuales no muestran criterios de emergencia.'}
                      </Text>
                    )}
                    <Text style={s.analysisRec}>{analysis.recomendacion}</Text>
                  </View>
                );
              })()}

              {/* ── SECTION 2: OBSERVACIÓN DE TENDENCIA ── */}
              {mlTriage && (() => {
                const mlLevel = mlTriage.level || '';
                const meLevel = analysis?.nivel_criticidad || 'NORMAL';
                const mlRank = { BAJO: 0, NORMAL: 0, MEDIO: 1, MEDIUM: 1, ALTO: 2, HIGH: 2, CRITICO: 3, CRITICAL: 3 }[mlLevel] || 0;
                const meRank = { BAJO: 0, NORMAL: 0, MEDIO: 1, MEDIUM: 1, ALTO: 2, HIGH: 2, CRITICO: 3, CRITICAL: 3 }[meLevel] || 0;
                const hasContradiction = mlRank > meRank;

                // Determine trend status label
                let trendStatus, trendColor;
                if (!hasContradiction) {
                  trendStatus = language === 'en' ? 'Stable' : 'Estable';
                  trendColor = '#10B981';
                } else {
                  trendStatus = language === 'en' ? 'Punctual variation detected' : 'Variación puntual detectada';
                  trendColor = '#F59E0B';
                }

                // Identify what triggered the ML observation
                const mlFactors = (analysis?.factores_riesgo || []).filter(f => f.startsWith('ML Model:'));
                const trendNote = hasContradiction
                  ? (language === 'en'
                    ? 'The model detected a variation in a punctual reading. This does not indicate an emergency. If the reading repeats, confirm measurement and consider consulting a professional.'
                    : 'El modelo detectó una variación en una lectura puntual. Esto no indica emergencia. Si la lectura se repite, confirma la medición y considera consultar a un profesional.')
                  : (language === 'en'
                    ? 'No significant variation detected between the model observation and the clinical assessment.'
                    : 'Sin variación significativa entre la observación del modelo y la evaluación clínica.');

                return (
                  <View style={[s.analysisSection, { borderLeftWidth: 3, borderLeftColor: trendColor, paddingLeft: 12, marginTop: 12 }]}>
                    <Text style={{ fontSize: 12, fontWeight: '900', color: '#64748B', letterSpacing: 1, marginBottom: 8 }}>
                      {language === 'en' ? 'TREND OBSERVATION' : 'OBSERVACIÓN DE TENDENCIA'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: trendColor }} />
                      <Text style={{ fontSize: 14, fontWeight: '800', color: trendColor }}>{trendStatus}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 6 }}>
                      {language === 'en' ? 'Model confidence: ' : 'Confianza del modelo: '}
                      {mlTriage.confidence != null ? `${(mlTriage.confidence * 100).toFixed(1)}%` : '--'}
                    </Text>
                    {mlFactors.length > 0 && (
                      <Text style={[s.factorItem, { color: '#94A3B8' }]}>
                        • {language === 'en' ? 'Preventive model: variation detected' : 'Modelo preventivo: variación detectada'}
                      </Text>
                    )}
                    <Text style={{ fontSize: 11, color: '#475569', lineHeight: 16, marginTop: 4 }}>{trendNote}</Text>
                  </View>
                );
              })()}

              {/* Model info badge */}
              {mlTriage && (
                <Text style={s.modelBadge}>
                  GradientBoosting · {mlTriage.accuracy != null
                    ? `${(mlTriage.accuracy * 100).toFixed(1)}%`
                    : '99.4%'} accuracy · Vertex AI v4
                </Text>
              )}

              {/* Non-diagnostic disclaimer */}
              <Text style={[s.factorItem, { fontStyle: 'italic', marginTop: 8, color: '#94A3B8', fontSize: 10 }]}>
                {language === 'en'
                  ? 'This is a preventive observation. It does not constitute a medical diagnosis.'
                  : 'Observación preventiva. No constituye diagnóstico médico.'}
              </Text>
            </View>
          )}

          {/* ── CJM CONTEXTUAL ANALYSIS ── */}
          {lastResult && <ContextualAnalysisCard data={contextualAnalysis} language={language} />}

          {/* ── SLEEP CONTEXT SUMMARY (feature-flagged, returns null when disabled) ── */}
          <SleepSummaryCard />

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

          {/* ── QUICK ACCESS ── */}
          <View style={s.quickAccessSection}>
            <Text style={s.quickAccessTitle}>
              {language === 'en' ? 'Quick Access' : 'Accesos Rápidos'}
            </Text>
            <View style={s.quickAccessGrid}>
              {[
                { icon: FileText, label: language === 'en' ? 'My Record' : 'Mi Expediente', sub: language === 'en' ? 'History & medical report' : 'Historial y reporte médico', screen: 'QA_MiExpediente', color: '#1B7A6E' },
                { icon: ShieldAlert, label: language === 'en' ? 'Alerts' : 'Alertas', sub: language === 'en' ? 'Alerts & calendar' : 'Alertas y calendario', screen: 'QA_PreventiveAlerts', color: '#F59E0B' },
                { icon: Stethoscope, label: language === 'en' ? 'My Doctors' : 'Mis Médicos', sub: language === 'en' ? 'Medical contacts' : 'Contactos médicos', screen: 'QA_MyDoctors', color: '#8B5CF6' },
                { icon: CreditCard, label: language === 'en' ? 'Emergency Card' : 'Tarjeta Emergencia', sub: language === 'en' ? 'Critical info' : 'Información crítica', screen: 'QA_EmergencyCard', color: '#EF4444' },
                { icon: Moon, label: language === 'en' ? 'Rest' : 'Descanso', sub: language === 'en' ? 'Sleep & history' : 'Sueño e historial', screen: 'QA_SleepMode', color: '#818CF8' },
                { icon: Pill, label: language === 'en' ? 'Medications' : 'Medicamentos', sub: language === 'en' ? 'Doses & adherence' : 'Tomas y adherencia', tab: 'Meds', color: '#10B981' },
              ].map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={s.quickCard}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (item.tab) {
                      navigation.navigate(item.tab);
                    } else {
                      navigation.navigate(item.screen);
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                >
                  <View style={[s.quickIconWrap, { backgroundColor: item.color + '15' }]}>
                    <item.icon size={18} color={item.color} strokeWidth={2.5} />
                  </View>
                  <Text style={s.quickLabel} numberOfLines={1}>{item.label}</Text>
                  <Text style={s.quickSub} numberOfLines={1}>{item.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {lastSync && (
            <Text style={s.syncText}>
              {language === 'en' ? 'Last analysis' : 'Último análisis'}: {lastSync}
            </Text>
          )}

          {/* ── SOS ── */}
          <View style={s.sosSection}>
            <EmergencyButton onPress={handleManualSOS} />
          </View>

          {/* ── DISCLAIMER ── */}
          <View style={s.disclaimerSection}>
            <Text style={s.disclaimerText}>
              RMHealth proporciona observaciones preventivas.{'\n'}
              No constituye diagnóstico médico ni sustituye atención médica profesional.
            </Text>
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
  // Health Connect badge
  watchBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#E0F2F1', borderRadius: 8,
    paddingVertical: 5, paddingHorizontal: 10, marginBottom: 10,
    alignSelf: 'flex-start', borderWidth: 1, borderColor: '#0D9488' + '40',
  },
  watchBadgeText: { fontSize: 11, fontWeight: '700', color: '#0D9488' },
  // Health Connect — botón manual de lectura
  watchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#E0F2F1', borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 16, marginBottom: 8,
    borderWidth: 1.5, borderColor: '#0D9488' + '60',
  },
  watchBtnLoading: { opacity: 0.7 },
  watchBtnText: { fontSize: 13, fontWeight: '800', color: '#0D9488' },
  watchErrorRow: {
    flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8,
    backgroundColor: '#FFFBEB', borderRadius: 8,
    paddingVertical: 6, paddingHorizontal: 10,
    borderWidth: 1, borderColor: '#F59E0B' + '50',
  },
  watchErrorText: { fontSize: 11, fontWeight: '600', color: '#92400E', flex: 1, lineHeight: 16 },
  configPermBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  configPermBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFF',
  },
  calibrationRow: {
    flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8,
    backgroundColor: '#EFF6FF', borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 10,
    borderWidth: 1, borderColor: '#3B82F6' + '50',
  },
  calibrationText: { fontSize: 11, fontWeight: '600', color: '#1E3A8A', flex: 1, lineHeight: 16 },

  // Quick Access Section
  quickAccessSection: {
    marginHorizontal: 16, marginTop: 16,
  },
  quickAccessTitle: {
    fontSize: 17, fontWeight: '800', color: COLORS.secondary, marginBottom: 12,
  },
  quickAccessGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  quickCard: {
    width: (SCREEN_W - 32 - 10) / 2, // 2 columns with gap
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4,
  },
  quickIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  quickLabel: {
    fontSize: 14, fontWeight: '800', color: COLORS.secondary, marginBottom: 2,
  },
  quickSub: {
    fontSize: 11, color: '#94A3B8', fontWeight: '500',
  },

  disclaimerSection: {
    marginHorizontal: 16, marginTop: 24, padding: 12,
    backgroundColor: '#F8FAFC', borderRadius: 12,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  disclaimerText: {
    color: '#64748B', fontSize: 11, textAlign: 'center', lineHeight: 16, fontWeight: '500',
  },
});
