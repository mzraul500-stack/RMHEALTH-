import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { COLORS, SPACING } from '../../../theme';
import { getAdherenceHistory, getWeeklyAverage } from '../services/AdherenceTracker';

/**
 * WeeklyChart — Animated bar chart showing 7-day adherence history.
 *
 * Each bar represents one day's adherence percentage.
 * Color-coded: green (≥80%), amber (≥50%), red (<50%).
 * Shows weekly average at the top.
 */
export const WeeklyChart = () => {
  const [history, setHistory] = useState([]);
  const [weekAvg, setWeekAvg] = useState(0);
  const barAnims = useRef([...Array(7)].map(() => new Animated.Value(0))).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    const data = await getAdherenceHistory(7);
    const avg = await getWeeklyAverage();
    setHistory(data);
    setWeekAvg(avg);

    // Animate bars sequentially
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    const barAnimations = data.map((day, index) =>
      Animated.timing(barAnims[index], {
        toValue: day.percentage,
        duration: 600,
        delay: index * 80,
        useNativeDriver: false,
      })
    );
    Animated.stagger(60, barAnimations).start();
  };

  const getBarColor = (percentage) => {
    if (percentage >= 80) return '#10B981';
    if (percentage >= 50) return '#F59E0B';
    return '#EF4444';
  };

  const getTodayKey = () => new Date().toISOString().split('T')[0];

  if (history.length === 0) return null;

  return (
    <Animated.View style={[styles.container, { opacity: fadeIn }]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Semana de Adherencia</Text>
        <View style={styles.avgBadge}>
          <Text style={styles.avgText}>{weekAvg}% prom.</Text>
        </View>
      </View>

      <View style={styles.chartContainer}>
        {history.map((day, index) => {
          const isToday = day.date === getTodayKey();
          const barHeight = barAnims[index].interpolate({
            inputRange: [0, 100],
            outputRange: [4, 100],
            extrapolate: 'clamp',
          });

          return (
            <View key={day.date} style={styles.barColumn}>
              <Text style={styles.barValue}>
                {day.total > 0 ? `${day.percentage}%` : '—'}
              </Text>
              <View style={styles.barTrack}>
                <Animated.View
                  style={[
                    styles.barFill,
                    {
                      height: barHeight,
                      backgroundColor: day.total > 0
                        ? getBarColor(day.percentage)
                        : '#E2E8F0',
                    },
                  ]}
                />
              </View>
              <Text style={[
                styles.dayLabel,
                isToday && styles.dayLabelToday,
              ]}>
                {day.dayLabel}
              </Text>
              {isToday && <View style={styles.todayDot} />}
            </View>
          );
        })}
      </View>

      {/* Legend */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
          <Text style={styles.legendText}>≥80%</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
          <Text style={styles.legendText}>50-79%</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
          <Text style={styles.legendText}>&lt;50%</Text>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: SPACING.sm,
    marginHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: SPACING.lg,
    elevation: 6,
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.6)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  avgBadge: {
    backgroundColor: COLORS.primary + '20',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  avgText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 140,
    paddingTop: 10,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barValue: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 4,
  },
  barTrack: {
    width: 24,
    height: 100,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: 24,
    borderRadius: 12,
    minHeight: 4,
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 6,
  },
  dayLabelToday: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  todayDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
    marginTop: 3,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.md,
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  legendText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
});
