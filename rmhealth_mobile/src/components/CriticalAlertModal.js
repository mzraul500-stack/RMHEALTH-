import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  TextInput, Vibration, Platform, Animated, Easing,
  ScrollView, KeyboardAvoidingView, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../theme';

/**
 * CriticalAlertModal — Full-screen red modal for preventive alert escalation.
 *
 * Design: Dark red background, white text, no emojis.
 * Cannot be dismissed without pressing one of two buttons:
 *   1. "Estoy bien — Falsa alarma" (requires reason)
 *   2. "Necesito ayuda ahora" (triggers emergency contacts)
 *
 * Activates vibration + visual pulse on mount.
 *
 * © 2025 MORALES ZEPEDA RAUL | Registro INDAUTOR: 03-2025-070109072500-01
 */

const SEVERITY_LABELS = {
  LOW: { es: 'ALERTA', en: 'ALERT' },
  MEDIUM: { es: 'URGENTE', en: 'URGENT' },
  HIGH: { es: 'EMERGENCIA', en: 'EMERGENCY' },
};

const METRIC_LABELS = {
  heart_rate: { es: 'Frecuencia Cardíaca', en: 'Heart Rate', unit: 'bpm' },
  systolic: { es: 'Presión Sistólica', en: 'Systolic BP', unit: 'mmHg' },
  diastolic: { es: 'Presión Diastólica', en: 'Diastolic BP', unit: 'mmHg' },
  spo2: { es: 'Saturación de Oxígeno', en: 'Oxygen Saturation', unit: '%' },
  glucose: { es: 'Glucosa', en: 'Glucose', unit: 'mg/dL' },
};

const FALSE_ALARM_REASONS = {
  es: [
    'Acabé de hacer ejercicio',
    'Estaba subiendo escaleras',
    'Medí mal los valores',
    'Error del dispositivo',
    'Otro motivo',
  ],
  en: [
    'Just finished exercising',
    'Was climbing stairs',
    'Measured values incorrectly',
    'Device error',
    'Other reason',
  ],
};

