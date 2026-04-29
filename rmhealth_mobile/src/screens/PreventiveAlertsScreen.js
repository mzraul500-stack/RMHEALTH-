import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, SafeAreaView, Modal, RefreshControl,
} from 'react-native';
import { COLORS, SPACING } from '../theme';
import { apiService } from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BarChart3, AlertTriangle, Siren, Heart, Activity, Droplets, Wind,
  Info, CheckCircle, Lightbulb,
} from 'lucide-react-native';

// ── Severity Configuration ────────────────────────────────────
const SEVERITY_CONFIG = {
  LOW: {
    color: '#64748B',
    bg: '#F1F5F9',
    IconComp: BarChart3,
    label: 'Informativa',
  },
  MEDIUM: {
    color: '#D97706',
    bg: '#FEF3C7',
    IconComp: AlertTriangle,
    label: 'Atención',
  },
  HIGH: {
    color: '#DC2626',
    bg: '#FEE2E2',
    IconComp: Siren,
    label: 'Prioritaria',
  },
};

const METRIC_LABELS = {
  heart_rate: { IconComp: Heart, label: 'Frecuencia Cardíaca' },
  systolic:   { IconComp: Activity, label: 'Presión Sistólica' },
  diastolic:  { IconComp: Droplets, label: 'Presión Diastólica' },
  spo2:       { IconComp: Wind, label: 'Oxigenación (SpO₂)' },
  glucose:    { IconComp: Droplets, label: 'Glucosa' },
};

/**
 * PreventiveAlertsScreen — Displays preventive trend alerts.
 * Non-diagnostic, informational only.
 */
