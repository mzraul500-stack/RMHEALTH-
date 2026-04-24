import AsyncStorage from '@react-native-async-storage/async-storage';
import FAQ from '../data/health_faq.json';

const DISCLAIMER_ES = '\n\n💡 Esta información refleja patrones en tus datos. Consulta a tu médico para cualquier decisión sobre tu salud.';
const DISCLAIMER_EN = '\n\n💡 This information reflects patterns in your data. Consult your doctor for any health decisions.';

/**
 * LocalWellnessEngine — Phase 1 AI assistant.
 * Runs 100% on-device. No internet required.
 * 
 * Capabilities:
 * 1. FAQ matching (keyword-based)
 * 2. History summarization (reads AsyncStorage)
 * 3. Medication adherence summary
 */
export class LocalWellnessEngine {

  /**
   * Process a user message and return a response.
   * @param {string} message - User's question
   * @param {string} lang - 'es' or 'en'
   * @returns {Promise<string>} - Assistant response
   */
  static async processMessage(message, lang = 'es') {
    const input = message.toLowerCase().trim();
    const disclaimer = lang === 'en' ? DISCLAIMER_EN : DISCLAIMER_ES;

    // 1. Check for summary requests
    if (this._matchesIntent(input, ['resumen', 'resúmeme', 'summary', 'semana', 'week', 'como estoy', 'how am i', 'informe', 'reporte', 'report', 'datos', 'estadisticas', 'estadísticas', 'stats', 'mis datos', 'my data', 'como voy', 'mi salud', 'my health', 'historial', 'resúmeme mi', 'dame mi'])) {
      return await this._generateSummary(lang) + disclaimer;
    }

    // 2. Check for medication questions
    if (this._matchesIntent(input, ['tomé', 'tome', 'adherencia', 'adherence', 'cuantas pastillas', 'did i take', 'medication log'])) {
      return await this._generateMedSummary(lang) + disclaimer;
    }

    // 3. FAQ matching
    const faqResponse = this._matchFAQ(input, lang);
    if (faqResponse) {
      return faqResponse + disclaimer;
    }

    // 4. Greeting
    if (this._matchesIntent(input, ['hola', 'hello', 'hi', 'hey', 'buenos', 'buenas', 'good morning', 'good night'])) {
      return lang === 'en'
        ? '👋 Hello! I\'m your wellness coach. You can ask me about your health metrics, medications, or say "summary" to see your weekly report.'
        : '👋 ¡Hola! Soy tu coach de bienestar. Puedes preguntarme sobre tus métricas de salud, medicamentos, o escribe "resumen" para ver tu reporte semanal.';
    }

    // 5. Default fallback
    return lang === 'en'
      ? '🤔 I\'m not sure I understand. Try asking about:\n\n• Blood pressure\n• Heart rate\n• Glucose\n• Oxygen\n• Temperature\n• Medications\n• "Summary" for your weekly report\n\nOr ask "How does the app work?"' + disclaimer
      : '🤔 No estoy seguro de entender. Intenta preguntar sobre:\n\n• Presión arterial\n• Frecuencia cardíaca\n• Glucosa\n• Oxígeno\n• Temperatura\n• Medicamentos\n• "Resumen" para tu reporte semanal\n\nO pregunta "¿Cómo funciona la app?"' + disclaimer;
  }

