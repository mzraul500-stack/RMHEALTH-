import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  StyleSheet, View, Text, ScrollView, RefreshControl,
  ActivityIndicator, TouchableOpacity, Share, Dimensions,
} from 'react-native';
import { COLORS, SPACING } from '../theme';
import { LocalHistoryService } from '../services/LocalHistoryService';
import { useLanguage } from '../contexts/LanguageContext';

const SCREEN_W = Dimensions.get('window').width;

const TEXTS = {
  es: {
    title: 'Historial de Detecciones',
    subtitle: 'Bitácora de patrones detectados por fecha.',
    loading: 'Cargando...',
    empty_title: 'Sin Registros',
    empty_text: 'Aún no has registrado signos vitales.',
    sos_label: '🚨 SOS',
    ml: 'IA', score: 'Score',
    synced: 'Sync', local: 'Local',
    export_btn: '📤 Exportar',
    export_title: 'Reporte RmHealth',
    all: 'Todo',
    anomalies: '⚠️ Anomalías',
    days: ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'],
    months: ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
    trend_title: 'Tendencia (últimos registros)',
    hr: 'Pulso', bp: 'Presión', glu: 'Glucosa', spo2: 'SpO2',
  },
  en: {
    title: 'Detection History',
    subtitle: 'Vital signs patterns log by date.',
    loading: 'Loading...',
    empty_title: 'No Records',
    empty_text: 'No vital signs recorded yet.',
    sos_label: '🚨 SOS',
    ml: 'AI', score: 'Score',
    synced: 'Sync', local: 'Local',
    export_btn: '📤 Export',
    export_title: 'RmHealth Report',
    all: 'All',
    anomalies: '⚠️ Anomalies',
    days: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
    months: ['January','February','March','April','May','June','July','August','September','October','November','December'],
    trend_title: 'Trend (recent records)',
    hr: 'Heart Rate', bp: 'BP', glu: 'Glucose', spo2: 'SpO2',
  },
};

