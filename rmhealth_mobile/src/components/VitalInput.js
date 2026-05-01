/**
 * VitalInput — Reusable medical vital sign input with color-coded clinical validation.
 *
 * Changes color based on clinical ranges + measurement context:
 * 🟢 Normal → green border
 * 🟡 Warning → amber border + "Fuera de rango" label
 * 🔴 Critical → red border + "⚠️ Consulta médica" label
 *
 * Context-dependent thresholds:
 * - "reposo": standard AHA/WHO/ADA ranges
 * - "ejercicio": HR normal up to 160 bpm, systolic up to 170 mmHg
 * - "comida": glucose up to 140 mg/dL normal (vs 100 fasting)
 * - others: standard ranges
 *
 * © 2025 MORALES ZEPEDA RAUL | Registro INDAUTOR: 03-2025-070109072500-01
 */

import React, { useMemo } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { COLORS } from '../theme';

// Clinical reference ranges (AHA/WHO/ADA) — default: "reposo"
const CLINICAL_RANGES = {
  heartRate: {
    normal: [60, 100],
    warning: [40, 150],
    unit: 'bpm',
  },
  spo2: {
    normal: [95, 100],
    warning: [90, 100],
    unit: '%',
  },
  systolic: {
    normal: [90, 139],
    warning: [70, 180],
    unit: 'mmHg',
  },
  diastolic: {
    normal: [60, 80],      // AHA: diastólica > 80 = Stage 1 — alineado con medical_engine.py
    warning: [40, 110],
    unit: 'mmHg',
  },
  glucose: {
    normal: [70, 100],
    warning: [54, 126],
    unit: 'mg/dL',
  },
  temperature: {
    normal: [36.0, 37.5],
    warning: [35.0, 39.0],
    unit: '°C',
  },
};

// Context-specific range overrides
// NOTE: When CardioWave smartwatch is connected, the context will be
// auto-detected from accelerometer + HR sensors without user intervention.
// Until then, the user selects context manually via the pill selector.
const CONTEXT_OVERRIDES = {
  ejercicio: {
    heartRate: { normal: [60, 160], warning: [40, 180] },
    systolic: { normal: [90, 160], warning: [70, 185] },
    diastolic: { normal: [60, 90], warning: [40, 100] },
  },
  comida: {
    glucose: { normal: [70, 140], warning: [54, 180] },
  },
  // reposo, dormir, despertar, otro → use standard ranges
};

const STATUS_COLORS = {
  normal: '#10B981',   // Green
  warning: '#F59E0B',  // Amber
  critical: '#EF4444', // Red
  idle: COLORS.border || '#E2E8F0',
};

/**
 * Resolve the effective clinical range for a metric + context.
 */
function getRange(rangeKey, context) {
  const base = CLINICAL_RANGES[rangeKey];
  if (!base) return null;

  const overrides = CONTEXT_OVERRIDES[context];
  if (overrides && overrides[rangeKey]) {
    return { ...base, ...overrides[rangeKey] };
  }
  return base;
}

/**
 * Determine clinical status from a numeric value, range config, and context.
 */
function getStatus(value, rangeKey, context) {
  if (!value || value === '' || !rangeKey) return 'idle';
  const num = parseFloat(value);
  if (isNaN(num)) return 'idle';

  const range = getRange(rangeKey, context);
  if (!range) return 'idle';

  const [nMin, nMax] = range.normal;
  const [wMin, wMax] = range.warning;

  if (num >= nMin && num <= nMax) return 'normal';
  if (num >= wMin && num <= wMax) return 'warning';
  return 'critical';
}

function getStatusLabel(status, language = 'es') {
  if (status === 'idle') return null;
  const labels = {
    normal: { es: 'Normal', en: 'Normal' },
    warning: { es: 'Fuera de rango', en: 'Out of range' },
    critical: {
      es: 'Critico - Consulta medica recomendada',
      en: 'Critical - Medical consultation recommended',
    },
  };
  return labels[status]?.[language] || labels[status]?.es;
}

/**
 * VitalInput Component
 *
 * @param {string} label - Display label (e.g. "Frecuencia cardíaca")
 * @param {string} value - Current value
 * @param {function} onChange - Setter
 * @param {string} placeholder - Placeholder
 * @param {string} icon - Emoji icon
 * @param {string} rangeKey - Key into CLINICAL_RANGES
 * @param {string} context - Measurement context (reposo, ejercicio, comida, etc.)
 * @param {boolean} decimal - Allow decimal input
 * @param {string} language - 'es' or 'en'
 * @param {string} accessibilityLabel - Custom accessibility label
 * @param {string} accessibilityHint - Custom accessibility hint
 */
export function VitalInput({
  label,
  value,
  onChange,
  placeholder,
  icon,
  IconComponent,
  iconColor = '#1B7A6E',
  rangeKey,
  context = 'reposo',
  decimal = false,
  language = 'es',
  accessibilityLabel,
  accessibilityHint,
}) {
  const status = useMemo(() => getStatus(value, rangeKey, context), [value, rangeKey, context]);
  const statusLabel = useMemo(() => getStatusLabel(status, language), [status, language]);
  const borderColor = STATUS_COLORS[status];

  const defaultA11yLabel = `${label}, ${placeholder ? `ejemplo ${placeholder}` : ''}`;
  const defaultA11yHint = language === 'es'
    ? `Ingresa el valor de ${label.toLowerCase()}`
    : `Enter the value for ${label.toLowerCase()}`;

  return (
    <View style={s.container}>
      <View style={s.labelRow}>
        {IconComponent && <IconComponent size={14} color={iconColor} strokeWidth={2.5} style={{ marginRight: 4 }} />}
        {!IconComponent && icon && <Text style={s.labelIcon}>{icon} </Text>}
        <Text style={s.label}>{label}</Text>
      </View>
      <TextInput
        style={[s.input, { borderColor }]}
        keyboardType={decimal ? 'decimal-pad' : 'numeric'}
        placeholder={placeholder}
        placeholderTextColor="#B0BEC5"
        value={value}
        onChangeText={onChange}
        maxLength={decimal ? 5 : 3}
        accessibilityLabel={accessibilityLabel || defaultA11yLabel}
        accessibilityHint={accessibilityHint || defaultA11yHint}
        accessibilityRole="none"
      />
      {statusLabel && (
        <Text style={[s.statusText, { color: STATUS_COLORS[status] }]}>
          {statusLabel}
        </Text>
      )}
    </View>
  );
}

export { CLINICAL_RANGES, CONTEXT_OVERRIDES, getStatus, getStatusLabel, getRange };

const s = StyleSheet.create({
  container: {
    flex: 1,
    marginHorizontal: 4,
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  labelIcon: {
    fontSize: 12,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
    textAlign: 'center',
  },
});
