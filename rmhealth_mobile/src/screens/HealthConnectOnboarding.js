/**
 * HealthConnectOnboarding.js
 * Guided Health Connect permissions onboarding screen.
 * 
 * Shows which permissions RMHealth needs, their current status
 * (granted/pending), and provides actions to request or verify them.
 * 
 * Accessible from Más → Permisos Health Connect.
 * Non-blocking: the app works without HC permissions, they just enable
 * richer data from wearables.
 * 
 * © 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shield, Check, Clock, RefreshCw, Heart, Droplets, Activity, Moon, ChevronRight } from 'lucide-react-native';
import { COLORS } from '../theme';

// HC functions — lazy loaded via feature flag
let checkGrantedPermissions = async () => [];
let requestWatchPermissions = async () => false;
let openHCSettings = async () => false;

try {
  const HC = require('../services/HealthConnectService');
  checkGrantedPermissions = HC.checkGrantedPermissions;
  requestWatchPermissions = HC.requestWatchPermissions;
  openHCSettings = HC.openHCSettings;
} catch (e) {
  console.warn('[HCOnboarding] HealthConnectService not available');
}

// Define the permissions we care about for the pilot
const PERMISSION_DEFS = [
  {
    id: 'heart_rate',
    label: 'Frecuencia Cardíaca',
    desc: 'Leer datos del pulso desde tu reloj o dispositivo.',
    icon: Heart,
    recordType: 'HeartRate',
    accessType: 'read',
  },
  {
    id: 'spo2',
    label: 'Saturación de Oxígeno (SpO2)',
    desc: 'Leer niveles de oxígeno en sangre.',
    icon: Droplets,
    recordType: 'OxygenSaturation',
    accessType: 'read',
  },
  {
    id: 'bp_read',
    label: 'Presión Arterial (lectura)',
    desc: 'Leer registros de presión arterial.',
    icon: Activity,
    recordType: 'BloodPressure',
    accessType: 'read',
  },
  {
    id: 'bp_write',
    label: 'Presión Arterial (escritura)',
    desc: 'Sincronizar mediciones de presión a Health Connect.',
    icon: Activity,
    recordType: 'BloodPressure',
    accessType: 'write',
  },
  {
    id: 'sleep',
    label: 'Sueño',
    desc: 'Leer sesiones de descanso registradas por tu dispositivo.',
    icon: Moon,
    recordType: 'SleepSession',
    accessType: 'read',
  },
];

export function HealthConnectOnboarding({ navigation }) {
  const [permissionStatus, setPermissionStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const granted = await checkGrantedPermissions();
      const statusMap = {};

      for (const def of PERMISSION_DEFS) {
        const isGranted = granted.some(
          (p) => p.recordType === def.recordType && p.accessType === def.accessType
        );
        statusMap[def.id] = isGranted;
      }

      setPermissionStatus(statusMap);
    } catch (err) {
      console.warn('[HCOnboarding] Error checking permissions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleRequestPermissions = async () => {
    setRequesting(true);
    try {
      const result = await requestWatchPermissions();
      if (result === false || (result && !result.available && result.reason)) {
        Alert.alert(
          'Health Connect',
          'No se pudieron solicitar los permisos. Verifica que Health Connect esté instalado y actualizado en tu dispositivo.',
          [{ text: 'Entendido' }]
        );
      }
      // Refresh status after request
      await refreshStatus();
    } catch (err) {
      Alert.alert('Error', 'No se pudieron solicitar permisos: ' + (err?.message || err));
    } finally {
      setRequesting(false);
    }
  };

  const handleOpenSettings = async () => {
    const result = await openHCSettings();
    if (!result) {
      Alert.alert(
        'Health Connect',
        'No se pudo abrir la configuración de Health Connect. Verifica que esté instalado en tu dispositivo.'
      );
    }
  };

  const grantedCount = Object.values(permissionStatus).filter(Boolean).length;
  const totalCount = PERMISSION_DEFS.length;
  const allGranted = grantedCount === totalCount;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.headerIcon, allGranted && styles.headerIconGranted]}>
            <Shield size={32} color={allGranted ? '#10B981' : '#1B7A6E'} strokeWidth={2} />
          </View>
          <Text style={styles.title}>Permisos de Health Connect</Text>
          <Text style={styles.subtitle}>
            RMHealth necesita tu autorización para leer tus datos de salud desde Health Connect.
          </Text>
          <Text style={styles.subtitleLight}>
            Puedes activar o retirar permisos desde Health Connect en cualquier momento.
          </Text>
        </View>

        {/* Status summary */}
        <View style={[styles.statusCard, allGranted ? styles.statusCardOk : styles.statusCardPending]}>
          <Text style={styles.statusText}>
            {allGranted
              ? '✅ Todos los permisos concedidos'
              : `${grantedCount} de ${totalCount} permisos concedidos`}
          </Text>
        </View>

        {/* Permission list */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Verificando permisos…</Text>
          </View>
        ) : (
          <View style={styles.permissionList}>
            {PERMISSION_DEFS.map((def) => {
              const granted = permissionStatus[def.id];
              const IconComp = def.icon;
              return (
                <View key={def.id} style={styles.permissionRow}>
                  <View style={[styles.permIconWrap, granted && styles.permIconGranted]}>
                    <IconComp size={20} color={granted ? '#10B981' : '#64748B'} strokeWidth={2} />
                  </View>
                  <View style={styles.permTextWrap}>
                    <Text style={styles.permLabel}>{def.label}</Text>
                    <Text style={styles.permDesc}>{def.desc}</Text>
                  </View>
                  <View style={[styles.permBadge, granted ? styles.permBadgeOk : styles.permBadgePending]}>
                    {granted ? (
                      <Check size={14} color="#10B981" strokeWidth={3} />
                    ) : (
                      <Clock size={14} color="#F59E0B" strokeWidth={2} />
                    )}
                    <Text style={[styles.permBadgeText, granted ? styles.permBadgeTextOk : styles.permBadgeTextPending]}>
                      {granted ? 'Concedido' : 'Pendiente'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actions}>
          {!allGranted && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleRequestPermissions}
              disabled={requesting}
              accessibilityLabel="Conceder permisos de Health Connect"
              accessibilityRole="button"
            >
              {requesting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Shield size={18} color="#FFF" strokeWidth={2} style={{ marginRight: 8 }} />
                  <Text style={styles.primaryButtonText}>Conceder permisos</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={refreshStatus}
            accessibilityLabel="Verificar permisos"
            accessibilityRole="button"
          >
            <RefreshCw size={18} color="#1B7A6E" strokeWidth={2} style={{ marginRight: 8 }} />
            <Text style={styles.secondaryButtonText}>Verificar permisos</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={handleOpenSettings}
            accessibilityLabel="Abrir configuración de Health Connect"
            accessibilityRole="button"
          >
            <Text style={styles.linkButtonText}>Abrir Health Connect</Text>
            <ChevronRight size={16} color="#1B7A6E" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            RMHealth no almacena tus datos de salud fuera de tu dispositivo sin tu consentimiento explícito.
            Todos los datos se procesan localmente y en cumplimiento con LFPDPPP/GDPR.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4F8',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E0F2F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerIconGranted: {
    backgroundColor: '#D1FAE5',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  subtitleLight: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 16,
  },
  statusCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
  },
  statusCardOk: {
    backgroundColor: '#D1FAE5',
    borderColor: '#6EE7B7',
  },
  statusCardPending: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 8,
  },
  permissionList: {
    marginBottom: 24,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1,
  },
  permIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  permIconGranted: {
    backgroundColor: '#D1FAE5',
  },
  permTextWrap: {
    flex: 1,
    marginRight: 8,
  },
  permLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  permDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  permBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  permBadgeOk: {
    backgroundColor: '#D1FAE5',
  },
  permBadgePending: {
    backgroundColor: '#FEF3C7',
  },
  permBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  permBadgeTextOk: {
    color: '#059669',
  },
  permBadgeTextPending: {
    color: '#D97706',
  },
  actions: {
    marginBottom: 24,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1B7A6E',
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 12,
    elevation: 3,
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E0F2F1',
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#B2DFDB',
  },
  secondaryButtonText: {
    color: '#1B7A6E',
    fontSize: 15,
    fontWeight: '700',
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  linkButtonText: {
    color: '#1B7A6E',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 4,
  },
  disclaimer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  disclaimerText: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 18,
    textAlign: 'center',
  },
});
