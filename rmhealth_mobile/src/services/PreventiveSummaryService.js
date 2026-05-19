/**
 * PreventiveSummaryService — Structured preventive context for Gemini
 * Phase 6: Provides safe, non-diagnostic data summary for AssistantScreen
 *
 * SAFETY RULES:
 * - NO diagnosis, NO medical recommendations
 * - Data is INFORMATIONAL ONLY
 * - Labels all output as "preventive wellness monitoring"
 * - Never includes raw patient identifiers
 *
 * © 2025 MORALES ZEPEDA RAUL | Registro INDAUTOR: 03-2025-070109072500-01
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  SLEEP: '@rmhealth/sleep_history_v1',
  MEDICATIONS: '@rmhealth/medications',
  DOSE_LOG: '@rmhealth/dose_log',
};

/**
 * Build a structured preventive summary object for Gemini context injection.
 * @param {Object} vitals - Current Health Connect vitals { heartRate, spo2, systolic, diastolic }
 * @returns {Object} Structured summary safe for AI context
 */
export async function buildPreventiveSummary(vitals = {}) {
  const summary = {
    _disclaimer: 'Este resumen es solo informativo y preventivo. No constituye diagnóstico médico.',
    _source: 'RMHealth preventive wellness monitoring',
    _generatedAt: new Date().toISOString(),
    currentVitals: {},
    sleepSummary: {},
    medicationSummary: {},
  };

  // ── Current Vitals ──
  if (vitals.heartRate) summary.currentVitals.frecuenciaCardiaca = `${vitals.heartRate} bpm`;
  if (vitals.spo2) summary.currentVitals.saturacionOxigeno = `${vitals.spo2}%`;
  if (vitals.systolic && vitals.diastolic) {
    summary.currentVitals.presionArterial = `${vitals.systolic}/${vitals.diastolic} mmHg`;
  }
  if (Object.keys(summary.currentVitals).length === 0) {
    summary.currentVitals.estado = 'Sin datos de signos vitales disponibles';
  }

  // ── Sleep Summary (last 7 days) ──
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.SLEEP);
    const history = raw ? JSON.parse(raw) : [];
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const recentSleep = history.filter(s => {
      const d = new Date(s.date || s.startTime);
      return d >= weekAgo && d <= now;
    });

    if (recentSleep.length > 0) {
      const totalMin = recentSleep.reduce((acc, s) => acc + (s.totalMinutes || 0), 0);
      const avgMin = Math.round(totalMin / recentSleep.length);
      summary.sleepSummary = {
        sesionesUltimos7Dias: recentSleep.length,
        promedioMinutosPorNoche: avgMin,
        promedioHorasPorNoche: (avgMin / 60).toFixed(1),
      };
    } else {
      summary.sleepSummary.estado = 'Sin datos de sueño en los últimos 7 días';
    }
  } catch (e) {
    summary.sleepSummary.estado = 'Error al leer historial de sueño';
  }

  // ── Medication Summary ──
  try {
    const medsRaw = await AsyncStorage.getItem(STORAGE_KEYS.MEDICATIONS);
    const doseRaw = await AsyncStorage.getItem(STORAGE_KEYS.DOSE_LOG);
    const meds = medsRaw ? JSON.parse(medsRaw) : [];
    const doses = doseRaw ? JSON.parse(doseRaw) : {};

    const activeMeds = meds.filter(m => m.active !== false);
    summary.medicationSummary.medicamentosActivos = activeMeds.length;

    // Calculate adherence for last 7 days
    const now = new Date();
    let totalExpected = 0;
    let totalTaken = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      const dayDoses = doses[dateKey] || [];
      totalExpected += activeMeds.length; // simplified: 1 expected per med per day
      totalTaken += dayDoses.filter(d => d.taken).length;
    }

    if (totalExpected > 0) {
      summary.medicationSummary.adherencia7Dias = `${Math.round((totalTaken / totalExpected) * 100)}%`;
    }

    if (activeMeds.length > 0) {
      summary.medicationSummary.listaMedicamentos = activeMeds.map(m => m.name).join(', ');
    }
  } catch (e) {
    summary.medicationSummary.estado = 'Error al leer medicamentos';
  }

  return summary;
}

/**
 * Format the summary as a context string for Gemini prompt injection.
 * @param {Object} summary - Output from buildPreventiveSummary()
 * @returns {string} Formatted context string
 */
export function formatSummaryForGemini(summary) {
  const lines = [
    '--- CONTEXTO PREVENTIVO RMHEALTH (Solo informativo, NO diagnóstico) ---',
    `Generado: ${summary._generatedAt}`,
    '',
    '▸ Signos Vitales Actuales:',
  ];

  const v = summary.currentVitals;
  if (v.frecuenciaCardiaca) lines.push(`  FC: ${v.frecuenciaCardiaca}`);
  if (v.saturacionOxigeno) lines.push(`  SpO2: ${v.saturacionOxigeno}`);
  if (v.presionArterial) lines.push(`  PA: ${v.presionArterial}`);
  if (v.estado) lines.push(`  ${v.estado}`);

  lines.push('', '▸ Resumen de Sueño (7 días):');
  const sl = summary.sleepSummary;
  if (sl.sesionesUltimos7Dias) {
    lines.push(`  Sesiones: ${sl.sesionesUltimos7Dias}`);
    lines.push(`  Promedio: ${sl.promedioHorasPorNoche}h por noche`);
  } else {
    lines.push(`  ${sl.estado || 'Sin datos'}`);
  }

  lines.push('', '▸ Medicamentos:');
  const med = summary.medicationSummary;
  lines.push(`  Activos: ${med.medicamentosActivos || 0}`);
  if (med.adherencia7Dias) lines.push(`  Adherencia 7d: ${med.adherencia7Dias}`);
  if (med.listaMedicamentos) lines.push(`  Lista: ${med.listaMedicamentos}`);
  if (med.estado) lines.push(`  ${med.estado}`);

  lines.push('', '--- FIN CONTEXTO PREVENTIVO ---');
  return lines.join('\n');
}
