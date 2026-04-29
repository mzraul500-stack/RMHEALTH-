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
export function MedicationCard({ medication, isTaken, doseHistory, onRecordDose, onEdit, onDelete }) {
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

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
      <View style={styles.cardContainer}>
        <TouchableOpacity
          style={[styles.card, isTaken ? styles.cardTaken : styles.cardPending]}
          onPress={handlePress}
          activeOpacity={0.85}
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
              <Text style={styles.timeIcon}>Próxima toma:</Text>
              <Text style={styles.time}>{medication.time}</Text>
            </View>
          </View>

          {/* Right: Status */}
          <View style={styles.rightSection}>
            <Text style={[styles.statusText, { color: isTaken ? '#10B981' : '#EF4444' }]}>
              {isTaken ? 'Completado' : 'Pendiente'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Action Buttons Row */}
        <View style={styles.actionsRow}>
          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={() => onEdit(medication)}
          >
            <Text style={[styles.actionText, { color: '#3BAFAA' }]}>Editar</Text>
          </TouchableOpacity>
          
          <View style={styles.divider} />

          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={() => onDelete(medication.id, medication.name)}
          >
            <Text style={[styles.actionText, { color: '#E74C3C' }]}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    marginVertical: 8,
    marginHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#1B4F72',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  card: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 6,
  },
  cardPending: { borderLeftColor: '#3BAFAA' }, // Marca Teal RMHealth
  cardTaken: { borderLeftColor: '#10B981' },
  leftIndicator: { marginRight: 14 },
  statusCircle: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  circlePending: { borderColor: '#3BAFAA', backgroundColor: '#F0F9F9' },
  circleTaken: { borderColor: '#10B981', backgroundColor: '#10B981' },
  checkmark: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  infoContainer: { flex: 1 },
  name: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 2 },
  nameTaken: { opacity: 0.6 },
  details: { fontSize: 13, color: '#64748B', marginBottom: 4, fontWeight: '600' },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timeIcon: { fontSize: 12, marginRight: 4, color: '#94A3B8' },
  time: { fontSize: 14, fontWeight: '700', color: '#1B4F72' },
  rightSection: { alignItems: 'flex-end' },
  statusText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  actionsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  divider: {
    width: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 10,
  }
});
