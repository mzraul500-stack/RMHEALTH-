import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  StyleSheet, View, Text, ScrollView, RefreshControl,
  ActivityIndicator, TouchableOpacity, Share, Dimensions, Image,
} from 'react-native';
import { COLORS, SPACING } from '../theme';
import { LocalHistoryService } from '../services/LocalHistoryService';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../api/client';
import { Heart, Wind, Activity, Droplets, Thermometer } from 'lucide-react-native';
import { APP_VERSION_CODE } from '../config/appVersion';

const SCREEN_W = Dimensions.get('window').width;

const TEXTS = {
  es: {
    title: 'Historial de Detecciones',
    subtitle: 'Bitácora de patrones detectados por fecha.',
    loading: 'Cargando...',
    empty_title: 'Sin Registros',
    empty_text: 'Aún no has registrado signos vitales.',
    sos_label: 'SOS',
    ml: 'IA', score: 'Score',
    synced: 'Sync', local: 'Local',
    export_btn: 'Exportar',
    export_title: 'Reporte RmHealth',
    all: 'Todo',
    anomalies: 'Anomalías',
    days: ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'],
    months: ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
    trend_title: 'Tendencia (últimos registros)',
    hr: 'Pulso', bp: 'Presión', glu: 'Glucosa', spo2: 'SpO2',
    alerts_title: 'Alertas Preventivas',
    alerts_empty: 'Sin alertas recientes.',
    alerts_severity_LOW: 'ALERTA',
    alerts_severity_MEDIUM: 'URGENTE',
    alerts_severity_HIGH: 'EMERGENCIA',
  },
  en: {
    title: 'Detection History',
    subtitle: 'Vital signs patterns log by date.',
    loading: 'Loading...',
    empty_title: 'No Records',
    empty_text: 'No vital signs recorded yet.',
    sos_label: 'SOS',
    ml: 'AI', score: 'Score',
    synced: 'Sync', local: 'Local',
    export_btn: 'Export',
    export_title: 'RmHealth Report',
    all: 'All',
    anomalies: 'Anomalies',
    days: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
    months: ['January','February','March','April','May','June','July','August','September','October','November','December'],
    trend_title: 'Trend (recent records)',
    hr: 'Heart Rate', bp: 'BP', glu: 'Glucose', spo2: 'SpO2',
    alerts_title: 'Preventive Alerts',
    alerts_empty: 'No recent alerts.',
    alerts_severity_LOW: 'ALERT',
    alerts_severity_MEDIUM: 'URGENT',
    alerts_severity_HIGH: 'EMERGENCY',
  },
};

