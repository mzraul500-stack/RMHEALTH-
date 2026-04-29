import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { COLORS, SPACING } from '../../../theme';

/**
 * AdherenceDashboard — Premium visual dashboard for medication tracking.
 *
 * Shows:
 * - Animated circular progress indicator with percentage
 * - Taken vs Pending counts with color coding
 * - Per-medication status pills
 * - Motivational message based on adherence level
 */
export const AdherenceDashboard = ({ medications, language = 'es' }) => {
  const total = medications.length;
  const takenCount = medications.filter(m => m.taken).length;
  const pendingCount = total - takenCount;
  const percentage = total === 0 ? 0 : Math.round((takenCount / total) * 100);

  // Animate the progress value on mount / change
  const animValue = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(animValue, {
        toValue: percentage,
        duration: 1200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
  }, [percentage]);

  // Dynamic status color
  let statusColor = '#EF4444'; // Red
  let statusMessage = language === 'en' ? 'Pending medications remaining' : 'Medicinas pendientes';
  if (percentage >= 100) {
    statusColor = '#10B981';
    statusMessage = language === 'en' ? 'All doses completed' : 'Todas las dosis completadas';
  } else if (percentage >= 75) {
    statusColor = '#10B981';
    statusMessage = language === 'en' ? 'Almost complete' : 'Casi completo';
  } else if (percentage >= 50) {
    statusColor = '#F59E0B';
    statusMessage = language === 'en' ? 'Halfway through, continue with remaining doses' : 'Continúa con las dosis restantes';
  }

  // Animated scale for the circle border width
  const animatedBorderWidth = animValue.interpolate({
    inputRange: [0, 100],
    outputRange: [3, 8],
    extrapolate: 'clamp',
  });

  if (total === 0) {
    return (
      <Animated.View style={[styles.emptyContainer, { opacity: fadeIn }]}>
        <Text style={styles.emptyEmoji}>💊</Text>
        <Text style={styles.emptyText}>{language === 'en' ? 'Add your first medication' : 'Agrega tu primer medicamento'}</Text>
        <Text style={styles.emptySubtext}>{language === 'en' ? 'to see your adherence progress' : 'para ver tu progreso de adherencia'}</Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeIn }]}>
      {/* Main Card */}
      <View style={styles.card}>
        {/* Left: Circle Progress */}
        <View style={styles.progressSection}>
          <Animated.View style={[
            styles.circleOuter,
            { borderColor: statusColor, borderWidth: animatedBorderWidth }
          ]}>
            <View style={styles.circleInner}>
              <Text style={[styles.percentageText, { color: statusColor }]}>
                {percentage}
              </Text>
              <Text style={styles.percentSign}>%</Text>
            </View>
          </Animated.View>
          <Text style={styles.fractionText}>{takenCount} {language === 'en' ? 'of' : 'de'} {total}</Text>
        </View>

        {/* Right: Stats */}
        <View style={styles.statsSection}>
          {/* Taken */}
          <View style={styles.statRow}>
            <View style={[styles.statDot, { backgroundColor: '#10B981' }]} />
            <View style={styles.statInfo}>
              <Text style={styles.statNumber}>{takenCount}</Text>
              <Text style={styles.statLabel}>{language === 'en' ? 'Taken' : 'Tomadas'}</Text>
            </View>
          </View>

          {/* Pending */}
          <View style={[styles.statRow, { marginTop: 14 }]}>
            <View style={[styles.statDot, { backgroundColor: '#EF4444' }]} />
            <View style={styles.statInfo}>
              <Text style={styles.statNumber}>{pendingCount}</Text>
              <Text style={styles.statLabel}>{language === 'en' ? 'Pending' : 'Pendientes'}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Status Message */}
      <View style={[styles.statusBar, { backgroundColor: statusColor + '18' }]}>
        <Text style={[styles.statusMessage, { color: statusColor }]}>
          {statusMessage}
        </Text>
      </View>

      {/* Per-medication pills */}
      <View style={styles.pillsRow}>
        {medications.map((med) => (
          <View
            key={med.id}
            style={[
              styles.pill,
              { backgroundColor: med.taken ? '#10B98120' : '#EF444420' },
              { borderColor: med.taken ? '#10B981' : '#EF4444' },
            ]}
          >
            <Text style={[
              styles.pillText,
              { color: med.taken ? '#059669' : '#DC2626' },
            ]}>
              {med.taken ? '✓' : '○'} {med.name}
            </Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  emptyContainer: {
    marginVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 4,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.8)',
  },
  progressSection: {
    alignItems: 'center',
    marginRight: SPACING.lg,
  },
  circleOuter: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  circleInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  percentageText: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1,
  },
  percentSign: {
    fontSize: 16,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 6,
    marginLeft: 1,
  },
  fractionText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 8,
  },
  statsSection: {
    flex: 1,
    justifyContent: 'center',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  statInfo: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
  },
  statusEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  statusMessage: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: SPACING.sm,
    gap: 6,
  },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
