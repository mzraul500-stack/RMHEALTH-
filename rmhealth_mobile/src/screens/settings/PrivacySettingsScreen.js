/**
 * PrivacySettingsScreen — View, Revoke, Export, Delete (M2)
 *
 * Accessible from: More → Privacy Settings
 *
 * Features:
 * - View active consents with toggle to revoke
 * - Export all data (GDPR Art. 20 / LFPDPPP Art. 24)
 * - Delete account (GDPR Art. 17 / LFPDPPP Art. 25)
 *
 * © 2025 MORALES ZEPEDA RAUL | Registro INDAUTOR: 03-2025-070109072500-01
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Alert, ActivityIndicator, TextInput,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { COLORS, SPACING } from '../../theme';
import { Activity, MapPin, Pill, UserCheck, TrendingUp, Download, Trash2, Check, Circle } from 'lucide-react-native';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL
  || 'https://rmhealth-api-292048010515.us-central1.run.app/api';

const CONSENT_META = {
  vital_signs:        { IconComp: Activity, labelEs: 'Signos Vitales', labelEn: 'Vital Signs', required: true },
  location:           { IconComp: MapPin, labelEs: 'Ubicación', labelEn: 'Location', required: false },
  medications:        { IconComp: Pill, labelEs: 'Medicamentos', labelEn: 'Medications', required: false },
  emergency_contacts: { IconComp: UserCheck, labelEs: 'Contactos Emergencia', labelEn: 'Emergency Contacts', required: false },
  analytics:          { IconComp: TrendingUp, labelEs: 'Análisis', labelEn: 'Analytics', required: false },
};

export function PrivacySettingsScreen() {
  const { accessToken, user, logout } = useAuth();
  const { language } = useLanguage();
  const insets = useSafeAreaInsets();
  const isEs = language === 'es';

  const [consents, setConsents] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const fetchConsents = useCallback(async () => {
    if (!user?.id || !accessToken) return;
    try {
      const res = await fetch(`${API_BASE}/users/${user.id}/consents`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConsents(data.consents || {});
      }
    } catch (e) {
      console.warn('[Privacy] fetch consents failed:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, accessToken]);

  useEffect(() => { fetchConsents(); }, [fetchConsents]);

  const handleRevoke = async (consentId, consentType) => {
    const meta = CONSENT_META[consentType];
    if (meta?.required) {
      Alert.alert(
        isEs ? 'No se puede revocar' : 'Cannot revoke',
        isEs
          ? 'Este consentimiento es necesario para usar RmHealth.'
          : 'This consent is required to use RmHealth.',
      );
      return;
    }

    Alert.alert(
      isEs ? 'Revocar Consentimiento' : 'Revoke Consent',
      isEs
        ? `¿Seguro que deseas revocar "${meta?.labelEs || consentType}"? La funcionalidad asociada se desactivará.`
        : `Are you sure you want to revoke "${meta?.labelEn || consentType}"? The associated functionality will be disabled.`,
      [
        { text: isEs ? 'Cancelar' : 'Cancel', style: 'cancel' },
        {
          text: isEs ? 'Revocar' : 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch(`${API_BASE}/consents/${consentId}/revoke`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              if (res.ok) {
                const updated = { ...consents };
                delete updated[consentType];
                setConsents(updated);
              }
            } catch (e) {
              Alert.alert('Error', isEs ? 'No se pudo revocar.' : 'Could not revoke.');
            }
          },
        },
      ],
    );
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API_BASE}/users/${user.id}/export-data`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        Alert.alert(
          isEs ? 'Datos Exportados' : 'Data Exported',
          isEs
            ? `Se generó tu exportación. Contiene ${data.data?.consents?.length || 0} consentimientos y ${data.data?.vital_signs_count || 0} registros de signos vitales.`
            : `Your export was generated. It contains ${data.data?.consents?.length || 0} consents and ${data.data?.vital_signs_count || 0} vital sign records.`,
        );
      } else {
        throw new Error('Export failed');
      }
    } catch (e) {
      Alert.alert('Error', isEs ? 'No se pudo exportar.' : 'Could not export.');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteText !== 'ELIMINAR' && deleteText !== 'DELETE') {
      Alert.alert(
        isEs ? 'Confirmación Requerida' : 'Confirmation Required',
        isEs
          ? 'Escribe ELIMINAR en el campo para confirmar.'
          : 'Type DELETE in the field to confirm.',
      );
      return;
    }

    Alert.alert(
      isEs ? 'Eliminar Cuenta' : 'Delete Account',
      isEs
        ? 'Esta acción es PERMANENTE e IRREVERSIBLE. Se eliminarán todos tus datos, historial médico y consentimientos.'
        : 'This action is PERMANENT and IRREVERSIBLE. All your data, medical history and consents will be deleted.',
      [
        { text: isEs ? 'Cancelar' : 'Cancel', style: 'cancel' },
        {
          text: isEs ? 'ELIMINAR TODO' : 'DELETE ALL',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const res = await fetch(`${API_BASE}/users/${user.id}`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ confirmation: deleteText }),
              });
              if (res.ok) {
                Alert.alert(
                  isEs ? 'Cuenta Eliminada' : 'Account Deleted',
                  isEs ? 'Todos tus datos han sido eliminados permanentemente.' : 'All your data has been permanently deleted.',
                  [{ text: 'OK', onPress: () => logout() }],
                );
              } else {
                throw new Error('Delete failed');
              }
            } catch (e) {
              Alert.alert('Error', isEs ? 'No se pudo eliminar la cuenta.' : 'Could not delete account.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={s.safe}>
        <View style={s.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={s.safe}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchConsents(); }}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Section: Active Consents */}
        <Text style={s.sectionTitle}>
          {isEs ? 'Consentimientos Activos' : 'Active Consents'}
        </Text>
        <Text style={s.sectionDesc}>
          {isEs
            ? 'Puedes revocar cualquier consentimiento opcional. Los cambios son inmediatos.'
            : 'You can revoke any optional consent. Changes are immediate.'}
        </Text>

        {Object.keys(CONSENT_META).map((type) => {
          const meta = CONSENT_META[type];
          const consent = consents[type];
          const isActive = consent?.accepted === true;

          return (
            <View key={type} style={[s.consentRow, isActive && s.consentRowActive]}>
              <View style={s.consentIconWrap}>
                <meta.IconComp size={20} color="#1B7A6E" strokeWidth={2} />
              </View>
              <View style={s.consentInfo}>
                <Text style={s.consentLabel}>
                  {isEs ? meta.labelEs : meta.labelEn}
                </Text>
                <Text style={s.consentStatus}>
                  {isActive
                    ? (isEs ? 'Activo' : 'Active')
                    : (isEs ? 'No otorgado' : 'Not granted')}
                </Text>
              </View>
              <Switch
                value={isActive}
                onValueChange={() => {
                  if (isActive && consent?.id) {
                    handleRevoke(consent.id, type);
                  } else if (!isActive) {
                    Alert.alert(
                      isEs ? 'Re-activar' : 'Re-activate',
                      isEs
                        ? 'Para reactivar un consentimiento, ve a Configuración → Consentimiento.'
                        : 'To re-activate a consent, go to Settings → Consent.',
                    );
                  }
                }}
                trackColor={{ false: '#E2E8F0', true: COLORS.primary + '60' }}
                thumbColor={isActive ? COLORS.primary : '#CBD5E1'}
                disabled={meta.required && isActive}
                accessibilityLabel={isEs ? meta.labelEs : meta.labelEn}
              />
            </View>
          );
        })}

        {/* Section: Export Data */}
        <Text style={[s.sectionTitle, { marginTop: 28 }]}>
          {isEs ? 'Exportar Mis Datos' : 'Export My Data'}
        </Text>
        <Text style={s.sectionDesc}>
          {isEs
            ? 'Descarga una copia de todos tus datos en formato JSON. Derecho de portabilidad (GDPR Art. 20, LFPDPPP Art. 24).'
            : 'Download a copy of all your data in JSON format. Right to data portability (GDPR Art. 20, LFPDPPP Art. 24).'}
        </Text>
        <TouchableOpacity
          style={s.exportBtn}
          onPress={handleExport}
          disabled={exporting}
          accessibilityLabel={isEs ? 'Exportar datos' : 'Export data'}
        >
          {exporting ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Download size={18} color="#1B7A6E" strokeWidth={2.5} style={{ marginRight: 8 }} />
                <Text style={s.exportBtnText}>
                  {isEs ? 'Exportar Datos' : 'Export Data'}
                </Text>
              </View>
          )}
        </TouchableOpacity>

        {/* Section: Delete Account */}
        <Text style={[s.sectionTitle, { marginTop: 28, color: '#DC2626' }]}>
          {isEs ? 'Eliminar Cuenta' : 'Delete Account'}
        </Text>
        <Text style={s.sectionDesc}>
          {isEs
            ? 'Esta acción elimina permanentemente tu cuenta y todos los datos asociados. No se puede deshacer. Derecho al olvido (GDPR Art. 17, LFPDPPP Art. 25).'
            : 'This action permanently deletes your account and all associated data. This cannot be undone. Right to erasure (GDPR Art. 17, LFPDPPP Art. 25).'}
        </Text>

        <View style={s.deleteBox}>
          <Text style={s.deletePrompt}>
            {isEs
              ? 'Escribe ELIMINAR para confirmar:'
              : 'Type DELETE to confirm:'}
          </Text>
          <TextInput
            style={s.deleteInput}
            value={deleteText}
            onChangeText={setDeleteText}
            placeholder={isEs ? 'ELIMINAR' : 'DELETE'}
            placeholderTextColor="#FECACA"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[
              s.deleteBtn,
              (deleteText !== 'ELIMINAR' && deleteText !== 'DELETE') && s.deleteBtnDisabled,
            ]}
            onPress={handleDeleteAccount}
            disabled={deleting || (deleteText !== 'ELIMINAR' && deleteText !== 'DELETE')}
            accessibilityLabel={isEs ? 'Eliminar cuenta' : 'Delete account'}
          >
            {deleting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Trash2 size={18} color="#FFF" strokeWidth={2.5} style={{ marginRight: 8 }} />
                <Text style={s.deleteBtnText}>
                  {isEs ? 'Eliminar Mi Cuenta' : 'Delete My Account'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  sectionTitle: {
    fontSize: 18, fontWeight: '900', color: COLORS.secondary,
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 13, color: '#64748B', lineHeight: 18, marginBottom: 14,
  },

  consentRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, padding: 14, borderRadius: 14,
    marginBottom: 8, borderWidth: 1, borderColor: COLORS.border,
  },
  consentRowActive: {
    borderColor: COLORS.primary + '40',
    backgroundColor: COLORS.primary + '06',
  },
  consentIconWrap: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: '#E0F2F1',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  consentInfo: { flex: 1 },
  consentLabel: { fontSize: 15, fontWeight: '700', color: COLORS.secondary },
  consentStatus: { fontSize: 12, color: '#64748B', marginTop: 2 },

  exportBtn: {
    backgroundColor: COLORS.surface, padding: 16, borderRadius: 14,
    alignItems: 'center', borderWidth: 2, borderColor: COLORS.primary,
  },
  exportBtnText: {
    fontSize: 16, fontWeight: '800', color: COLORS.primary,
  },

  deleteBox: {
    backgroundColor: '#FEF2F2', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#FECACA', marginTop: 8,
  },
  deletePrompt: {
    fontSize: 14, fontWeight: '700', color: '#991B1B', marginBottom: 8,
  },
  deleteInput: {
    backgroundColor: '#FFF', borderWidth: 2, borderColor: '#FECACA',
    borderRadius: 10, padding: 14, fontSize: 18, fontWeight: '900',
    color: '#DC2626', textAlign: 'center', letterSpacing: 4,
    marginBottom: 12,
  },
  deleteBtn: {
    backgroundColor: '#DC2626', padding: 16, borderRadius: 12,
    alignItems: 'center',
  },
  deleteBtnDisabled: { opacity: 0.3 },
  deleteBtnText: {
    color: '#FFF', fontSize: 15, fontWeight: '800',
  },
});
