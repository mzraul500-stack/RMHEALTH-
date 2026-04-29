import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  Linking, SafeAreaView, Animated, PermissionsAndroid, Platform, AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING } from '../theme';
import { useLanguage } from '../contexts/LanguageContext';

// ════════════════════════════════════════════════════════════
// STORAGE KEY
// ════════════════════════════════════════════════════════════
const SETUP_DONE_KEY = '@rmhealth/setup_done';
const PERM_STATE_KEY = '@rmhealth/perm_state';

// ════════════════════════════════════════════════════════════
// PERMISSIONS CONFIGURATION
// ════════════════════════════════════════════════════════════
const PERMISSIONS = [
  // ── CRITICAL (app cannot function without these) ──
  {
    id: 'bluetooth',
    icon: '📶',
    title: 'Bluetooth en segundo plano',
    description: 'Para monitorear tu Watch 8 mientras duermes',
    critical: true,
    action: 'bluetooth',
    runtimePerm: 'android.permission.BLUETOOTH_CONNECT',
  },
  {
    id: 'location',
    icon: '📍',
    title: 'Ubicación GPS en segundo plano',
    description: 'Para enviar tu ubicación exacta al hospital en caso de emergencia',
    critical: true,
    action: 'location',
    runtimePerm: 'android.permission.ACCESS_FINE_LOCATION',
  },
  {
    id: 'battery',
    icon: '🔋',
    title: 'Sin restricción de batería',
    description: 'Para que el monitoreo no se interrumpa cuando el teléfono ahorra energía',
    critical: true,
    action: 'battery',
  },
  {
    id: 'notifications',
    icon: '🔔',
    title: 'Notificaciones prioritarias',
    description: 'Para que las alertas lleguen aunque el teléfono esté en silencio',
    critical: true,
    action: 'notifications',
    runtimePerm: 'android.permission.POST_NOTIFICATIONS',
  },
  // ── IMPORTANT (improve protection) ──
  {
    id: 'motion',
    icon: '🏃',
    title: 'Sensores de movimiento',
    description: 'Para detectar caídas y posible inconsciencia',
    critical: false,
    action: 'app_settings',
    runtimePerm: 'android.permission.ACTIVITY_RECOGNITION',
  },
  {
    id: 'contacts',
    icon: '👥',
    title: 'Contactos',
    description: 'Para acceder rápido a tus contactos de emergencia',
    critical: false,
    action: 'app_settings',
    runtimePerm: 'android.permission.READ_CONTACTS',
  },
  {
    id: 'sms',
    icon: '💬',
    title: 'SMS',
    description: 'Para enviar alertas si no hay conexión a internet',
    critical: false,
    action: 'app_settings',
    runtimePerm: 'android.permission.SEND_SMS',
  },
  {
    id: 'storage',
    icon: '💾',
    title: 'Almacenamiento',
    description: 'Para guardar tu historial cuando no hay conexión',
    critical: false,
    action: 'app_settings',
  },
];

// Maps each permission type to the correct Android system settings screen
const SETTINGS_INTENTS = {
  bluetooth: 'android.settings.BLUETOOTH_SETTINGS',
  location: 'android.settings.LOCATION_SOURCE_SETTINGS',
  battery: 'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
  notifications: 'android.settings.APP_NOTIFICATION_SETTINGS',
  app_settings: null, // falls back to Linking.openSettings()
};

// ════════════════════════════════════════════════════════════
// DEVICE LIST (original data, preserved)
// ════════════════════════════════════════════════════════════
const SUPPORTED_DEVICES = [
  {
    id: 'samsung_watch',
    name: 'Samsung Galaxy Watch',
    sdk: 'Health Connect',
    platform: 'Android',
    status: 'available',
    icon: '⌚'
  },
  {
    id: 'wear_os',
    name: 'Google Pixel Watch',
    sdk: 'Health Connect',
    platform: 'Android',
    status: 'available',
    icon: '⌚'
  },
  {
    id: 'rmhealth_wearable',
    name: 'RMHealth Brazalete',
    sdk: 'RMHealth SDK',
    platform: 'BLE / Cellular',
    status: 'coming_soon',
    icon: '🔒'
  }
];

