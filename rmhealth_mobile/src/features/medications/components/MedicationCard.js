import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { COLORS, SPACING } from '../../../theme';

/**
 * MedicationCard — Individual medication with daily dose tracking.
 *
 * Features:
 * - Tap to record dose (today)
 * - Shows 7-day dose history as dots
 * - Long press delete
 * - Animated entry
 */
export function MedicationCard({ medication, isTaken, doseHistory, onRecordDose, onDelete }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 8, useNativeDriver: true }),
    ]).start();
  }, []);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.97, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
    onRecordDose(medication.id);
  };

  // 7-day mini calendar
  const weekDots = (doseHistory || []).slice(-7);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[styles.card, isTaken ? styles.cardTaken : styles.cardPending]}
        onPress={handlePress}
        activeOpacity={0.85}
        accessibilityLabel={`${medication.name}, ${isTaken ? 'tomada' : 'pendiente'}`}
        accessibilityRole="button"
      >
        {/* Left: Status circle */}
        <View style={styles.leftIndicator}>
          <View style={[styles.statusCircle, isTaken ? styles.circleTaken : styles.circlePending]}>
            {isTaken && <Text style={styles.checkmark}>✓</Text>}
          </View>
        </View>

        {/* Center: Info */}
        <View style={styles.infoContainer}>
          <Text style={[styles.name, isTaken && styles.nameTaken]}>{medication.name}</Text>
          <Text style={styles.details}>{medication.dosage} • {medication.frequency}</Text>
          <View style={styles.timeRow}>
            <Text style={styles.timeIcon}>🕐</Text>
            <Text style={styles.time}>{medication.time}</Text>
          </View>

          {/* 7-day dose history dots */}
          {weekDots.length > 0 && (
            <View style={styles.weekRow}>
              {weekDots.map((day, i) => (
                <View key={i} style={[styles.dayDot, day.taken ? styles.dotTaken : styles.dotMissed]}>
                  <Text style={styles.dotText}>{day.taken ? '✓' : '·'}</Text>
                </View>
              ))}
              <Text style={styles.weekLabel}>7 días</Text>
            </View>
          )}
        </View>

        {/* Right: Status + Delete */}
        <View style={styles.rightSection}>
          <Text style={[styles.statusText, { color: isTaken ? '#10B981' : '#EF4444' }]}>
            {isTaken ? 'Tomada ✓' : 'Pendiente'}
          </Text>
          {isTaken && medication._takenAt && (
            <Text style={styles.takenTime}>
              {new Date(medication._takenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
          {onDelete && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => onDelete(medication.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.deleteText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 16,
    marginVertical: 6, marginHorizontal: SPACING.md,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#1E293B', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
    borderLeftWidth: 5,
  },
  cardPending: { borderLeftColor: '#EF4444' },
  cardTaken: { borderLeftColor: '#10B981' },
  leftIndicator: { marginRight: 14 },
  statusCircle: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  circlePending: { borderColor: '#EF4444', backgroundColor: '#FEE2E2' },
  circleTaken: { borderColor: '#10B981', backgroundColor: '#10B981' },
  checkmark: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  infoContainer: { flex: 1 },
  name: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 2 },
  nameTaken: { textDecorationLine: 'line-through', opacity: 0.6 },
  details: { fontSize: 14, color: '#64748B', marginBottom: 4, fontWeight: '500' },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timeIcon: { fontSize: 12, marginRight: 4 },
  time: { fontSize: 16, fontWeight: '700', color: COLORS.primary },
  weekRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 3 },
  dayDot: {
    width: 18, height: 18, borderRadius: 9,
    justifyContent: 'center', alignItems: 'center',
  },
  dotTaken: { backgroundColor: '#D1FAE5' },
  dotMissed: { backgroundColor: '#F1F5F9' },
  dotText: { fontSize: 10, fontWeight: '800', color: '#10B981' },
  weekLabel: { fontSize: 9, color: '#94A3B8', marginLeft: 4, fontWeight: '600' },
  rightSection: { alignItems: 'flex-end', justifyContent: 'space-between', paddingLeft: 8, minHeight: 60 },
  statusText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  takenTime: { fontSize: 10, color: '#10B981', fontWeight: '600', marginTop: 2 },
  deleteButton: { padding: 4, marginTop: 4 },
  deleteText: { fontSize: 16, color: '#CBD5E1', fontWeight: 'bold' },
});
