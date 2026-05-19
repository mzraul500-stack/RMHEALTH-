import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../theme';
import { AlertTriangle } from 'lucide-react-native';

// ============================================================
// LOCALIZATION HELPERS — Spanish translations for CJM data
// ============================================================

/** Translate severity values from backend (English) → Spanish */
const localizeSeverity = (severity, isEn) => {
  if (isEn || !severity) return severity || '--';
  const map = {
    NORMAL:   'Normal',
    LOW:      'Bajo',
    MEDIUM:   'Medio',
    HIGH:     'Alto',
    CRITICAL: 'Crítico',
  };
  return map[severity] || severity;
};

/** Translate escalation_action values from backend → Spanish */
const localizeAction = (action, isEn) => {
  if (isEn || !action) return action || '--';
  const map = {
    NONE:                     'Ninguna',
    MONITOR:                  'Monitorear',
    NOTIFY_CONTACT:           'Notificar contacto',
    REQUEST_CONFIRMATION:     'Solicitar confirmación',
    ESCALATE_IF_CONFIRMED:    'Escalar si se confirma',
    AUTO_ESCALATION_CANDIDATE:'Candidato a autoescalación',
  };
  return map[action] || action;
};

/** Translate the preventive_observation text → Spanish.
 *  Uses pattern-matching for known backend phrases.
 *  Unknown text passes through unchanged. */
const localizeObservation = (text, isEn) => {
  if (isEn || !text) return text;
  const t = String(text).trim();

  // ── Known full observations ──
  if (t.includes('No relevant risk pattern detected')) {
    return 'No se detectó un patrón preventivo relevante con los datos disponibles. Continúa con el monitoreo rutinario. Esto no es un diagnóstico.';
  }
  if (t.includes('Critical preventive observation')) {
    return 'Observación preventiva crítica: se detectó un patrón de alta prioridad. Se recomienda confirmar la situación y seguir el flujo de aviso configurado.';
  }
  if (t.includes('High preventive observation')) {
    return 'Observación preventiva alta: se detectaron patrones relevantes. Se recomienda solicitar confirmación del usuario y mantener monitoreo cercano.';
  }
  if (t.includes('Medium preventive observation')) {
    return 'Observación preventiva media: se detectaron patrones anormales o de contexto. Puede ser apropiado aumentar el monitoreo.';
  }
  if (t.includes('Low preventive observation')) {
    return 'Observación preventiva baja: se detectaron desviaciones leves. Continúa monitoreando y compara con tu línea base.';
  }

  // ── Strip trailing English disclaimer if present ──
  return t
    .replace(/\s*This is not a diagnosis\.\s*/gi, ' Esto no es un diagnóstico. ')
    .replace(/\s*Score:\s*[\d.]+\/100\.\s*/gi, ' ')
    .trim();
};

/** Translate risk factor labels from backend → Spanish */
const localizeFactorLabel = (label, isEn) => {
  if (isEn || !label) return label;
  const map = {
    'No relevant risk pattern':                                                   'Sin patrón preventivo relevante',
    'Markedly elevated heart rate pattern':                                        'Patrón de frecuencia cardíaca marcadamente elevada',
    'Elevated heart rate pattern':                                                 'Patrón de frecuencia cardíaca elevada',
    'Low oxygen saturation pattern':                                               'Patrón de saturación de oxígeno baja',
    'Very low oxygen saturation pattern':                                          'Patrón de saturación de oxígeno muy baja',
    'Elevated blood pressure pattern':                                             'Patrón de presión arterial elevada',
    'Low blood pressure pattern':                                                  'Patrón de presión arterial baja',
    'Combined low heart rate, low oxygen saturation and low blood pressure pattern':'Patrón combinado de frecuencia cardíaca baja, oxígeno bajo y presión arterial baja',
    'Fall signal with no movement reported afterward':                             'Señal de caída sin movimiento reportado posteriormente',
    'Elevated glucose pattern':                                                    'Patrón de glucosa elevada',
    'Low glucose pattern':                                                         'Patrón de glucosa baja',
    'Elevated temperature pattern':                                                'Patrón de temperatura elevada',
    'Low temperature pattern':                                                     'Patrón de temperatura baja',
  };
  return map[label] || label;
};

/**
 * ContextualAnalysisCard — Displays CJM contextual_analysis from the backend.
 *
 * RULES:
 *   - If data is null/undefined → renders nothing.
 *   - If data.available === false → renders nothing (caller should log).
 *   - Does NOT override MedicalEngine severity.
 *   - Always shows non-diagnostic disclaimer.
 *
 * Props:
 *   @param {object|null} data        — contextual_analysis from API response
 *   @param {string}      language    — 'en' | 'es'
 */
