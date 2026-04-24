import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { COLORS, SPACING } from '../../../theme';

/**
 * MedicationCard — Individual medication display with toggle and delete.
 *
 * Features:
 * - Tap to toggle taken/pending status
 * - Long press to delete (with confirmation via parent)
 * - Animated fade-in on mount
 * - Visual status indicator (green/red border + icon)
 */
export function MedicationCard({ medication, onToggleTaken, onDelete }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handlePress = () => {
    // Quick scale bounce animation
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.97,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start();
    onToggleTaken(medication.id);
  };

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[
          styles.card,
          medication.taken ? styles.cardTaken : styles.cardPending,
        ]}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        <View style={styles.leftIndicator}>
          <View style={[
            styles.statusCircle,
            medication.taken ? styles.circleTaken : styles.circlePending,
          ]}>
            {medication.taken && (
              <Text style={styles.checkmark}>✓</Text>
            )}
          </View>
        </View>

        <View style={styles.infoContainer}>
          <Text style={[
            styles.name,
            medication.taken && styles.nameTaken,
          ]}>
            {medication.name}
          </Text>
          <Text style={styles.details}>
            {medication.dosage} • {medication.frequency}
          </Text>
          <View style={styles.timeRow}>
            <Text style={styles.timeIcon}>🕐</Text>
            <Text style={styles.time}>{medication.time}</Text>
          </View>
        </View>

        <View style={styles.rightSection}>
          <Text style={[
            styles.statusText,
            { color: medication.taken ? '#10B981' : '#EF4444' },
          ]}>
            {medication.taken ? 'Tomada' : 'Pendiente'}
          </Text>
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
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginVertical: 6,
    marginHorizontal: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderLeftWidth: 5,
  },
  cardPending: {
    borderLeftColor: '#EF4444',
  },
  cardTaken: {
    borderLeftColor: '#10B981',
  },
  leftIndicator: {
    marginRight: 14,
  },
  statusCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circlePending: {
    borderColor: '#EF4444',
    backgroundColor: '#FEE2E2',
  },
  circleTaken: {
    borderColor: '#10B981',
    backgroundColor: '#10B981',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoContainer: {
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 2,
  },
  nameTaken: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  details: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 4,
    fontWeight: '500',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  time: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
  rightSection: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingLeft: 8,
    height: 60,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  deleteButton: {
    padding: 4,
  },
  deleteText: {
    fontSize: 16,
    color: '#CBD5E1',
    fontWeight: 'bold',
  },
});
