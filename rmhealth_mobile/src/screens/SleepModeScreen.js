/**
 * SleepModeScreen.js — Full-screen sleep/rest calendar and history view.
 *
 * DESIGN RULES:
 *  - Sleep data is CONTEXTUAL/PREVENTIVE — never diagnostic.
 *  - Does NOT modify clinical severity, CJM scores, or MedicalEngine.
 *  - Does NOT trigger emergency alerts or notifications.
 *  - Uses approved safe language only (see founder's guidelines).
 *  - User-facing text: Spanish. Code/comments/logs: English.
 *
 * FEATURES:
 *  - Last night summary at top.
 *  - 7d/30d averages.
 *  - Monthly calendar grid with dots.
 *  - Bar chart for sleep hours (7d/30d).
 *  - Day detail card for selected date.
 *  - Manual refresh button.
 *  - Persistent history survives app restarts.
 *  - Adult-friendly: large text, clear cards.
 *
 * © 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet, View, Text, ScrollView, SafeAreaView,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Moon, Clock, RefreshCw, TrendingUp, Info, BarChart3 } from 'lucide-react-native';
import { COLORS, SPACING } from '../theme';
import { useSleepData } from '../hooks/useSleepData';
import {
  formatSleepDuration, formatDateSpanish, formatTimeShort,
  groupSleepByDate, calculateSleepAverages,
} from '../utils/sleepUtils';
import { CalendarMonthView } from '../components/CalendarMonthView';

// Chart range options
const CHART_RANGES = [
  { key: '7d',  label: '7 días',  days: 7  },
  { key: '30d', label: '30 días', days: 30 },
];

export const SleepModeScreen = () => {
  const {
    sleepData, sleepHistory, groupedDays, averages,
    isLoading, error, refresh, refreshHistory, isEnabled,
  } = useSleepData();

  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [chartRange, setChartRange] = useState('7d');
  const scrollViewRef = useRef(null);
  const dayCardYRef = useRef(0);

  // Auto-scroll to day card when a date is selected
  useEffect(() => {
    if (selectedDate && scrollViewRef.current && dayCardYRef.current > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: dayCardYRef.current - 80, animated: true });
      }, 150);
    }
  }, [selectedDate]);

  // Pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshHistory(90);
    await refresh();
    setRefreshing(false);
  }, [refreshHistory, refresh]);

  // Load history on mount
  useEffect(() => {
    if (isEnabled) {
      refreshHistory(90);
    }
  }, [isEnabled]);

  // Build markedDates for the calendar
  const markedDates = useMemo(() => {
    const marks = {};
    groupedDays.forEach(day => {
      if (day.totalMinutes > 0) {
        marks[day.date] = {
          dots: [{ color: '#818CF8', key: 'sleep' }],
          data: day,
        };
      }
    });
    return marks;
  }, [groupedDays]);

  // Selected day data
  const selectedDayData = useMemo(() => {
    if (!selectedDate) return null;
    return groupedDays.find(d => d.date === selectedDate) || null;
  }, [selectedDate, groupedDays]);

  // Chart data
  const chartData = useMemo(() => {
    const rangeOpt = CHART_RANGES.find(r => r.key === chartRange) || CHART_RANGES[0];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - rangeOpt.days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const days = [];
    for (let i = rangeOpt.days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const found = groupedDays.find(g => g.date === key);
      days.push({
        date: key,
        label: d.getDate().toString(),
        hours: found ? found.totalMinutes / 60 : 0,
      });
    }
    return days;
  }, [groupedDays, chartRange]);

  // Max for chart scaling
  const maxHours = useMemo(() => {
    const m = Math.max(...chartData.map(d => d.hours), 1);
    return Math.max(m, 8); // Minimum scale of 8h
  }, [chartData]);

  // Feature disabled guard
  if (!isEnabled) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.emptyContainer}>
          <Moon size={48} color="#94A3B8" />
          <Text style={s.emptyText}>Modo de descanso no disponible</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
        }
        ref={scrollViewRef}
      >
        {/* Header */}
        <View style={s.header}>
          <Moon size={28} color="#818CF8" />
          <Text style={s.headerTitle}>Historial de Descanso</Text>
        </View>

        {/* Loading state */}
        {isLoading && !sleepData && sleepHistory.length === 0 && (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={s.loadingText}>Leyendo datos de sueño...</Text>
          </View>
        )}

        {/* ── Last Night Summary ── */}
        <View style={s.lastNightCard}>
          <Text style={s.sectionLabel}>ÚLTIMA NOCHE</Text>
          {sleepData ? (
            <>
              <Text style={s.durationLarge}>
                {formatSleepDuration(sleepData.totalMinutes)}
              </Text>
              <View style={s.timeRow}>
                <Clock size={14} color="#818CF8" />
                <Text style={s.timeText}>
                  {sleepData.sessions?.[0]
                    ? `${formatTimeShort(sleepData.sessions[0].start)} → ${formatTimeShort(sleepData.sessions[sleepData.sessions.length - 1].end)}`
                    : '--'}
                </Text>
              </View>
              <View style={s.metaRow}>
                <Text style={s.qualityBadge}>
                  {sleepData.quality === 'good' ? '🌙 Buen descanso'
                    : sleepData.quality === 'fair' ? '🌗 Descanso moderado'
                    : '⚡ Descanso insuficiente'}
                </Text>
              </View>
              <Text style={s.sourceSmall}>
                Dato obtenido desde Health Connect · {sleepData.sessionCount} sesión{sleepData.sessionCount !== 1 ? 'es' : ''}
              </Text>
            </>
          ) : (
            <>
              <Text style={s.noDataText}>Sin datos de sueño para hoy</Text>
              <Text style={s.hintText}>
                Verifica que tu reloj haya registrado descanso y que Samsung Health sincronice con Health Connect.
              </Text>
            </>
          )}
        </View>

        {/* ── Averages Card ── */}
        {(averages?.days_with_data_7d > 0 || averages?.days_with_data_30d > 0) && (
          <View style={s.averagesCard}>
            <View style={s.averagesHeader}>
              <TrendingUp size={18} color="#818CF8" />
              <Text style={s.sectionLabel}>PROMEDIOS</Text>
            </View>
            <View style={s.avgGrid}>
              <View style={s.avgItem}>
                <Text style={s.avgValue}>
                  {averages?.avg_7d ? formatSleepDuration(averages.avg_7d) : '--'}
                </Text>
                <Text style={s.avgLabel}>Promedio 7 días</Text>
                <Text style={s.avgDays}>
                  {averages?.days_with_data_7d || 0} días con registro
                </Text>
              </View>
              <View style={s.avgDivider} />
              <View style={s.avgItem}>
                <Text style={s.avgValue}>
                  {averages?.avg_30d ? formatSleepDuration(averages.avg_30d) : '--'}
                </Text>
                <Text style={s.avgLabel}>Promedio 30 días</Text>
                <Text style={s.avgDays}>
                  {averages?.days_with_data_30d || 0} días con registro
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Bar Chart: Sleep Hours ── */}
        <View style={s.chartCard}>
          <View style={s.chartHeaderRow}>
            <BarChart3 size={16} color="#818CF8" />
            <Text style={s.sectionLabel}>HORAS DE DESCANSO</Text>
          </View>
          {/* Range toggle */}
          <View style={s.chartRangeRow}>
            {CHART_RANGES.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[s.chartRangeBtn, chartRange === opt.key && s.chartRangeBtnActive]}
                onPress={() => setChartRange(opt.key)}
              >
                <Text style={[s.chartRangeBtnText, chartRange === opt.key && s.chartRangeBtnTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Bar chart (native View bars) */}
          <View style={s.chartArea}>
            {/* Y-axis reference lines */}
            <View style={s.chartYAxis}>
              <Text style={s.chartYLabel}>{Math.round(maxHours)}h</Text>
              <Text style={s.chartYLabel}>{Math.round(maxHours / 2)}h</Text>
              <Text style={s.chartYLabel}>0h</Text>
            </View>
            <View style={s.chartBars}>
              {chartData.map((bar, i) => {
                const pct = maxHours > 0 ? (bar.hours / maxHours) * 100 : 0;
                const isGood = bar.hours >= 7;
                const isFair = bar.hours >= 5 && bar.hours < 7;
                const barColor = bar.hours === 0 ? '#E2E8F0' : isGood ? '#818CF8' : isFair ? '#F59E0B' : '#EF4444';
                return (
                  <View key={i} style={s.barColumn}>
                    <View style={s.barTrack}>
                      <View style={[s.barFill, { height: `${Math.max(pct, 3)}%`, backgroundColor: barColor }]} />
                    </View>
                    <Text style={s.barLabel}>{bar.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* ── Refresh Button ── */}
        <TouchableOpacity style={s.refreshButton} onPress={onRefresh} disabled={isLoading}>
          <RefreshCw size={16} color="#6366F1" />
          <Text style={s.refreshButtonText}>Actualizar datos de sueño</Text>
        </TouchableOpacity>

        {/* ── Monthly Calendar ── */}
        <View style={s.calendarSection}>
          <Text style={[s.sectionLabel, { marginBottom: 8 }]}>CALENDARIO DE DESCANSO</Text>
          <CalendarMonthView
            markedDates={markedDates}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            accentColor="#818CF8"
            language="es"
          />

          {/* Selected day detail */}
          {selectedDate && (
            <View onLayout={(e) => { dayCardYRef.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height; }}>
              {selectedDayData ? (
                <DayCard day={selectedDayData} />
              ) : (
                <View style={s.emptyDayCard}>
                  <Text style={s.emptyDayText}>Sin datos de sueño para {formatDateSpanish(selectedDate)}</Text>
                  <Text style={[s.emptyDayText, { marginTop: 4, fontSize: 11 }]}>
                    Es posible que tu reloj no haya registrado descanso ese día.
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── Error Display ── */}
        {error && (
          <View style={s.errorCard}>
            <Text style={s.errorText}>
              No fue posible leer tus datos de sueño en este momento.
            </Text>
          </View>
        )}

        {/* ── Disclaimer (always visible) ── */}
        <View style={s.disclaimerCard}>
          <View style={s.disclaimerRow}>
            <Info size={14} color="#92400E" />
            <Text style={s.disclaimerTitle}>Contexto preventivo</Text>
          </View>
          <Text style={s.disclaimerText}>
            Los datos de descanso son informativos y de bienestar general.
            No constituyen diagnóstico médico, no detectan trastornos del sueño
            y no sustituyen la consulta médica profesional.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// ── Day Card Component ──
const DayCard = ({ day }) => {
  const hasData = day.totalMinutes > 0;

  return (
    <View style={s.dayCard}>
      <View style={s.dayHeader}>
        <Text style={s.dayDate}>{formatDateSpanish(day.date)}</Text>
        {hasData && (
          <Text style={s.dayDuration}>{formatSleepDuration(day.totalMinutes)}</Text>
        )}
      </View>

      {hasData ? (
        <>
          <View style={s.dayDetailsRow}>
            <View style={s.dayDetail}>
              <Text style={s.dayDetailLabel}>Inicio</Text>
              <Text style={s.dayDetailValue}>{formatTimeShort(day.startTime)}</Text>
            </View>
            <View style={s.dayDetail}>
              <Text style={s.dayDetailLabel}>Fin</Text>
              <Text style={s.dayDetailValue}>{formatTimeShort(day.endTime)}</Text>
            </View>
            <View style={s.dayDetail}>
              <Text style={s.dayDetailLabel}>Duración</Text>
              <Text style={s.dayDetailValue}>{formatSleepDuration(day.totalMinutes)}</Text>
            </View>
          </View>
          <View style={s.dayFooter}>
            <Text style={s.daySource}>
              {day.source === 'health_connect' ? 'Health Connect' : day.source}
            </Text>
            {day.sessionCount > 1 && (
              <Text style={s.daySessionCount}>
                {day.sessionCount} sesiones
              </Text>
            )}
          </View>
        </>
      ) : (
        <Text style={s.dayNoData}>Sin datos de sueño para este día</Text>
      )}
    </View>
  );
};

// ── Styles ──
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 3,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.secondary,
  },

  // Loading
  loadingContainer: {
    padding: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
  },

  // Empty
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  emptyText: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
  },

  // Last Night Card
  lastNightCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: SPACING.lg,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: SPACING.md,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1,
  },
  durationLarge: {
    fontSize: 36,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeText: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
  },
  metaRow: {
    marginTop: 2,
  },
  qualityBadge: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366F1',
  },
  sourceSmall: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },
  noDataText: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 4,
  },
  hintText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 17,
  },

  // Averages Card
  averagesCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: SPACING.md,
  },
  averagesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.sm,
  },
  avgGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avgItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  avgDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E2E8F0',
  },
  avgValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  avgLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  avgDays: {
    fontSize: 10,
    color: '#94A3B8',
  },

  // Bar Chart
  chartCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: SPACING.md,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.sm,
  },
  chartRangeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACING.sm,
  },
  chartRangeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  chartRangeBtnActive: {
    backgroundColor: '#6366F1',
  },
  chartRangeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  chartRangeBtnTextActive: {
    color: '#FFFFFF',
  },
  chartArea: {
    flexDirection: 'row',
    height: 120,
  },
  chartYAxis: {
    width: 30,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 4,
    paddingBottom: 16,
  },
  chartYLabel: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: '600',
  },
  chartBars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 16,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
  },
  barTrack: {
    width: '60%',
    height: '100%',
    justifyContent: 'flex-end',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 4,
    minHeight: 2,
  },
  barLabel: {
    fontSize: 8,
    color: '#94A3B8',
    fontWeight: '600',
    marginTop: 2,
    position: 'absolute',
    bottom: 0,
  },

  // Refresh
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    marginBottom: SPACING.lg,
  },
  refreshButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6366F1',
  },

  // Calendar Section
  calendarSection: {
    marginBottom: SPACING.md,
  },

  // Empty day card
  emptyDayCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyDayText: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
  },

  // Day Card
  dayCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dayDate: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.secondary,
    flex: 1,
  },
  dayDuration: {
    fontSize: 16,
    fontWeight: '800',
    color: '#6366F1',
  },
  dayDetailsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: 6,
  },
  dayDetail: {
    gap: 2,
  },
  dayDetailLabel: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dayDetailValue: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  dayFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  daySource: {
    fontSize: 10,
    color: '#94A3B8',
  },
  daySessionCount: {
    fontSize: 10,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  dayNoData: {
    fontSize: 13,
    color: '#CBD5E1',
    fontStyle: 'italic',
  },

  // Error
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: SPACING.md,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    fontSize: 13,
    color: '#B91C1C',
    textAlign: 'center',
  },

  // Disclaimer
  disclaimerCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    padding: SPACING.md,
    gap: SPACING.xs,
    borderWidth: 1,
    borderColor: '#FED7AA',
    marginTop: SPACING.lg,
  },
  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  disclaimerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
  },
  disclaimerText: {
    fontSize: 11,
    color: '#92400E',
    lineHeight: 16,
  },
});