const TEXTS = {
  es: {
    title: 'Configuración de Dispositivos',
    subtitle: 'Selecciona el reloj que usarás para enviar signos vitales a RmHealth. Requiere el dispositivo físico.',
    available: 'DISPONIBLE',
    selected: 'SELECCIONADO',
    coming_soon: 'PRÓXIMAMENTE',
    not_connected: 'Sin dispositivo conectado',
    info_title: '¿Por qué vincular un reloj?',
    info_text: 'El protocolo RmHealth utiliza los sensores del reloj para monitorear tus signos vitales de forma continua y detectar anomalías automáticamente.',
    manual_note: 'Actualmente estás usando ingreso manual de signos vitales. Conecta un reloj para activar el monitoreo continuo.',
  },
  en: {
    title: 'Device Settings',
    subtitle: 'Select the watch you will use to send vital signs to RmHealth. Requires the physical device.',
    available: 'AVAILABLE',
    selected: 'SELECTED',
    coming_soon: 'COMING SOON',
    not_connected: 'No device connected',
    info_title: 'Why connect a watch?',
    info_text: 'The RmHealth protocol uses the watch sensors to continuously monitor your vital signs and automatically detect anomalies.',
    manual_note: 'You are currently using manual vital signs entry. Connect a watch to enable continuous monitoring.',
  }
};

