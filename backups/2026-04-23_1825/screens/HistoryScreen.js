import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { COLORS, SPACING } from '../theme';
import { LocalHistoryService } from '../services/LocalHistoryService';
import { useLanguage } from '../contexts/LanguageContext';

const TEXTS = {
  es: {
    title: 'Historial de Registros',
    subtitle: 'Registros de signos vitales y alertas.',
    loading: 'Cargando registros...',
    empty_icon: '🛡️',
    empty_title: 'Sin Registros',
    empty_text: 'Aún no has registrado signos vitales. Regresa a la pantalla principal y envía tus datos.',
    sos_label: '🚨 SOS MANUAL',
    vitals_label: 'Signos Vitales',
    ml: 'IA',
    score: 'Score',
    persisted: 'Sincronizado',
    local_only: 'Solo local',
  },
  en: {
    title: 'Records History',
    subtitle: 'Vital signs records and alerts.',
    loading: 'Loading records...',
    empty_icon: '🛡️',
    empty_title: 'No Records',
    empty_text: 'You haven\'t recorded vital signs yet. Go to the main screen and submit your data.',
    sos_label: '🚨 MANUAL SOS',
    vitals_label: 'Vital Signs',
    ml: 'AI',
    score: 'Score',
    persisted: 'Synced',
    local_only: 'Local only',
  },
};

export const HistoryScreen = () => {
  const { language } = useLanguage();
  const txt = TEXTS[language] || TEXTS.es;
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const data = await LocalHistoryService.getHistory();
      setHistory(data || []);
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadHistory();
  }, [loadHistory]);

  const getSeverityColor = (level) => {
    const colors = {
      'NORMAL': COLORS.success,
      'BAJO': COLORS.success,
      'LOW': COLORS.success,
      'MEDIUM': '#F59E0B',
      'MEDIO': '#F59E0B',
      'HIGH': '#F97316',
      'ALTO': '#F97316',
      'CRITICAL': COLORS.error,
      'CRITICO': COLORS.error,
      'SOS_MANUAL': COLORS.error,
    };
    return colors[level] || COLORS.text;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{txt.title}</Text>
        <Text style={styles.subtitle}>{txt.subtitle}</Text>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loaderText}>{txt.loading}</Text>
        </View>
      ) : history.length > 0 ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
        >
          {history.map((item) => (
            <View key={item.id} style={styles.historyCard}>
              <View style={[styles.severityBar, { backgroundColor: getSeverityColor(item.tipo_emergencia) }]} />
              <View style={styles.cardContent}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.alertType, { color: getSeverityColor(item.tipo_emergencia) }]}>
                    {item.is_sos ? txt.sos_label : item.tipo_emergencia}
                  </Text>
                  <Text style={styles.timestamp}>{new Date(item.timestamp).toLocaleString()}</Text>
                </View>

                {item.vitals && item.vitals.hr && (
                  <View style={styles.vitalsRow}>
                    <Text style={styles.vitalChip}>❤️ {item.vitals.hr}</Text>
                    <Text style={styles.vitalChip}>🫁 {item.vitals.spo2}%</Text>
                    <Text style={styles.vitalChip}>🩸 {item.vitals.sys}/{item.vitals.dia}</Text>
                    <Text style={styles.vitalChip}>🍬 {item.vitals.glucose}</Text>
                  </View>
                )}

                <Text style={styles.description} numberOfLines={2}>{item.descripcion}</Text>

                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>{txt.ml}: {item.ml_level} ({(item.ml_confidence * 100).toFixed(0)}%)</Text>
                  <Text style={styles.metaText}>{txt.score}: {item.score?.toFixed?.(0) || item.score}</Text>
                  <View style={[styles.syncBadge, item.db_persisted ? styles.syncedBadge : styles.localBadge]}>
                    <Text style={styles.syncText}>{item.db_persisted ? txt.persisted : txt.local_only}</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>{txt.empty_icon}</Text>
          <Text style={styles.emptyTitle}>{txt.empty_title}</Text>
          <Text style={styles.emptyText}>{txt.empty_text}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { color: COLORS.secondary, fontSize: 22, fontWeight: 'bold' },
  subtitle: { color: COLORS.text, fontSize: 12, marginTop: 4 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loaderText: { color: COLORS.text, marginTop: SPACING.md, fontSize: 14 },
  scrollContent: { padding: SPACING.md, paddingBottom: 40 },
  historyCard: {
    backgroundColor: COLORS.surface, borderRadius: 14, marginBottom: SPACING.sm,
    flexDirection: 'row', overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border, elevation: 2,
  },
  severityBar: { width: 5 },
  cardContent: { flex: 1, padding: SPACING.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  alertType: { fontSize: 14, fontWeight: '800' },
  timestamp: { fontSize: 10, color: '#94A3B8', fontWeight: '600' },
  vitalsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  vitalChip: {
    fontSize: 11, fontWeight: '700', color: COLORS.text, backgroundColor: '#F1F5F9',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  description: { fontSize: 11, color: '#64748B', lineHeight: 16, marginBottom: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { fontSize: 10, color: '#94A3B8', fontWeight: '600' },
  syncBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  syncedBadge: { backgroundColor: 'rgba(16,185,129,0.1)' },
  localBadge: { backgroundColor: 'rgba(245,158,11,0.1)' },
  syncText: { fontSize: 9, fontWeight: '700', color: '#64748B' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  emptyIcon: { fontSize: 64, marginBottom: SPACING.md },
  emptyTitle: { color: COLORS.secondary, fontSize: 20, fontWeight: 'bold' },
  emptyText: { color: COLORS.text, fontSize: 14, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 22 },
});