export const PreventiveAlertsScreen = ({ navigation }) => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    const loadUserId = async () => {
      try {
        const raw = await AsyncStorage.getItem('@rmhealth/patient_profile');
        if (raw) {
          const profile = JSON.parse(raw);
          const id = profile?.name?.toLowerCase().replace(/\s+/g, '_') || 'paciente_001';
          setUserId(id);
        } else {
          setUserId('paciente_001');
        }
      } catch (e) {
        setUserId('paciente_001');
      }
    };
    loadUserId();
  }, []);

  const fetchAlerts = useCallback(async () => {
    if (!userId) return;
    try {
      const result = await apiService.getPreventiveAlerts(userId);
      if (result?.alerts) {
        setAlerts(result.alerts);
      }
    } catch (e) {
      console.warn('[PreventiveAlerts] Fetch failed:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchAlerts();
    }
  }, [userId, fetchAlerts]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAlerts();
  };

  const handleAlertPress = async (alert) => {
    setSelectedAlert(alert);
    // Acknowledge alert
    if (!alert.acknowledged_at) {
      try {
        await apiService.acknowledgeAlert(alert.id);
        // Update local state
        setAlerts(prev => prev.map(a =>
          a.id === alert.id ? { ...a, acknowledged_at: new Date().toISOString() } : a
        ));
      } catch (e) {
        console.warn('[PreventiveAlerts] Acknowledge failed:', e);
      }
    }
  };

  const unacknowledgedCount = alerts.filter(a => !a.acknowledged_at).length;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Cargando alertas...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation?.goBack?.()}
        >
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Alertas Preventivas</Text>
          <Text style={styles.headerSubtitle}>
            Monitoreo basado en tendencias
          </Text>
        </View>
        {unacknowledgedCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unacknowledgedCount}</Text>
          </View>
        )}
      </View>

      {/* Disclaimer */}
      <View style={styles.disclaimerCard}>
        <Info size={14} color="#0369A1" strokeWidth={2} style={{ marginRight: 6, marginTop: 1 }} />
        <Text style={styles.disclaimerText}>
          Estas alertas son informativas y preventivas. No constituyen un diagnóstico médico.
          Consulta a un profesional de salud para cualquier decisión clínica.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
        }
      >
        {alerts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <CheckCircle size={48} color="#1B7A6E" strokeWidth={1.5} style={{ marginBottom: SPACING.md }} />
            <Text style={styles.emptyTitle}>Sin alertas preventivas</Text>
            <Text style={styles.emptyMessage}>
              No hay alertas preventivas por ahora.{'\n'}
              Continúa monitoreando tu salud.
            </Text>
          </View>
        ) : (
          alerts.map((alert) => {
            const severity = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.LOW;
            const metric = METRIC_LABELS[alert.metric] || { IconComp: BarChart3, label: alert.metric };
            const isNew = !alert.acknowledged_at;

            return (
              <TouchableOpacity
                key={alert.id}
                style={[
                  styles.alertCard,
                  { borderLeftColor: severity.color },
                  isNew && styles.alertCardNew,
                ]}
                onPress={() => handleAlertPress(alert)}
                activeOpacity={0.7}
              >
                <View style={styles.alertHeader}>
                  <View style={[styles.severityBadge, { backgroundColor: severity.bg }]}>
                    <severity.IconComp size={12} color={severity.color} strokeWidth={2.5} style={{ marginRight: 4 }} />
                    <Text style={[styles.severityLabel, { color: severity.color }]}>
                      {severity.label}
                    </Text>
                  </View>
                  <View style={styles.metricBadge}>
                    <metric.IconComp size={14} color="#64748B" strokeWidth={2} style={{ marginRight: 4 }} />
                    <Text style={styles.metricLabel}>{metric.label}</Text>
                  </View>
                </View>

                <Text style={styles.alertTitle}>{alert.title}</Text>
                <Text style={styles.alertMessage} numberOfLines={2}>
                  {alert.message}
                </Text>

                <View style={styles.alertFooter}>
                  <Text style={styles.alertTime}>
                    {formatDate(alert.created_at)}
                  </Text>
                  {isNew && (
                    <View style={styles.newDot}>
                      <Text style={styles.newDotText}>Nueva</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* Detail Modal */}
      <Modal
        visible={!!selectedAlert}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedAlert(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedAlert && (
              <>
                <View style={styles.modalHeader}>
                  {React.createElement(
                    (SEVERITY_CONFIG[selectedAlert.severity] || SEVERITY_CONFIG.LOW).IconComp,
                    { size: 28, color: (SEVERITY_CONFIG[selectedAlert.severity] || SEVERITY_CONFIG.LOW).color, strokeWidth: 2, style: { marginRight: SPACING.sm } }
                  )}
                  <Text style={styles.modalTitle}>{selectedAlert.title}</Text>
                </View>

                <View style={styles.modalMetricRow}>
                  {React.createElement(
                    (METRIC_LABELS[selectedAlert.metric] || { IconComp: BarChart3 }).IconComp,
                    { size: 18, color: '#1B7A6E', strokeWidth: 2, style: { marginRight: 6 } }
                  )}
                  <Text style={styles.modalMetricLabel}>
                    {(METRIC_LABELS[selectedAlert.metric] || { label: selectedAlert.metric }).label}
                  </Text>
                  <Text style={styles.modalWindow}>
                    Ventana: {selectedAlert.data_window}
                  </Text>
                </View>

                <Text style={styles.modalMessage}>{selectedAlert.message}</Text>

                {/* Data Summary */}
                <View style={styles.modalDataRow}>
                  <View style={styles.dataItem}>
                    <Text style={styles.dataLabel}>Promedio</Text>
                    <Text style={styles.dataValue}>{selectedAlert.baseline_value?.toFixed(1)}</Text>
                  </View>
                  <View style={styles.dataItem}>
                    <Text style={styles.dataLabel}>Actual</Text>
                    <Text style={styles.dataValue}>{selectedAlert.current_value?.toFixed(1)}</Text>
                  </View>
                  <View style={styles.dataItem}>
                    <Text style={styles.dataLabel}>Variación</Text>
                    <Text style={[
                      styles.dataValue,
                      { color: selectedAlert.delta > 0 ? '#DC2626' : selectedAlert.delta < 0 ? '#2563EB' : COLORS.text }
                    ]}>
                      {selectedAlert.delta > 0 ? '+' : ''}{selectedAlert.delta?.toFixed(1)}
                    </Text>
                  </View>
                </View>

                {/* Recommendation */}
                <View style={styles.recCard}>
                  <Lightbulb size={18} color="#166534" strokeWidth={2} style={{ marginRight: SPACING.sm, marginTop: 1 }} />
                  <Text style={styles.recText}>{selectedAlert.recommendation}</Text>
                </View>

                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={() => setSelectedAlert(null)}
                >
                  <Text style={styles.modalCloseText}>Entendido</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// ── Helpers ────────────────────────────────────────────────────
function formatDate(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'Ahora';
    if (diffMin < 60) return `Hace ${diffMin} min`;
    if (diffMin < 1440) return `Hace ${Math.floor(diffMin / 60)}h`;
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoString;
  }
}

// ── Styles ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '600',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  backText: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: -2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  badge: {
    backgroundColor: COLORS.error,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '900',
  },

  // Disclaimer
  disclaimerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0F9FF',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  disclaimerIcon: {
    fontSize: 14,
    marginRight: 6,
    marginTop: 1,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 11,
    color: '#0369A1',
    lineHeight: 16,
  },

  scroll: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  emptyMessage: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Alert Card
  alertCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  alertCardNew: {
    borderColor: '#CBD5E1',
    elevation: 4,
    shadowOpacity: 0.1,
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  severityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  severityIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  severityLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  metricBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },
  alertMessage: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
    marginBottom: SPACING.xs,
  },
  alertFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertTime: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  newDot: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  newDotText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: SPACING.lg,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  modalSeverityIcon: {
    fontSize: 28,
    marginRight: SPACING.sm,
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.text,
  },
  modalMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  modalMetricIcon: {
    fontSize: 18,
    marginRight: 6,
  },
  modalMetricLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  modalWindow: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  modalMessage: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 21,
    marginBottom: SPACING.md,
  },
  modalDataRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  dataItem: {
    alignItems: 'center',
  },
  dataLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '700',
    marginBottom: 2,
  },
  dataValue: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.text,
  },
  recCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  recIcon: {
    fontSize: 18,
    marginRight: SPACING.sm,
    marginTop: 1,
  },
  recText: {
    flex: 1,
    fontSize: 13,
    color: '#166534',
    lineHeight: 20,
  },
  modalCloseBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    elevation: 3,
  },
  modalCloseText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
  },
});