// ════════════════════════════════════════════════════════════
// PERMISSION ROW COMPONENT
// ════════════════════════════════════════════════════════════
function PermissionRow({ perm, enabled, onToggle }) {
  const [scale] = useState(new Animated.Value(1));

  const handlePress = useCallback(async () => {
    // Bounce animation
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.95, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();

    // 1. Try runtime permission request first (instant popup)
    if (perm.runtimePerm && Platform.OS === 'android') {
      try {
        const result = await PermissionsAndroid.request(perm.runtimePerm, {
          title: perm.title,
          message: perm.description,
          buttonPositive: 'Permitir',
          buttonNegative: 'Ahora no',
        });
        if (result === PermissionsAndroid.RESULTS.GRANTED) {
          onToggle(perm.id, true);
          return;
        }
      } catch (e) {
        console.warn('[Permissions] Runtime request failed:', e);
      }
    }

    // 2. Open the specific system settings screen
    //    Auto-grant when user returns from settings
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        onToggle(perm.id, true);
        subscription.remove();
      }
    });

    const intentAction = SETTINGS_INTENTS[perm.action];
    if (intentAction) {
      try {
        await Linking.sendIntent(intentAction);
        return;
      } catch (e) {
        console.warn('[Permissions] Intent failed, falling back:', e);
      }
    }

    // 3. Fallback: open generic app settings
    Linking.openSettings();
  }, [scale, perm, onToggle]);

  const handleToggle = useCallback(() => {
    onToggle(perm.id);
  }, [perm.id, onToggle]);

  return (
    <Animated.View style={[s.permCard, { transform: [{ scale }] }]}>
      {/* Icon circle */}
      <View style={[s.permIconWrap, enabled ? s.permIconActive : s.permIconPending]}>
        <Text style={s.permIcon}>{perm.icon}</Text>
      </View>

      {/* Text content */}
      <View style={s.permTextWrap}>
        <Text style={s.permTitle}>{perm.title}</Text>
        <Text style={s.permDesc}>{perm.description}</Text>
      </View>

      {/* Right side: status + action */}
      <View style={s.permActions}>
        {/* Status badge */}
        <TouchableOpacity onPress={handleToggle} activeOpacity={0.6}>
          <View style={[s.statusChip, enabled ? s.statusChipActive : s.statusChipPending]}>
            <Text style={s.statusChipText}>{enabled ? 'OK' : '--'}</Text>
          </View>
        </TouchableOpacity>

        {/* Open Settings button */}
        {!enabled && (
          <TouchableOpacity style={s.activateBtn} onPress={handlePress} activeOpacity={0.7}>
            <Text style={s.activateBtnText}>Activar</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

// ════════════════════════════════════════════════════════════
// PERMISSION SETUP SCREEN (first-time only)
// ════════════════════════════════════════════════════════════
function PermissionSetupScreen({ onComplete }) {
  const initialState = {};
  PERMISSIONS.forEach((p) => { initialState[p.id] = false; });
  const [permState, setPermState] = useState(initialState);
  const [loaded, setLoaded] = useState(false);

  // Load persisted permission state on mount
  useEffect(() => {
    AsyncStorage.getItem(PERM_STATE_KEY)
      .then((val) => {
        if (val) {
          try {
            const saved = JSON.parse(val);
            setPermState((prev) => ({ ...prev, ...saved }));
          } catch (e) { /* ignore parse errors */ }
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Auto-grant storage on Android 13+ (API 33) — permission is deprecated
  useEffect(() => {
    if (loaded && Platform.OS === 'android' && Platform.Version >= 33) {
      setPermState((prev) => {
        if (!prev.storage) return { ...prev, storage: true };
        return prev;
      });
    }
  }, [loaded]);

  // ── AUTO-REQUEST ALL PERMISSIONS ON FIRST LOAD ──
  // Shows native Android popups in sequence so user just taps "Allow"
  useEffect(() => {
    if (!loaded || Platform.OS !== 'android') return;

    // Only auto-request once (check flag in AsyncStorage)
    const AUTO_REQ_KEY = '@rmhealth/auto_requested';
    AsyncStorage.getItem(AUTO_REQ_KEY).then(async (val) => {
      if (val === 'true') return; // Already done

      const granted = {};

      // 1. Request all standard runtime permissions in batch
      const runtimePerms = PERMISSIONS
        .filter((p) => p.runtimePerm)
        .map((p) => p.runtimePerm);

      try {
        const results = await PermissionsAndroid.requestMultiple(runtimePerms);
        // Map results back to permission IDs
        PERMISSIONS.forEach((p) => {
          if (p.runtimePerm && results[p.runtimePerm] === PermissionsAndroid.RESULTS.GRANTED) {
            granted[p.id] = true;
          }
        });
      } catch (e) {
        console.warn('[Setup] Batch permission request failed:', e);
      }

      // 2. Request background location separately (Android requires it after fine location)
      if (granted.location) {
        try {
          const bgResult = await PermissionsAndroid.request(
            'android.permission.ACCESS_BACKGROUND_LOCATION',
            {
              title: 'Ubicación en segundo plano',
              message: 'RMHealth necesita tu ubicación en segundo plano para enviarla al hospital en caso de emergencia.',
              buttonPositive: 'Permitir',
              buttonNegative: 'Ahora no',
            }
          );
          // Location stays granted regardless of background result
        } catch (e) {
          console.warn('[Setup] Background location request failed:', e);
        }
      }

      // 3. Open battery optimization dialog
      try {
        const sub = AppState.addEventListener('change', (nextState) => {
          if (nextState === 'active') {
            setPermState((prev) => ({ ...prev, battery: true }));
            sub.remove();
          }
        });
        await Linking.sendIntent('android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS');
      } catch (e) {
        console.warn('[Setup] Battery optimization intent failed:', e);
      }

      // 4. Auto-grant storage on Android 13+
      if (Platform.Version >= 33) {
        granted.storage = true;
      }

      // 5. Apply all granted permissions
      setPermState((prev) => {
        const updated = { ...prev };
        Object.keys(granted).forEach((id) => { updated[id] = true; });
        return updated;
      });

      // Mark auto-request as done
      await AsyncStorage.setItem(AUTO_REQ_KEY, 'true').catch(() => {});
    });
  }, [loaded]);

  // Persist state to AsyncStorage on every change
  useEffect(() => {
    if (loaded) {
      AsyncStorage.setItem(PERM_STATE_KEY, JSON.stringify(permState)).catch(() => {});
    }
  }, [permState, loaded]);

  const togglePerm = useCallback((id, forceValue) => {
    setPermState((prev) => ({ ...prev, [id]: forceValue !== undefined ? forceValue : !prev[id] }));
  }, []);

  const criticalPerms = PERMISSIONS.filter((p) => p.critical);
  const importantPerms = PERMISSIONS.filter((p) => !p.critical);
  const allCriticalDone = criticalPerms.every((p) => permState[p.id]);

  const handleFinish = useCallback(async () => {
    if (!allCriticalDone) return;
    try {
      await AsyncStorage.setItem(SETUP_DONE_KEY, 'true');
      await AsyncStorage.setItem(PERM_STATE_KEY, JSON.stringify(permState));
    } catch (e) {
      console.warn('[Setup] Could not persist setup state:', e);
    }
    onComplete();
  }, [allCriticalDone, onComplete, permState]);

  const criticalDoneCount = criticalPerms.filter((p) => permState[p.id]).length;

  return (
    <SafeAreaView style={s.setupSafe}>
      <ScrollView contentContainerStyle={s.setupScroll} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={s.setupHeader}>
          <View style={s.shieldCircle}>
            <Text style={s.shieldIcon}>🛡️</Text>
          </View>
          <Text style={s.setupTitle}>Configuración Inicial</Text>
          <Text style={s.setupSubtitle}>
            RMHealth necesita estos permisos para protegerte 24/7.{'\n'}
            Activa cada uno y marca cuando esté listo.
          </Text>
        </View>

        {/* ── Progress bar ── */}
        <View style={s.progressWrap}>
          <View style={s.progressBg}>
            <View style={[s.progressFill, { width: `${(criticalDoneCount / 4) * 100}%` }]} />
          </View>
          <Text style={s.progressText}>{criticalDoneCount}/4 críticos activados</Text>
        </View>

        {/* ── Critical section ── */}
        <View style={s.sectionWrap}>
          <View style={s.sectionHeaderRow}>
            <View style={s.sectionBadgeCritical}>
              <Text style={s.sectionBadgeText}>OBLIGATORIO</Text>
            </View>
            <Text style={s.sectionLabel}>Sin estos permisos la app no funciona</Text>
          </View>
          <View style={s.sectionCardCritical}>
            {criticalPerms.map((perm) => (
              <PermissionRow
                key={perm.id}
                perm={perm}
                enabled={permState[perm.id]}
                onToggle={togglePerm}
              />
            ))}
          </View>
        </View>

        {/* ── Important section ── */}
        <View style={s.sectionWrap}>
          <View style={s.sectionHeaderRow}>
            <View style={s.sectionBadgeImportant}>
              <Text style={s.sectionBadgeText}>RECOMENDADO</Text>
            </View>
            <Text style={s.sectionLabel}>Mejoran tu protección</Text>
          </View>
          <View style={s.sectionCardImportant}>
            {importantPerms.map((perm) => (
              <PermissionRow
                key={perm.id}
                perm={perm}
                enabled={permState[perm.id]}
                onToggle={togglePerm}
              />
            ))}
          </View>
        </View>

        {/* ── Finish button ── */}
        <TouchableOpacity
          style={[s.finishBtn, !allCriticalDone && s.finishBtnDisabled]}
          onPress={handleFinish}
          disabled={!allCriticalDone}
          activeOpacity={0.8}
        >
          <Text style={s.finishBtnIcon}>{allCriticalDone ? '🚀' : '🔒'}</Text>
          <Text style={s.finishBtnText}>
            {allCriticalDone ? 'Todo listo, comenzar monitoreo' : 'Activa los 4 permisos críticos'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

import { Switch } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

// ════════════════════════════════════════════════════════════
// DEVICE LIST SCREEN
// ════════════════════════════════════════════════════════════
function DeviceListScreen() {
  const { language } = useLanguage();
  const { isHighContrast, toggleHighContrast, colors } = useTheme();
  const txt = TEXTS[language] || TEXTS.es;
  const [selectedDevice, setSelectedDevice] = useState(null);

  // Translation fallbacks for the new accessibility block
  const a11yTitle = language === 'en' ? 'Accessibility (WCAG 2.1)' : 'Accesibilidad (WCAG 2.1)';
  const highContrastTxt = language === 'en' ? 'High Contrast Mode' : 'Modo Alto Contraste';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.title, { color: colors.secondary }]}>{txt.title}</Text>
        <Text style={[styles.subtitle, { color: colors.text }]}>{txt.subtitle}</Text>

        {/* Manual mode indicator */}
        <View style={[styles.manualBanner, isHighContrast && styles.hcBorder]}>
          <Text style={styles.manualIcon}>✍️</Text>
          <Text style={[styles.manualText, { color: isHighContrast ? colors.text : '#92400E' }]}>{txt.manual_note}</Text>
        </View>

        {SUPPORTED_DEVICES.map((device) => (
          <TouchableOpacity 
            key={device.id} 
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={`${device.name}. ${device.status === 'available' ? txt.available : txt.coming_soon}`}
            style={[
              styles.deviceCard, 
              selectedDevice === device.id && styles.selectedCard,
              device.status === 'coming_soon' && styles.disabledCard,
              { backgroundColor: colors.surface, borderColor: isHighContrast ? colors.border : COLORS.border },
              isHighContrast && { borderWidth: 2 }
            ]}
            onPress={() => device.status === 'available' && setSelectedDevice(device.id)}
            disabled={device.status === 'coming_soon'}
          >
            <View style={[styles.iconContainer, isHighContrast && { backgroundColor: '#E2E8F0', borderWidth: 1 }]}>
              <Text style={styles.deviceIcon}>{device.icon}</Text>
            </View>
            <View style={styles.deviceInfo}>
              <Text style={[styles.deviceName, { color: colors.text }]}>{device.name}</Text>
              <Text style={[styles.deviceSdk, { color: colors.text }]}>SDK: {device.sdk}</Text>
              <Text style={[styles.devicePlatform, { color: colors.primary }]}>{device.platform}</Text>
            </View>
            {device.status === 'available' ? (
              <View style={[styles.statusBadge, selectedDevice === device.id && styles.activeBadge, isHighContrast && selectedDevice === device.id && { backgroundColor: colors.primary }]}>
                <Text style={[styles.statusText, selectedDevice === device.id && styles.activeText]}>
                  {selectedDevice === device.id ? txt.selected : txt.available}
                </Text>
              </View>
            ) : (
              <View style={[styles.soonBadge, isHighContrast && { borderWidth: 1 }]}>
                <Text style={styles.soonText}>{txt.coming_soon}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}

        <View style={[styles.infoBox, isHighContrast && { borderColor: colors.primary, borderWidth: 2 }]}>
          <Text style={[styles.infoTitle, { color: colors.primary }]}>{txt.info_title}</Text>
          <Text style={[styles.infoText, { color: colors.text }]}>{txt.info_text}</Text>
        </View>

        {/* Accessibility Section */}
        <View style={styles.a11ySection}>
          <Text style={[styles.title, { color: colors.secondary, marginTop: 24 }]}>{a11yTitle}</Text>
          <View style={[styles.deviceCard, { backgroundColor: colors.surface, borderColor: isHighContrast ? colors.border : COLORS.border, justifyContent: 'space-between' }]}>
            <Text style={[styles.deviceName, { color: colors.text }]}>{highContrastTxt}</Text>
            <Switch
              value={isHighContrast}
              onValueChange={toggleHighContrast}
              trackColor={{ false: '#CBD5E1', true: colors.primary }}
              thumbColor={isHighContrast ? '#FFFFFF' : '#FFFFFF'}
              accessible={true}
              accessibilityRole="switch"
              accessibilityLabel={highContrastTxt}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ════════════════════════════════════════════════════════════
// MAIN EXPORT — Conditionally shows setup or device list
// ════════════════════════════════════════════════════════════
export const DeviceSettingsScreen = () => {
  const [loading, setLoading] = useState(true);
  const [setupDone, setSetupDone] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SETUP_DONE_KEY)
      .then((val) => {
        setSetupDone(val === 'true');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <Text style={s.loadingText}>Cargando...</Text>
      </View>
    );
  }

  if (!setupDone) {
    return <PermissionSetupScreen onComplete={() => setSetupDone(true)} />;
  }

  return <DeviceListScreen />;
};

// ════════════════════════════════════════════════════════════
// STYLES — Permission Setup Screen
// ════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  // Loading
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  loadingText: { fontSize: 14, color: '#94A3B8', fontWeight: '600' },

  // Setup layout
  setupSafe: { flex: 1, backgroundColor: COLORS.background },
  setupScroll: { paddingHorizontal: 20, paddingTop: 24 },

  // Header
  setupHeader: { alignItems: 'center', marginBottom: 20 },
  shieldCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(59,175,170,0.12)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 14,
    borderWidth: 2, borderColor: 'rgba(59,175,170,0.25)',
  },
  shieldIcon: { fontSize: 32 },
  setupTitle: { fontSize: 24, fontWeight: '900', color: COLORS.secondary, marginBottom: 8 },
  setupSubtitle: {
    fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20,
    paddingHorizontal: 10,
  },

  // Progress bar
  progressWrap: { marginBottom: 24, alignItems: 'center' },
  progressBg: {
    width: '100%', height: 8, borderRadius: 4,
    backgroundColor: '#E2E8F0', overflow: 'hidden', marginBottom: 6,
  },
  progressFill: {
    height: '100%', borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  progressText: { fontSize: 12, fontWeight: '700', color: '#64748B' },

  // Section wrappers
  sectionWrap: { marginBottom: 20 },
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8,
  },
  sectionBadgeCritical: {
    backgroundColor: '#FEE2E2', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 6, borderWidth: 1, borderColor: '#FECACA',
  },
  sectionBadgeImportant: {
    backgroundColor: 'rgba(59,175,170,0.10)', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 6, borderWidth: 1, borderColor: 'rgba(59,175,170,0.25)',
  },
  sectionBadgeText: { fontSize: 10, fontWeight: '900', color: '#64748B', letterSpacing: 0.5 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },

  sectionCardCritical: {
    backgroundColor: 'rgba(239,68,68,0.04)', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)',
    padding: 6, overflow: 'hidden',
  },
  sectionCardImportant: {
    backgroundColor: 'rgba(59,175,170,0.04)', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(59,175,170,0.15)',
    padding: 6, overflow: 'hidden',
  },

  // Permission card
  permCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 14,
    padding: 14, marginVertical: 4, marginHorizontal: 2,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6,
  },
  permIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  permIconActive: { backgroundColor: 'rgba(16,185,129,0.12)' },
  permIconPending: { backgroundColor: '#FEF3C7' },
  permIcon: { fontSize: 20 },
  permTextWrap: { flex: 1, marginRight: 8 },
  permTitle: { fontSize: 14, fontWeight: '800', color: COLORS.secondary, marginBottom: 2 },
  permDesc: { fontSize: 11, color: '#64748B', lineHeight: 15 },

  // Status chip + activate button
  permActions: { alignItems: 'center', gap: 6, minWidth: 56 },
  statusChip: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2,
  },
  statusChipActive: { borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,0.08)' },
  statusChipPending: { borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.08)' },
  statusChipText: { fontSize: 16 },
  activateBtn: {
    backgroundColor: COLORS.primary, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  activateBtnText: { fontSize: 10, fontWeight: '900', color: '#FFF', letterSpacing: 0.3 },

  // Finish button
  finishBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primary, borderRadius: 16,
    paddingVertical: 18, marginTop: 12, marginHorizontal: 4,
    elevation: 6, shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10,
  },
  finishBtnDisabled: {
    backgroundColor: '#CBD5E1', elevation: 0,
    shadowOpacity: 0,
  },
  finishBtnIcon: { fontSize: 20, marginRight: 10 },
  finishBtnText: { fontSize: 15, fontWeight: '900', color: '#FFF', letterSpacing: 0.5 },
});

// ════════════════════════════════════════════════════════════
// STYLES — Device List Screen (original, preserved exactly)
// ════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: SPACING.lg },
  title: { color: COLORS.secondary, fontSize: 24, fontWeight: 'bold', marginBottom: SPACING.xs },
  subtitle: { color: COLORS.text, fontSize: 14, marginBottom: SPACING.lg, lineHeight: 20 },
  manualBanner: {
    flexDirection: 'row', backgroundColor: '#FEF3C7', borderRadius: 12,
    padding: SPACING.md, marginBottom: SPACING.lg, alignItems: 'center',
    borderWidth: 1, borderColor: '#F59E0B', minHeight: 44,
  },
  hcBorder: { borderWidth: 2, borderColor: '#000' },
  manualIcon: { fontSize: 20, marginRight: 10 },
  manualText: { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 18 },
  deviceCard: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: SPACING.md,
    flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border, elevation: 2, minHeight: 44,
  },
  selectedCard: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: 'rgba(59,175,170,0.05)' },
  disabledCard: { opacity: 0.5 },
  iconContainer: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: '#E2E8F0',
    justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md,
  },
  deviceIcon: { fontSize: 24 },
  deviceInfo: { flex: 1 },
  deviceName: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  deviceSdk: { color: COLORS.text, fontSize: 12, marginTop: 2 },
  devicePlatform: { color: COLORS.primary, fontSize: 10, fontWeight: 'bold', marginTop: 4 },
  statusBadge: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: '#E2E8F0', minHeight: 44, justifyContent: 'center'
  },
  activeBadge: { backgroundColor: COLORS.primary },
  statusText: { color: COLORS.text, fontSize: 10, fontWeight: 'bold' },
  activeText: { color: '#FFF' },
  soonBadge: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.08)', minHeight: 44, justifyContent: 'center'
  },
  soonText: { color: '#94A3B8', fontSize: 8, fontWeight: 'bold' },
  infoBox: {
    marginTop: SPACING.xl, padding: SPACING.md, borderRadius: 12,
    backgroundColor: 'rgba(59,175,170,0.08)', borderLeftWidth: 4, borderLeftColor: COLORS.primary,
  },
  infoTitle: { color: COLORS.primary, fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  infoText: { color: COLORS.text, fontSize: 12, lineHeight: 18 },
  a11ySection: { marginTop: 10 },
});