export function CriticalAlertModal({ visible, alert, language = 'es', onRespond, onClose }) {
  const insets = useSafeAreaInsets();
  const [showFalseAlarmForm, setShowFalseAlarmForm] = useState(false);
  const [selectedReason, setSelectedReason] = useState(null);
  const [customReason, setCustomReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Reset state
      setShowFalseAlarmForm(false);
      setSelectedReason(null);
      setCustomReason('');
      setIsSubmitting(false);

      // Vibration pattern: long-short-long
      if (Platform.OS !== 'web') {
        Vibration.vibrate([0, 500, 200, 500, 200, 800], false);
      }

      // Fade in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Pulse animation for severity label
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();

      // 60-second timeout for automatic emergency escalation
      const timeoutId = setTimeout(() => {
        console.warn('[CriticalAlertModal] Timeout de 60s alcanzado. Escalando a emergencia automáticamente.');
        onRespond(alert?.id, 'need_help', 'AUTO_TIMEOUT_60S');
      }, 60000);

      return () => {
        pulse.stop();
        clearTimeout(timeoutId);
      };
    }
  }, [visible, alert]);

  if (!alert) return null;

  const severity = alert.severity || 'MEDIUM';
  const severityLabel = SEVERITY_LABELS[severity]?.[language] || SEVERITY_LABELS.MEDIUM[language];
  const metricInfo = METRIC_LABELS[alert.metric] || { es: alert.metric, en: alert.metric, unit: '' };
  const metricLabel = metricInfo[language];
  const reasons = FALSE_ALARM_REASONS[language] || FALSE_ALARM_REASONS.es;

  const handleFalseAlarm = async () => {
    const reason = selectedReason === reasons.length - 1
      ? customReason.trim()
      : reasons[selectedReason];

    if (!reason) {
      Alert.alert(
        language === 'en' ? 'Required' : 'Requerido',
        language === 'en' ? 'Select or write a reason.' : 'Selecciona o escribe un motivo.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await onRespond(alert.id, 'false_alarm', reason);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNeedHelp = async () => {
    setIsSubmitting(true);
    try {
      await onRespond(alert.id, 'need_help', null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={false}
      statusBarTranslucent
      onRequestClose={() => {}} // Block hardware back
    >
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 30 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}
          >
            <View style={{ flexGrow: 1 }}>
              {/* Severity Badge */}
              <Animated.View style={[styles.severityBadge, { transform: [{ scale: pulseAnim }] }]}>
                <Text style={styles.severityText}>{severityLabel}</Text>
              </Animated.View>

              {/* Title */}
              <Text style={styles.title}>{alert.title}</Text>

              {/* Metric & Value */}
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>{metricLabel}</Text>
                <Text style={styles.metricValue}>
                  {alert.current_value} {metricInfo.unit}
                </Text>
                <View style={styles.metricDivider} />
                <View style={styles.metricRow}>
                  <Text style={styles.metricDetail}>
                    {language === 'en' ? 'Baseline' : 'Referencia'}: {alert.baseline_value} {metricInfo.unit}
                  </Text>
                  <Text style={styles.metricDetail}>
                    {language === 'en' ? 'Change' : 'Cambio'}: {alert.delta > 0 ? '+' : ''}{alert.delta} {metricInfo.unit}
                  </Text>
                </View>
              </View>

              {/* Message */}
              <Text style={styles.message}>{alert.message}</Text>

              {/* Recommendation */}
              <View style={styles.recommendationBox}>
                <Text style={styles.recommendationLabel}>
                  {language === 'en' ? 'RECOMMENDATION' : 'RECOMENDACION'}
                </Text>
                <Text style={styles.recommendationText}>{alert.recommendation}</Text>
              </View>
            </View>

            {/* Footer Area */}
            <View style={styles.footerContainerInside}>
              {/* False Alarm Form */}
              {showFalseAlarmForm ? (
                <View style={styles.falseAlarmForm}>
                  <Text style={styles.falseAlarmTitle}>
                    {language === 'en' ? 'Reason for dismissal:' : 'Motivo del descarte:'}
                  </Text>
                  {reasons.map((reason, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.reasonButton,
                        selectedReason === idx && styles.reasonButtonSelected,
                      ]}
                      onPress={() => setSelectedReason(idx)}
                    >
                      <View style={[
                        styles.radioOuter,
                        selectedReason === idx && styles.radioOuterSelected,
                      ]}>
                        {selectedReason === idx && <View style={styles.radioInner} />}
                      </View>
                      <Text style={[
                        styles.reasonText,
                        selectedReason === idx && styles.reasonTextSelected,
                      ]}>
                        {reason}
                      </Text>
                    </TouchableOpacity>
                  ))}

                  {/* Custom reason input */}
                  {selectedReason === reasons.length - 1 && (
                    <TextInput
                      style={styles.customInput}
                      value={customReason}
                      onChangeText={setCustomReason}
                      placeholder={language === 'en' ? 'Describe the reason...' : 'Describe el motivo...'}
                      placeholderTextColor="#FFFFFF66"
                      multiline
                      maxLength={200}
                    />
                  )}

                  <View style={styles.falseAlarmActions}>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => {
                        setShowFalseAlarmForm(false);
                        setSelectedReason(null);
                      }}
                    >
                      <Text style={styles.cancelBtnText}>
                        {language === 'en' ? 'Back' : 'Volver'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.confirmDismissBtn, isSubmitting && styles.btnDisabled]}
                      onPress={handleFalseAlarm}
                      disabled={isSubmitting || selectedReason === null}
                    >
                      <Text style={styles.confirmDismissText}>
                        {isSubmitting
                          ? (language === 'en' ? 'Sending...' : 'Enviando...')
                          : (language === 'en' ? 'Confirm Dismissal' : 'Confirmar Descarte')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                /* Main Action Buttons */
                <View style={styles.actionsContainer}>
                  <TouchableOpacity
                    style={[styles.helpBtn, isSubmitting && styles.btnDisabled]}
                    onPress={handleNeedHelp}
                    disabled={isSubmitting}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.helpBtnText}>
                      {isSubmitting
                        ? (language === 'en' ? 'ACTIVATING...' : 'ACTIVANDO...')
                        : (language === 'en' ? 'I NEED HELP NOW' : 'NECESITO AYUDA AHORA')}
                    </Text>
                    <Text style={styles.helpBtnSubtext}>
                      {language === 'en'
                        ? 'Notifies your emergency contacts'
                        : 'Notifica a tus contactos de emergencia'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.falseAlarmBtn}
                    onPress={() => setShowFalseAlarmForm(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.falseAlarmBtnText}>
                      {language === 'en'
                        ? 'Dismiss: False alarm or Error'
                        : 'Descartar: Falsa alarma o Error'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#7F1D1D', // Dark red
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
  },
  footerContainerInside: {
    paddingTop: 8,
  },

  // Severity Badge
  severityBadge: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF20',
    borderWidth: 2,
    borderColor: '#FFFFFF50',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 10,
    marginBottom: 24,
  },
  severityText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 4,
    textAlign: 'center',
  },

  // Title
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 28,
  },

  // Metric Card
  metricCard: {
    backgroundColor: '#FFFFFF15',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FFFFFF20',
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF99',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 42,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  metricDivider: {
    height: 1,
    backgroundColor: '#FFFFFF20',
    marginBottom: 12,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricDetail: {
    fontSize: 12,
    color: '#FFFFFF99',
    fontWeight: '600',
  },

  // Message
  message: {
    fontSize: 15,
    color: '#FFFFFFCC',
    lineHeight: 22,
    marginBottom: 16,
    textAlign: 'center',
  },

  // Recommendation
  recommendationBox: {
    backgroundColor: '#FFFFFF10',
    borderRadius: 12,
    padding: 16,
    marginBottom: 28,
    borderLeftWidth: 4,
    borderLeftColor: '#FFFFFF40',
  },
  recommendationLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF80',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  recommendationText: {
    fontSize: 14,
    color: '#FFFFFFDD',
    lineHeight: 20,
  },

  // Action Buttons
  actionsContainer: {
    gap: 14,
    paddingTop: 8,
  },
  helpBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  helpBtnText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#7F1D1D',
    letterSpacing: 1,
  },
  helpBtnSubtext: {
    fontSize: 12,
    color: '#991B1B',
    marginTop: 4,
    fontWeight: '600',
  },
  falseAlarmBtn: {
    backgroundColor: '#FFFFFF15',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF30',
  },
  falseAlarmBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // False Alarm Form
  falseAlarmForm: {
    backgroundColor: '#FFFFFF10',
    borderRadius: 16,
    padding: 20,
  },
  falseAlarmTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  reasonButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#FFFFFF08',
    borderWidth: 1,
    borderColor: '#FFFFFF15',
  },
  reasonButtonSelected: {
    backgroundColor: '#FFFFFF20',
    borderColor: '#FFFFFF50',
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#FFFFFF50',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioOuterSelected: {
    borderColor: '#FFFFFF',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
  reasonText: {
    fontSize: 14,
    color: '#FFFFFFCC',
    fontWeight: '600',
    flex: 1,
  },
  reasonTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  customInput: {
    backgroundColor: '#FFFFFF15',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#FFFFFF',
    marginTop: 8,
    minHeight: 60,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#FFFFFF20',
  },
  falseAlarmActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF30',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  confirmDismissBtn: {
    flex: 2,
    backgroundColor: '#FFFFFF20',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF40',
  },
  confirmDismissText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