// Mapa de traducción: el backend devuelve códigos en inglés
const SEVERITY_MAP = {
  es: {
    CRITICAL: 'CRÍTICO', HIGH: 'ALTO', MEDIUM: 'MEDIO', LOW: 'BAJO', NORMAL: 'NORMAL',
    CRITICO: 'CRÍTICO', ALTO: 'ALTO', MEDIO: 'MEDIO', BAJO: 'BAJO',
    SOS_MANUAL: 'SOS',
  },
  en: {
    CRITICAL: 'CRITICAL', HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW', NORMAL: 'NORMAL',
    SOS_MANUAL: 'SOS',
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

// ─── COLOR-CODED BAR CHART (legible for elderly patients) ──────
// Bar colors based on clinical thresholds: green=normal, amber=warning, red=critical
const BAR_THRESHOLDS = {
  hr:   { normal: [60, 100], warning: [40, 150] },
  sys:  { normal: [90, 139], warning: [70, 180] },
  spo2: { normal: [95, 100], warning: [90, 100] },
  glu:  { normal: [70, 100], warning: [54, 126] },
  temp: { normal: [36.0, 37.5], warning: [35.0, 39.0] },
};

function getBarColor(val, metricKey, fallbackColor) {
  if (val == null) return '#E2E8F0';
  const th = BAR_THRESHOLDS[metricKey];
  if (!th) return fallbackColor;
  if (val >= th.normal[0] && val <= th.normal[1]) return '#10B981'; // green
  if (val >= th.warning[0] && val <= th.warning[1]) return '#F59E0B'; // amber
  return '#EF4444'; // red
}

function BarChart({ data, labels, label, color, unit, maxVal, metricKey, IconComponent, iconColor }) {
  if (!data || data.length < 1) return null;
  const h = 90;
  const validData = data.filter(v => v != null);
  const max = maxVal || Math.max(...validData, 1);

  return (
    <View style={barStyles.container}>
      <View style={barStyles.labelRow}>
        {IconComponent && <IconComponent size={18} color={iconColor || '#1B7A6E'} strokeWidth={2.5} style={{ marginRight: 6 }} />}
        <Text style={barStyles.label}>{label}</Text>
      </View>
      <View style={barStyles.chartWrap}>
        {data.map((val, i) => {
          const barH = val != null ? Math.max((val / max) * h, 4) : 4;
          const barColor = getBarColor(val, metricKey, color);
          return (
            <View key={i} style={barStyles.barCol}>
              <Text style={[barStyles.barValue, { color: barColor }]}>
                {val != null ? Math.round(val) : '-'}
              </Text>
              <View style={[barStyles.bar, { height: barH, backgroundColor: barColor }]} />
              <Text style={barStyles.barDay}>{labels?.[i] || ''}</Text>
            </View>
          );
        })}
      </View>
      <View style={barStyles.legendRow}>
        <View style={barStyles.legendItem}>
          <View style={[barStyles.legendDot, { backgroundColor: '#10B981' }]} />
          <Text style={barStyles.legendText}>Normal</Text>
        </View>
        <View style={barStyles.legendItem}>
          <View style={[barStyles.legendDot, { backgroundColor: '#F59E0B' }]} />
          <Text style={barStyles.legendText}>Alerta</Text>
        </View>
        <View style={barStyles.legendItem}>
          <View style={[barStyles.legendDot, { backgroundColor: '#EF4444' }]} />
          <Text style={barStyles.legendText}>Urgente</Text>
        </View>
        <Text style={barStyles.unitLabel}>{unit}</Text>
      </View>
    </View>
  );
}

const barStyles = StyleSheet.create({
  container: { marginBottom: 18 },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  labelIcon: { width: 22, height: 22, marginRight: 6, tintColor: '#1B7A6E' },
  label: { fontSize: 14, fontWeight: '800', color: '#1E293B' },
  chartWrap: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 130, backgroundColor: '#F8FAFC', borderRadius: 10, paddingTop: 22, paddingBottom: 6, paddingHorizontal: 4 },
  barCol: { alignItems: 'center', flex: 1 },
  barValue: { fontSize: 10, fontWeight: '700', marginBottom: 4 },
  bar: { width: 22, borderRadius: 5, minHeight: 4 },
  barDay: { fontSize: 9, fontWeight: '700', color: '#94A3B8', marginTop: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 9, fontWeight: '600', color: '#94A3B8' },
  unitLabel: { fontSize: 10, color: '#94A3B8', marginLeft: 'auto' },
});

// ─── MAIN SCREEN ────────────────────────────────────────────────
export const HistoryScreen = () => {
  const { language } = useLanguage();
  const { accessToken } = useAuth();
  const txt = TEXTS[language] || TEXTS.es;
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [filterAnomalies, setFilterAnomalies] = useState(false);
  const [serverTrends, setServerTrends] = useState(null);
  const [trendDays, setTrendDays] = useState(7); // 7 or 30
  const [preventiveAlerts, setPreventiveAlerts] = useState([]);

  const loadHistory = useCallback(async () => {
    try {
      // Try server first, fallback to local
      if (accessToken) {
        try {
          const serverData = await apiService.getVitalHistory(accessToken);
          if (serverData.status === 'success' && serverData.records?.length > 0) {
            // Transform server records to local format
            const transformed = serverData.records.map((r, i) => ({
              id: r.id || `server_${i}`,
              timestamp: r.timestamp,
              tipo_emergencia: 'NORMAL',
              score: 0,
              descripcion: '',
              ml_level: '',
              ml_confidence: 0,
              vitals: {
                hr: r.ritmo_cardiaco,
                spo2: r.spo2,
                sys: r.presion_sistolica,
                dia: r.presion_diastolica,
                glucose: r.glucosa,
                temp: r.temp_corporal,
              },
              source: 'server',
            }));
            // Merge with local data
            const localData = await LocalHistoryService.getHistory() || [];
            const merged = [...transformed, ...localData];
            // Deduplicate by timestamp
            const seen = new Set();
            const unique = merged.filter(item => {
              const key = item.timestamp;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            unique.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            setHistory(unique);
          } else {
            const data = await LocalHistoryService.getHistory();
            setHistory(data || []);
          }
        } catch (apiErr) {
          console.warn('[History] Server fetch failed, using local:', apiErr);
          const data = await LocalHistoryService.getHistory();
          setHistory(data || []);
        }

        // Load server trends for bar charts
        try {
          const trends = await apiService.getVitalTrends(accessToken);
          if (trends.status === 'success') {
            setServerTrends(trends);
          }
        } catch (tErr) {
          console.warn('[History] Trends fetch failed:', tErr);
        }

        // Load preventive alerts
        try {
          const userId = 'usuario_001'; // Default user
          const alertsData = await apiService.getPreventiveAlerts(userId, accessToken);
          if (alertsData.status === 'success' && alertsData.alerts) {
            setPreventiveAlerts(alertsData.alerts);
          }
        } catch (aErr) {
          console.warn('[History] Alerts fetch failed:', aErr);
        }
      } else {
        const data = await LocalHistoryService.getHistory();
        setHistory(data || []);
      }
    } catch (e) {
      console.error('Error loading history:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken]);

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

  // Trend data computed from local history — grouped by day
  const trendData = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - trendDays);
    const withVitals = history.filter(h => h.vitals?.hr && new Date(h.timestamp) >= cutoff);
    // Group by day
    const dayMap = {};
    withVitals.forEach(h => {
      const day = h.timestamp?.split('T')[0] || new Date(h.timestamp).toISOString().split('T')[0];
      if (!dayMap[day]) dayMap[day] = [];
      dayMap[day].push(h);
    });
    const sortedDays = Object.keys(dayMap).sort();
    const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const dayAbbr = txt.days;
    return {
      labels: sortedDays.map(d => { const dt = new Date(d + 'T12:00:00'); return dayAbbr[dt.getDay()]; }),
      hr: sortedDays.map(d => avg(dayMap[d].map(h => h.vitals.hr))),
      sys: sortedDays.map(d => avg(dayMap[d].map(h => h.vitals.sys))),
      glu: sortedDays.map(d => avg(dayMap[d].map(h => h.vitals.glucose))),
      spo2: sortedDays.map(d => avg(dayMap[d].map(h => h.vitals.spo2))),
      temp: sortedDays.map(d => avg(dayMap[d].filter(h => h.vitals.temp).map(h => h.vitals.temp))),
    };
  }, [history, trendDays, txt.days]);

  // Export
  const handleExport = async () => {
    const records = filteredHistory.slice(0, 20);
    let text = `${txt.export_title}\n`;
    text += `Fecha: ${new Date().toLocaleDateString()}\n`;
    text += `${'─'.repeat(30)}\n\n`;
    records.forEach((r, i) => {
      text += `${i + 1}. ${new Date(r.timestamp).toLocaleString()}\n`;
      const lvlLabel = (SEVERITY_MAP[language] || SEVERITY_MAP.es)[r.tipo_emergencia] || r.tipo_emergencia;
      text += `   Nivel: ${lvlLabel} | Score: ${r.score}\n`;
      if (r.vitals?.hr) {
        text += `   FC:${r.vitals.hr} SpO2:${r.vitals.spo2}% PA:${r.vitals.sys}/${r.vitals.dia} Glu:${r.vitals.glucose}\n`;
      }
      text += `   ${r.descripcion}\n\n`;
    });
    text += `\nGenerado por RmHealth v${APP_VERSION_CODE}\n`;
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

        {/* ── TREND BAR CHARTS ── */}
        {trendData.hr.length >= 1 && !selectedDate && (
          <View style={trendStyles.section}>
            <View style={trendStyles.headerRow}>
              <Text style={trendStyles.sectionTitle}>{txt.trend_title}</Text>
              <View style={trendStyles.dayToggle}>
                <TouchableOpacity
                  style={[trendStyles.dayBtn, trendDays === 7 && trendStyles.dayBtnActive]}
                  onPress={() => setTrendDays(7)}
                >
                  <Text style={[trendStyles.dayBtnText, trendDays === 7 && trendStyles.dayBtnTextActive]}>7D</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[trendStyles.dayBtn, trendDays === 30 && trendStyles.dayBtnActive]}
                  onPress={() => setTrendDays(30)}
                >
                  <Text style={[trendStyles.dayBtnText, trendDays === 30 && trendStyles.dayBtnTextActive]}>30D</Text>
                </TouchableOpacity>
              </View>
            </View>
            {serverTrends?.stats?.total_readings > 0 && (
              <View style={trendStyles.statsRow}>
                <Text style={trendStyles.statBadge}>{serverTrends.stats.total_readings} {language === 'en' ? 'readings' : 'lecturas'}</Text>
              </View>
            )}
            <BarChart data={trendData.hr} labels={trendData.labels} label={language === 'en' ? 'Heart Rate' : 'Frecuencia Cardiaca'} color="#EF4444" unit="bpm" metricKey="hr" IconComponent={Heart} iconColor="#EF4444" />
            <BarChart data={trendData.spo2} labels={trendData.labels} label="SpO2" color="#3B82F6" unit="%" maxVal={100} metricKey="spo2" IconComponent={Wind} iconColor="#1B7A6E" />
            <BarChart data={trendData.sys} labels={trendData.labels} label={language === 'en' ? 'Blood Pressure' : 'Presion Arterial'} color="#8B5CF6" unit="mmHg" metricKey="sys" IconComponent={Activity} iconColor="#8B5CF6" />
            <BarChart data={trendData.glu} labels={trendData.labels} label={language === 'en' ? 'Glucose' : 'Glucosa'} color="#F59E0B" unit="mg/dL" metricKey="glu" IconComponent={Droplets} iconColor="#1B7A6E" />
            <BarChart data={trendData.temp} labels={trendData.labels} label={language === 'en' ? 'Temperature' : 'Temperatura'} color="#06B6D4" unit="°C" metricKey="temp" IconComponent={Thermometer} iconColor="#1B7A6E" />
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
                    {item.is_sos ? txt.sos_label : ((SEVERITY_MAP[language] || SEVERITY_MAP.es)[item.tipo_emergencia] || item.tipo_emergencia)}
                  </Text>
                  <Text style={styles.timestamp}>{new Date(item.timestamp).toLocaleString()}</Text>
                </View>
                {item.vitals?.hr && (
                  <View style={styles.vitalsRow}>
                    <View style={styles.chipWithIcon}>
                      <Heart size={12} color="#EF4444" strokeWidth={2.5} />
                      <Text style={styles.chip}>{item.vitals.hr}</Text>
                    </View>
                    <View style={styles.chipWithIcon}>
                      <Wind size={12} color="#1B7A6E" strokeWidth={2.5} />
                      <Text style={styles.chip}>{item.vitals.spo2}%</Text>
                    </View>
                    <View style={styles.chipWithIcon}>
                      <Activity size={12} color="#8B5CF6" strokeWidth={2.5} />
                      <Text style={styles.chip}>{item.vitals.sys}/{item.vitals.dia}</Text>
                    </View>
                    <View style={styles.chipWithIcon}>
                      <Droplets size={12} color="#1B7A6E" strokeWidth={2.5} />
                      <Text style={styles.chip}>{item.vitals.glucose}</Text>
                    </View>
                  </View>
                )}
                <Text style={styles.desc} numberOfLines={2}>{item.descripcion}</Text>
                <View style={styles.metaRow}>
                  <Text style={styles.meta}>{txt.ml}: {(SEVERITY_MAP[language] || SEVERITY_MAP.es)[item.ml_level] || item.ml_level} ({language === 'en' ? 'conf' : 'conf'}. {(item.ml_confidence * 100).toFixed(0)}%)</Text>
                  <Text style={styles.meta}>{language === 'en' ? 'Preventive Score' : 'Score preventivo'}: {item.score?.toFixed?.(0) || item.score}</Text>
                </View>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>—</Text>
            <Text style={styles.emptyTitle}>{selectedDate ? (language === 'en' ? 'No records for this date' : 'Sin registros para esta fecha') : txt.empty_title}</Text>
            <Text style={styles.emptyText}>{selectedDate ? '' : txt.empty_text}</Text>
          </View>
        )}

        {/* ── PREVENTIVE ALERTS SECTION ── */}
        {preventiveAlerts.length > 0 && (
          <View style={alertStyles.section}>
            <Text style={alertStyles.sectionTitle}>{txt.alerts_title}</Text>
            {preventiveAlerts.slice(0, 10).map((alert) => {
              const sevColor = alert.severity === 'HIGH' ? '#DC2626'
                : alert.severity === 'MEDIUM' ? '#F59E0B' : '#3B82F6';
              const sevLabel = txt[`alerts_severity_${alert.severity}`] || alert.severity;
              return (
                <View key={alert.id} style={alertStyles.card}>
                  <View style={[alertStyles.sevBar, { backgroundColor: sevColor }]} />
                  <View style={alertStyles.cardContent}>
                    <View style={alertStyles.cardHeader}>
                      <View style={[alertStyles.sevBadge, { backgroundColor: sevColor + '18' }]}>
                        <Text style={[alertStyles.sevText, { color: sevColor }]}>{sevLabel}</Text>
                      </View>
                      <Text style={alertStyles.alertTime}>
                        {new Date(alert.created_at).toLocaleString()}
                      </Text>
                    </View>
                    <Text style={alertStyles.alertTitle}>{alert.title}</Text>
                    <Text style={alertStyles.alertMsg} numberOfLines={2}>{alert.message}</Text>
                    <View style={alertStyles.metricRow}>
                      <Text style={alertStyles.metricChip}>
                        {alert.metric}: {alert.current_value}
                      </Text>
                      {alert.acknowledged_at && (
                        <Text style={alertStyles.ackBadge}>
                          {alert.response_type === 'false_alarm'
                            ? (language === 'en' ? 'Dismissed' : 'Descartada')
                            : alert.response_type === 'need_help'
                              ? (language === 'en' ? 'Escalated' : 'Escalada')
                              : (language === 'en' ? 'Seen' : 'Vista')}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.secondary },
  dayToggle: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 2 },
  dayBtn: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 10 },
  dayBtnActive: { backgroundColor: COLORS.primary },
  dayBtnText: { fontSize: 11, fontWeight: '800', color: '#94A3B8' },
  dayBtnTextActive: { color: '#FFF' },
  container: { marginBottom: 12 },
  label: { fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 4 },
  chart: { position: 'relative', backgroundColor: '#F8FAFC', borderRadius: 8, overflow: 'hidden' },
  point: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },
  maxLabel: { position: 'absolute', right: 4, bottom: 2, fontSize: 10, fontWeight: '800', color: '#64748B' },
  statsRow: { flexDirection: 'row', marginBottom: 10 },
  statBadge: { fontSize: 11, fontWeight: '700', color: COLORS.primary, backgroundColor: COLORS.primary + '15', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
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
  chipWithIcon: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, gap: 4 },
  chipIcon: { width: 14, height: 14, tintColor: '#1B7A6E' },
  chip: { fontSize: 11, fontWeight: '700', color: COLORS.text },
  desc: { fontSize: 11, color: '#64748B', lineHeight: 16, marginBottom: 6 },
  metaRow: { flexDirection: 'row', gap: 12 },
  meta: { fontSize: 10, color: '#94A3B8', fontWeight: '600' },
  emptyContainer: { alignItems: 'center', padding: SPACING.xl, marginTop: 20 },
  emptyIcon: { fontSize: 48, marginBottom: SPACING.md },
  emptyTitle: { color: COLORS.secondary, fontSize: 18, fontWeight: 'bold' },
  emptyText: { color: '#94A3B8', fontSize: 14, textAlign: 'center', marginTop: 8 },
});

// ─── Alert Styles ────────────────────────────────────────
const alertStyles = StyleSheet.create({
  section: {
    backgroundColor: COLORS.surface, borderRadius: 16,
    margin: SPACING.md, padding: SPACING.md,
    elevation: 2, borderWidth: 1, borderColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 16, fontWeight: '900', color: COLORS.secondary,
    marginBottom: 12, letterSpacing: 0.3,
  },
  card: {
    backgroundColor: '#FAFAFA', borderRadius: 12,
    marginBottom: 10, flexDirection: 'row', overflow: 'hidden',
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  sevBar: { width: 4 },
  cardContent: { flex: 1, padding: 12 },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 6,
  },
  sevBadge: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6,
  },
  sevText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  alertTime: { fontSize: 10, color: '#94A3B8', fontWeight: '600' },
  alertTitle: {
    fontSize: 13, fontWeight: '800', color: COLORS.secondary,
    marginBottom: 4, lineHeight: 18,
  },
  alertMsg: { fontSize: 11, color: '#64748B', lineHeight: 16, marginBottom: 6 },
  metricRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  metricChip: {
    fontSize: 11, fontWeight: '700', color: COLORS.text,
    backgroundColor: '#F1F5F9', paddingHorizontal: 8,
    paddingVertical: 3, borderRadius: 6,
  },
  ackBadge: {
    fontSize: 10, fontWeight: '700', color: '#059669',
    backgroundColor: '#D1FAE5', paddingHorizontal: 8,
    paddingVertical: 2, borderRadius: 6,
  },
});