  // ── FAQ MATCHING ──
  static _matchFAQ(input, lang) {
    const categories = FAQ.categories;
    let bestMatch = null;
    let bestScore = 0;

    for (const [_, category] of Object.entries(categories)) {
      let score = 0;
      for (const kw of category.keywords) {
        if (input.includes(kw.toLowerCase())) {
          score += kw.length; // Longer matches = more specific
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = category;
      }
    }

    if (bestMatch && bestScore >= 3) {
      return lang === 'en' ? bestMatch.response_en : bestMatch.response_es;
    }
    return null;
  }

  // ── HISTORY SUMMARY ──
  static async _generateSummary(lang) {
    try {
      const raw = await AsyncStorage.getItem('@rmhealth_vitals_history');
      if (!raw) {
        return lang === 'en'
          ? '📊 No records yet. Start by entering your health metrics on the home screen.'
          : '📊 Aún no hay registros. Comienza ingresando tus métricas en la pantalla principal.';
      }

      const records = JSON.parse(raw);
      const now = new Date();
      const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const recent = records.filter(r => new Date(r.timestamp) >= weekAgo);

      if (recent.length === 0) {
        return lang === 'en'
          ? '📊 No records in the last 7 days. Try to record your metrics daily for better pattern detection.'
          : '📊 No hay registros en los últimos 7 días. Intenta registrar tus métricas diariamente para mejor detección de patrones.';
      }

      // Calculate averages
      const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(0) : '--';
      
      const hrs = recent.map(r => r.vitals?.hr).filter(Boolean);
      const sys = recent.map(r => r.vitals?.sys).filter(Boolean);
      const dia = recent.map(r => r.vitals?.dia).filter(Boolean);
      const glu = recent.map(r => r.vitals?.glucose).filter(Boolean);
      const spo = recent.map(r => r.vitals?.spo2).filter(Boolean);
      const anomalies = recent.filter(r => r.tipo_emergencia && r.tipo_emergencia !== 'NORMAL');

      if (lang === 'en') {
        return `📊 **Your 7-Day Wellness Summary**\n\n` +
          `📅 Records: ${recent.length}\n` +
          `❤️ Avg Heart Rate: ${avg(hrs)} bpm\n` +
          `🩸 Avg Blood Pressure: ${avg(sys)}/${avg(dia)} mmHg\n` +
          `🍬 Avg Glucose: ${avg(glu)} mg/dL\n` +
          `🫁 Avg SpO2: ${avg(spo)}%\n` +
          `⚠️ Unusual patterns: ${anomalies.length}\n\n` +
          (anomalies.length > 0
            ? `You had ${anomalies.length} record(s) with metrics outside the usual range. Check your History for details.`
            : `All your metrics have been within the usual range. Keep it up! 💪`);
      }

      return `📊 **Tu Resumen de Bienestar (7 días)**\n\n` +
        `📅 Registros: ${recent.length}\n` +
        `❤️ Pulso promedio: ${avg(hrs)} bpm\n` +
        `🩸 Presión promedio: ${avg(sys)}/${avg(dia)} mmHg\n` +
        `🍬 Glucosa promedio: ${avg(glu)} mg/dL\n` +
        `🫁 SpO2 promedio: ${avg(spo)}%\n` +
        `⚠️ Patrones inusuales: ${anomalies.length}\n\n` +
        (anomalies.length > 0
          ? `Tuviste ${anomalies.length} registro(s) con métricas fuera del rango habitual. Revisa tu Historial para más detalles.`
          : `Todas tus métricas han estado dentro del rango habitual. ¡Sigue así! 💪`);
    } catch (e) {
      return lang === 'en'
        ? '⚠️ Could not read your history. Try again later.'
        : '⚠️ No se pudo leer tu historial. Intenta de nuevo.';
    }
  }

  // ── MEDICATION SUMMARY ──
  static async _generateMedSummary(lang) {
    try {
      const raw = await AsyncStorage.getItem('@rmhealth/medications');
      if (!raw) {
        return lang === 'en'
          ? '💊 No medications registered. Add your medications in the Medications tab.'
          : '💊 No hay medicamentos registrados. Agrega tus medicamentos en la pestaña Medicinas.';
      }

      const meds = JSON.parse(raw);
      const today = new Date().toISOString().split('T')[0];
      let taken = 0;
      let total = meds.length;

      for (const med of meds) {
        const logKey = `@rmhealth/dose_log_${med.id}`;
        const logRaw = await AsyncStorage.getItem(logKey);
        if (logRaw) {
          const log = JSON.parse(logRaw);
          if (log[today]) taken++;
        }
      }

      if (lang === 'en') {
        return `💊 **Medication Status Today**\n\n` +
          `✅ Taken: ${taken}/${total}\n` +
          `📊 Adherence: ${total > 0 ? ((taken / total) * 100).toFixed(0) : 0}%\n\n` +
          (taken === total
            ? `Great job! All medications taken today. 🎉`
            : `You still have ${total - taken} medication(s) pending today.`);
      }

      return `💊 **Estado de Medicamentos Hoy**\n\n` +
        `✅ Tomados: ${taken}/${total}\n` +
        `📊 Adherencia: ${total > 0 ? ((taken / total) * 100).toFixed(0) : 0}%\n\n` +
        (taken === total
          ? `¡Excelente! Todos los medicamentos tomados hoy. 🎉`
          : `Aún tienes ${total - taken} medicamento(s) pendiente(s) hoy.`);
    } catch (e) {
      return lang === 'en'
        ? '⚠️ Could not read medication data.'
        : '⚠️ No se pudo leer los datos de medicamentos.';
    }
  }

  // ── INTENT MATCHING ──
  static _matchesIntent(input, keywords) {
    return keywords.some(kw => input.includes(kw));
  }
}