export const ContextualAnalysisCard = ({ data, language }) => {
  // Guard: absent or explicitly unavailable → render nothing
  if (!data || data.available === false) return null;

  // Guard: must have at minimum a preventive_observation
  if (!data.preventive_observation && !data.risk_factors?.length) return null;

  const isEn = language === 'en';

  // ── Severity accent color (subtle, not alarming) ──
  const SEVERITY_COLOR = {
    LOW:      '#10B981',
    MEDIUM:   '#F59E0B',
    HIGH:     '#F97316',
    CRITICAL: '#EF4444',
  };
  const accentColor = SEVERITY_COLOR[data.severity] || '#94A3B8';

  // ── Top 3 risk factor labels ──
  const topFactors = (data.risk_factors || [])
    .filter(f => f && f.label)
    .slice(0, 3);

  // ── Score display ──
  const scoreDisplay = data.risk_score != null
    ? `${Number(data.risk_score).toFixed(0)}/100`
    : '--';

  // ── Confidence display ──
  const confidenceDisplay = data.confidence != null
    ? `${(data.confidence * 100).toFixed(0)}%`
    : null;

  return (
    <View style={styles.card}>
      {/* ── Header ── */}
      <View style={styles.headerRow}>
        <View style={[styles.iconWrap, { backgroundColor: accentColor + '18' }]}>
          <AlertTriangle size={16} color={accentColor} strokeWidth={2.5} />
        </View>
        <Text style={styles.title}>
          {isEn ? 'Preventive Context' : 'Contexto Preventivo'}
        </Text>
        <View style={[styles.severityPill, { backgroundColor: accentColor + '18', borderColor: accentColor }]}>
          <Text style={[styles.severityText, { color: accentColor }]}>
            {localizeSeverity(data.severity, isEn)}
          </Text>
        </View>
      </View>

      {/* ── Score + Confidence Row ── */}
      <View style={styles.metricsRow}>
        <View style={styles.metricBlock}>
          <Text style={styles.metricLabel}>
            {isEn ? 'Risk Score' : 'Score de Riesgo'}
          </Text>
          <Text style={[styles.metricValue, { color: accentColor }]}>
            {scoreDisplay}
          </Text>
        </View>
        {confidenceDisplay && (
          <View style={styles.metricBlock}>
            <Text style={styles.metricLabel}>
              {isEn ? 'Confidence' : 'Confianza'}
            </Text>
            <Text style={styles.metricValue}>
              {confidenceDisplay}
            </Text>
          </View>
        )}
        <View style={styles.metricBlock}>
          <Text style={styles.metricLabel}>
            {isEn ? 'Action' : 'Acción'}
          </Text>
          <Text style={styles.metricValue}>
            {localizeAction(data.escalation_action, isEn)}
          </Text>
        </View>
      </View>

      {/* ── Preventive Observation ── */}
      {data.preventive_observation && (
        <View style={styles.observationBox}>
          <Text style={styles.observationText}>
            {localizeObservation(data.preventive_observation, isEn)}
          </Text>
        </View>
      )}

      {/* ── Top Risk Factors ── */}
      {topFactors.length > 0 && (
        <View style={styles.factorsBox}>
          <Text style={styles.factorsLabel}>
            {isEn ? 'Key Patterns' : 'Patrones Clave'}
          </Text>
          {topFactors.map((f, i) => (
            <View key={f.rule_id || i} style={styles.factorRow}>
              <View style={[styles.factorDot, { backgroundColor: accentColor }]} />
              <Text style={styles.factorText}>
                {localizeFactorLabel(f.label, isEn)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Engine badge ── */}
      <Text style={styles.engineBadge}>
        {data.engine || 'CriticalJudgmentModule'} · {data.version || 'CJM'}
      </Text>

      {/* ── Non-diagnostic disclaimer (MANDATORY) ── */}
      <View style={styles.disclaimerBox}>
        <Text style={styles.disclaimerText}>
          {isEn
            ? 'This is not a diagnosis. Preventive observation only.'
            : 'Esto no es un diagnóstico. Solo observación preventiva.'}
        </Text>
      </View>
    </View>
  );
};


// ============================================================
// STYLES — Matches Samsung Health inspired card system
// ============================================================
const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F0FDFA',
    marginTop: 12,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#0D9488' + '30',
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  severityPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  severityText: {
    fontSize: 11,
    fontWeight: '900',
  },

  // Metrics
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  metricBlock: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.secondary,
  },

  // Observation
  observationBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  observationText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    lineHeight: 18,
  },

  // Factors
  factorsBox: {
    marginBottom: 8,
  },
  factorsLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 6,
  },
  factorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  factorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  factorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    flex: 1,
  },

  // Engine badge
  engineBadge: {
    fontSize: 9,
    color: '#94A3B8',
    textAlign: 'center',
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 6,
  },

  // Disclaimer
  disclaimerBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  disclaimerText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#92400E',
    textAlign: 'center',
  },
});