// ─── MINI CALENDAR COMPONENT ────────────────────────────────────
function MiniCalendar({ selectedDate, onSelectDate, markedDates, txt }) {
  const [viewDate, setViewDate] = useState(new Date());
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().split('T')[0];

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push(dateStr);
  }

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  return (
    <View style={calStyles.container}>
      <View style={calStyles.header}>
        <TouchableOpacity onPress={prevMonth}><Text style={calStyles.arrow}>◀</Text></TouchableOpacity>
        <Text style={calStyles.monthTitle}>{txt.months[month]} {year}</Text>
        <TouchableOpacity onPress={nextMonth}><Text style={calStyles.arrow}>▶</Text></TouchableOpacity>
      </View>
      <View style={calStyles.dayLabels}>
        {txt.days.map(d => <Text key={d} style={calStyles.dayLabel}>{d}</Text>)}
      </View>
      <View style={calStyles.grid}>
        {cells.map((dateStr, i) => {
          if (!dateStr) return <View key={`e${i}`} style={calStyles.cell} />;
          const day = parseInt(dateStr.split('-')[2]);
          const mark = markedDates[dateStr];
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === today;
          return (
            <TouchableOpacity
              key={dateStr}
              style={[
                calStyles.cell,
                isSelected && calStyles.cellSelected,
                isToday && !isSelected && calStyles.cellToday,
              ]}
              onPress={() => onSelectDate(dateStr)}
            >
              <Text style={[calStyles.cellText, isSelected && calStyles.cellTextSelected]}>
                {day}
              </Text>
              {mark && (
                <View style={[calStyles.dot, { backgroundColor: mark.hasAnomaly ? '#EF4444' : '#10B981' }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── MINI TREND CHART ───────────────────────────────────────────
function TrendChart({ data, label, color, unit, maxVal }) {
  if (!data || data.length < 2) return null;
  const h = 50;
  const w = SCREEN_W - 80;
  const step = w / (data.length - 1);
  const max = maxVal || Math.max(...data, 1);
  const min = Math.min(...data);
  const range = (max - min) || 1;

  return (
    <View style={trendStyles.container}>
      <Text style={trendStyles.label}>{label}</Text>
      <View style={[trendStyles.chart, { height: h }]}>
        {data.map((val, i) => {
          const x = i * step;
          const y = h - ((val - min) / range) * (h - 10);
          return (
            <View key={i} style={[trendStyles.point, { left: x - 3, top: y - 3, backgroundColor: color }]} />
          );
        })}
        <Text style={trendStyles.maxLabel}>{data[data.length - 1]} {unit}</Text>
      </View>
    </View>
  );
}

// ─── MAIN SCREEN ────────────────────────────────────────────────
export const HistoryScreen = () => {
  const { language } = useLanguage();
  const txt = TEXTS[language] || TEXTS.es;
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [filterAnomalies, setFilterAnomalies] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const data = await LocalHistoryService.getHistory();
      setHistory(data || []);
    } catch (e) {
      console.error('Error loading history:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const onRefresh = useCallback(() => { setRefreshing(true); loadHistory(); }, [loadHistory]);

  // Build marked dates for calendar
  const markedDates = useMemo(() => {
    const marks = {};
    history.forEach(item => {
      const dateKey = item.timestamp?.split('T')[0];
      if (!dateKey) return;
      const isAnomaly = item.tipo_emergencia !== 'NORMAL' && item.tipo_emergencia !== 'BAJO';
      if (!marks[dateKey]) marks[dateKey] = { count: 0, hasAnomaly: false };
      marks[dateKey].count++;
      if (isAnomaly) marks[dateKey].hasAnomaly = true;
    });
    return marks;
  }, [history]);

  // Filter records
  const filteredHistory = useMemo(() => {
    let list = history;
    if (selectedDate) {
      list = list.filter(item => item.timestamp?.startsWith(selectedDate));
    }
    if (filterAnomalies) {
      list = list.filter(item => item.tipo_emergencia !== 'NORMAL' && item.tipo_emergencia !== 'BAJO');
    }
    return list;
  }, [history, selectedDate, filterAnomalies]);

  // Trend data (last 10 records with vitals)
  const trendData = useMemo(() => {
    const withVitals = history.filter(h => h.vitals?.hr).slice(0, 10).reverse();
    return {
      hr: withVitals.map(h => h.vitals.hr),
      sys: withVitals.map(h => h.vitals.sys),
      glu: withVitals.map(h => h.vitals.glucose),
      spo2: withVitals.map(h => h.vitals.spo2),
    };
  }, [history]);

  // Export
  const handleExport = async () => {
    const records = filteredHistory.slice(0, 20);
    let text = `📋 ${txt.export_title}\n`;
    text += `📅 ${new Date().toLocaleDateString()}\n`;
    text += `${'─'.repeat(30)}\n\n`;
    records.forEach((r, i) => {
      text += `${i + 1}. ${new Date(r.timestamp).toLocaleString()}\n`;
      text += `   Nivel: ${r.tipo_emergencia} | Score: ${r.score}\n`;
      if (r.vitals?.hr) {
        text += `   ❤️${r.vitals.hr} 🫁${r.vitals.spo2}% 🩸${r.vitals.sys}/${r.vitals.dia} 🍬${r.vitals.glucose}\n`;
      }
      text += `   ${r.descripcion}\n\n`;
    });
    text += `\n⚕️ Generado por RmHealth v2.0.0\n`;
    text += `Este reporte no constituye un diagnóstico médico.`;
    await Share.share({ message: text, title: txt.export_title });
  };

  const getSeverityColor = (level) => {
    const c = { 'NORMAL': '#10B981', 'BAJO': '#10B981', 'LOW': '#10B981', 'MEDIUM': '#F59E0B', 'MEDIO': '#F59E0B', 'HIGH': '#F97316', 'ALTO': '#F97316', 'CRITICAL': '#EF4444', 'CRITICO': '#EF4444', 'SOS_MANUAL': '#EF4444' };
    return c[level] || COLORS.text;
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loaderText}>{txt.loading}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
      >
        {/* Header */}
        <Text style={styles.title}>{txt.title}</Text>
        <Text style={styles.subtitle}>{txt.subtitle}</Text>

        {/* Calendar */}
        <MiniCalendar
          selectedDate={selectedDate}
          onSelectDate={(d) => setSelectedDate(d === selectedDate ? null : d)}
          markedDates={markedDates}
          txt={txt}
        />

        {/* Filters */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterBtn, !filterAnomalies && styles.filterActive]}
            onPress={() => setFilterAnomalies(false)}
          >
            <Text style={[styles.filterText, !filterAnomalies && styles.filterTextActive]}>{txt.all}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterBtn, filterAnomalies && styles.filterActiveRed]}
            onPress={() => setFilterAnomalies(true)}
          >
            <Text style={[styles.filterText, filterAnomalies && styles.filterTextActive]}>{txt.anomalies}</Text>
          </TouchableOpacity>
          {history.length > 0 && (
            <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
              <Text style={styles.exportText}>{txt.export_btn}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Trend Charts */}
        {trendData.hr.length >= 2 && !selectedDate && (
          <View style={trendStyles.section}>
            <Text style={trendStyles.sectionTitle}>{txt.trend_title}</Text>
            <TrendChart data={trendData.hr} label={txt.hr} color="#EF4444" unit="bpm" />
            <TrendChart data={trendData.sys} label={txt.bp} color="#8B5CF6" unit="mmHg" />
            <TrendChart data={trendData.spo2} label={txt.spo2} color="#3B82F6" unit="%" maxVal={100} />
            <TrendChart data={trendData.glu} label={txt.glu} color="#F59E0B" unit="mg/dL" />
          </View>
        )}

        {/* Records */}
        {filteredHistory.length > 0 ? (
          filteredHistory.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={[styles.severityBar, { backgroundColor: getSeverityColor(item.tipo_emergencia) }]} />
              <View style={styles.cardContent}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.alertType, { color: getSeverityColor(item.tipo_emergencia) }]}>
                    {item.is_sos ? txt.sos_label : item.tipo_emergencia}
                  </Text>
                  <Text style={styles.timestamp}>{new Date(item.timestamp).toLocaleString()}</Text>
                </View>
                {item.vitals?.hr && (
                  <View style={styles.vitalsRow}>
                    <Text style={styles.chip}>❤️ {item.vitals.hr}</Text>
                    <Text style={styles.chip}>🫁 {item.vitals.spo2}%</Text>
                    <Text style={styles.chip}>🩸 {item.vitals.sys}/{item.vitals.dia}</Text>
                    <Text style={styles.chip}>🍬 {item.vitals.glucose}</Text>
                  </View>
                )}
                <Text style={styles.desc} numberOfLines={2}>{item.descripcion}</Text>
                <View style={styles.metaRow}>
                  <Text style={styles.meta}>{txt.ml}: {item.ml_level} ({(item.ml_confidence * 100).toFixed(0)}%)</Text>
                  <Text style={styles.meta}>{txt.score}: {item.score?.toFixed?.(0) || item.score}</Text>
                </View>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🛡️</Text>
            <Text style={styles.emptyTitle}>{selectedDate ? (language === 'en' ? 'No records for this date' : 'Sin registros para esta fecha') : txt.empty_title}</Text>
            <Text style={styles.emptyText}>{selectedDate ? '' : txt.empty_text}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

// ─── Calendar Styles ─────────────────────────────────────
const calStyles = StyleSheet.create({
  container: { backgroundColor: COLORS.surface, borderRadius: 16, margin: SPACING.md, padding: SPACING.md, elevation: 3, borderWidth: 1, borderColor: COLORS.border },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  arrow: { fontSize: 18, color: COLORS.primary, padding: 8 },
  monthTitle: { fontSize: 16, fontWeight: '800', color: COLORS.secondary },
  dayLabels: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 6 },
  dayLabel: { width: 36, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#94A3B8' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center' },
  cellSelected: { backgroundColor: COLORS.primary, borderRadius: 20 },
  cellToday: { borderWidth: 2, borderColor: COLORS.primary, borderRadius: 20 },
  cellText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  cellTextSelected: { color: '#FFF', fontWeight: '800' },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 1 },
});

// ─── Trend Styles ────────────────────────────────────────
const trendStyles = StyleSheet.create({
  section: { backgroundColor: COLORS.surface, borderRadius: 16, margin: SPACING.md, padding: SPACING.md, elevation: 2, borderWidth: 1, borderColor: COLORS.border },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.secondary, marginBottom: 10 },
  container: { marginBottom: 12 },
  label: { fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 4 },
  chart: { position: 'relative', backgroundColor: '#F8FAFC', borderRadius: 8, overflow: 'hidden' },
  point: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },
  maxLabel: { position: 'absolute', right: 4, bottom: 2, fontSize: 10, fontWeight: '800', color: '#64748B' },
});

// ─── Main Styles ─────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loaderText: { color: COLORS.text, marginTop: SPACING.md, fontSize: 14 },
  scrollContent: { paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '900', color: COLORS.secondary, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  subtitle: { fontSize: 13, color: '#64748B', paddingHorizontal: SPACING.lg, marginTop: 2 },
  filterRow: { flexDirection: 'row', paddingHorizontal: SPACING.md, marginBottom: 8, gap: 8 },
  filterBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#F1F5F9' },
  filterActive: { backgroundColor: COLORS.primary },
  filterActiveRed: { backgroundColor: '#FEE2E2' },
  filterText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  filterTextActive: { color: '#FFF' },
  exportBtn: { marginLeft: 'auto', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  exportText: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
  card: { backgroundColor: COLORS.surface, borderRadius: 14, marginHorizontal: SPACING.md, marginBottom: 8, flexDirection: 'row', overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, elevation: 2 },
  severityBar: { width: 5 },
  cardContent: { flex: 1, padding: SPACING.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  alertType: { fontSize: 14, fontWeight: '800' },
  timestamp: { fontSize: 10, color: '#94A3B8', fontWeight: '600' },
  vitalsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  chip: { fontSize: 11, fontWeight: '700', color: COLORS.text, backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  desc: { fontSize: 11, color: '#64748B', lineHeight: 16, marginBottom: 6 },
  metaRow: { flexDirection: 'row', gap: 12 },
  meta: { fontSize: 10, color: '#94A3B8', fontWeight: '600' },
  emptyContainer: { alignItems: 'center', padding: SPACING.xl, marginTop: 20 },
  emptyIcon: { fontSize: 48, marginBottom: SPACING.md },
  emptyTitle: { color: COLORS.secondary, fontSize: 18, fontWeight: 'bold' },
  emptyText: { color: '#94A3B8', fontSize: 14, textAlign: 'center', marginTop: 8 },
});
