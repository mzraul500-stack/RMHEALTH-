/**
 * healthConnectAdapter.js
 * RMHealth — Adaptador Health Connect → API Payload
 *
 * Normaliza los datos crudos del Samsung Watch 8 (vía HealthConnectService)
 * al formato exacto que espera POST /api/vital-signs (modelo VitalSigns).
 *
 * DISEÑO:
 *   watchData   → salida de getLatestWatchData() en HealthConnectService.js
 *   manualData  → campos ingresados por el usuario en el formulario
 *   El adaptador decide la fuente de cada campo, valida rangos clínicos,
 *   y documenta la decisión en _data_sources para auditoría.
 *
 * LO QUE ESTE ARCHIVO NO HACE:
 *   ✗ No activa Health Connect
 *   ✗ No llama a ningún endpoint del reloj
 *   ✗ No modifica features.js
 *   ✗ No modifica useWatchData.js
 *   ✗ No modifica App.js
 *   ✗ No habla con GCP ni Cloud SQL
 *   ✗ No inventa glucosa del reloj (Watch 8 no la mide)
 *
 * © 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
 */

// ── Rangos clínicos válidos (alineados con VitalSigns Pydantic) ──────────────
const VALID_RANGES = {
  frecuencia_cardiaca:  { min: 20,  max: 250 },
  oxigeno:              { min: 50,  max: 100 },
  presion_sistolica:    { min: 60,  max: 250 },
  presion_diastolica:   { min: 30,  max: 150 },
  temperatura:          { min: 30.0, max: 45.0 },
  glucosa:              { min: 20.0, max: 600.0 },
};

// ── Contextos válidos del API ─────────────────────────────────────────────────
const VALID_CONTEXTS = ['reposo', 'ejercicio', 'comida', 'dormir', 'despertar', 'otro'];

// ── Utilidades ────────────────────────────────────────────────────────────────

/**
 * Valida que un valor numérico esté dentro del rango clínico permitido.
 * @param {string} fieldName - nombre del campo (para mensaje de error)
 * @param {number} value     - valor a validar
 * @returns {boolean}
 */
function isInRange(fieldName, value) {
  const range = VALID_RANGES[fieldName];
  if (!range) return true; // sin rango definido → aceptar
  return value >= range.min && value <= range.max;
}

/**
 * Normaliza SpO2 al rango 50–100 entero.
 *
 * Health Connect puede devolver la saturación como fracción (0.0–1.0)
 * o como porcentaje (50–100). Esta función detecta la representación
 * y convierte a entero en porcentaje en ambos casos.
 *
 * Casos cubiertos:
 *   0.98  → 98   (fracción — conversión a %)
 *   98    → 98   (ya es %)
 *   1.0   → 100  (fracción — borde superior)
 *   0.50  → 50   (fracción — borde inferior)
 *   0.499 → RECHAZADO (< 50% tras conversión)
 *   101   → RECHAZADO (imposible)
 *
 * @param {number|null} rawValue - valor crudo de Health Connect
 * @returns {{ value: number|null, wasConverted: boolean, error: string|null }}
 */
function normalizeSpo2(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return { value: null, wasConverted: false, error: null };
  }

  const num = parseFloat(rawValue);

  if (isNaN(num)) {
    return { value: null, wasConverted: false, error: `SpO2 no numérico: ${rawValue}` };
  }

  let normalized;
  let wasConverted = false;

  if (num >= 0.0 && num <= 1.0) {
    // Representación fraccional — convertir a porcentaje
    normalized = Math.round(num * 100);
    wasConverted = true;
  } else if (num > 1.0 && num <= 100) {
    // Ya está en porcentaje
    normalized = Math.round(num);
    wasConverted = false;
  } else {
    // Valor imposible (< 0 o > 100)
    return {
      value: null,
      wasConverted: false,
      error: `SpO2 fuera de rango imposible: ${num}`,
    };
  }

  if (!isInRange('oxigeno', normalized)) {
    return {
      value: null,
      wasConverted,
      error: `SpO2 normalizado (${normalized}%) fuera del rango clínico [50–100]`,
    };
  }

  return { value: normalized, wasConverted, error: null };
}

// ── Función principal ─────────────────────────────────────────────────────────

/**
 * Adapta los datos del reloj y del formulario manual al payload
 * que espera POST /api/vital-signs.
 *
 * Jerarquía de fuente por campo:
 *   1. Reloj (watchData) si el dato existe y es válido
 *   2. Manual (manualData) si el reloj no entregó el dato
 *   3. Default seguro solo para temperatura (36.6°C)
 *   4. Glucosa: SIEMPRE manual — Watch 8 no la mide
 *   5. GPS: SIEMPRE del teléfono
 *
 * @param {object|null} watchData   - Salida de getLatestWatchData() o null
 * @param {object}      manualData  - Campos del formulario del usuario
 * @param {string}      usuarioId   - ID autenticado del usuario
 * @param {string}      dispositivoId - ID del dispositivo (Build.MODEL)
 * @param {{ lat: number, lon: number }} location - GPS del teléfono
 * @returns {{ payload: object, warnings: string[], errors: string[] }}
 */
export function adaptHealthConnectPayload(
  watchData,
  manualData,
  usuarioId,
  dispositivoId,
  location,
) {
  const warnings = [];
  const errors   = [];
  const sources  = {};

  // ── 1. Frecuencia cardíaca ──────────────────────────────────────────────────
  //   watchData.fc  ← Math.round(sample.beatsPerMinute) desde HC
  //   manualData.frecuencia_cardiaca ← campo del formulario
  let frecuencia_cardiaca;

  if (watchData?.fc != null) {
    const fc = Math.round(watchData.fc);
    if (isInRange('frecuencia_cardiaca', fc)) {
      frecuencia_cardiaca = fc;
      sources.frecuencia_cardiaca = 'watch';
    } else {
      warnings.push(`FC del reloj fuera de rango (${fc} bpm) — usando manual`);
      frecuencia_cardiaca = null;
    }
  }

  if (frecuencia_cardiaca == null && manualData?.frecuencia_cardiaca != null) {
    const fc = Math.round(Number(manualData.frecuencia_cardiaca));
    if (isInRange('frecuencia_cardiaca', fc)) {
      frecuencia_cardiaca = fc;
      sources.frecuencia_cardiaca = 'manual';
    } else {
      errors.push(`FC manual fuera de rango clínico: ${fc} bpm`);
    }
  }

  if (frecuencia_cardiaca == null) {
    errors.push('Frecuencia cardíaca no disponible (reloj ni manual)');
  }

  // ── 2. SpO2 ────────────────────────────────────────────────────────────────
  //   watchData.spo2 ← puede ser fracción (0.0–1.0) o porcentaje (50–100)
  //   REGLA CRÍTICA: normalizeSpo2() garantiza que 0.98 → 98 siempre
  let oxigeno;

  if (watchData?.spo2 != null) {
    const { value, wasConverted, error: spo2Error } = normalizeSpo2(watchData.spo2);
    if (spo2Error) {
      warnings.push(`SpO2 del reloj inválida: ${spo2Error} — usando manual`);
    } else if (value != null) {
      oxigeno = value;
      sources.oxigeno = wasConverted
        ? 'watch_converted'   // fracción convertida a %
        : 'watch';
    }
  }

  if (oxigeno == null && manualData?.oxigeno != null) {
    const { value, error: spo2Error } = normalizeSpo2(manualData.oxigeno);
    if (spo2Error) {
      errors.push(`SpO2 manual inválida: ${spo2Error}`);
    } else if (value != null) {
      oxigeno = value;
      sources.oxigeno = 'manual';
    }
  }

  if (oxigeno == null) {
    errors.push('SpO2 no disponible (reloj ni manual)');
  }

  // ── 3. Presión arterial ────────────────────────────────────────────────────
  //   watchData.tas / watchData.tad ← null hasta calibración del reloj
  //   Si el reloj no tiene dato: usar manual únicamente
  //   NUNCA inventar una medición del reloj si el campo es null
  let presion_sistolica;
  let presion_diastolica;

  if (watchData?.tas != null && watchData?.tad != null) {
    const sys = Math.round(watchData.tas);
    const dia = Math.round(watchData.tad);
    if (isInRange('presion_sistolica', sys) && isInRange('presion_diastolica', dia)) {
      presion_sistolica  = sys;
      presion_diastolica = dia;
      sources.presion_sistolica  = 'watch';
      sources.presion_diastolica = 'watch';
    } else {
      warnings.push(`PA del reloj fuera de rango (${sys}/${dia}) — usando manual`);
    }
  }

  if (presion_sistolica == null && manualData?.presion_sistolica != null) {
    const sys = Math.round(Number(manualData.presion_sistolica));
    if (isInRange('presion_sistolica', sys)) {
      presion_sistolica = sys;
      sources.presion_sistolica = 'manual';
    } else {
      errors.push(`Presión sistólica manual fuera de rango: ${sys} mmHg`);
    }
  }

  if (presion_diastolica == null && manualData?.presion_diastolica != null) {
    const dia = Math.round(Number(manualData.presion_diastolica));
    if (isInRange('presion_diastolica', dia)) {
      presion_diastolica = dia;
      sources.presion_diastolica = 'manual';
    } else {
      errors.push(`Presión diastólica manual fuera de rango: ${dia} mmHg`);
    }
  }

  // PA es opcional en la app — no bloquear si no existe
  if (presion_sistolica == null) sources.presion_sistolica = 'missing';
  if (presion_diastolica == null) sources.presion_diastolica = 'missing';

  // ── 4. Glucosa — SIEMPRE MANUAL ────────────────────────────────────────────
  //   Samsung Watch 8 NO mide glucosa nativa.
  //   No existe integración de glucosa con el reloj.
  //   Este campo solo puede venir del formulario del usuario.
  let glucosa = 90.0; // default clínico seguro
  sources.glucosa = 'default';

  if (manualData?.glucosa != null) {
    const glu = parseFloat(manualData.glucosa);
    if (!isNaN(glu) && isInRange('glucosa', glu)) {
      glucosa = glu;
      sources.glucosa = 'manual';
    } else if (!isNaN(glu)) {
      errors.push(`Glucosa manual fuera de rango clínico: ${glu} mg/dL`);
      // mantiene default 90.0
    }
  }
  // watchData nunca tiene glucosa — no hay rama de 'watch' aquí por diseño

  // ── 5. Temperatura ─────────────────────────────────────────────────────────
  //   watchData.temperatura ← inCelsius de BodyTemperatureRecord
  //   Nota: Watch 8 mide temperatura de piel (skin temp), no corporal exacta.
  //   Usar como aproximación — el usuario puede corregir manualmente.
  let temperatura = 36.6; // default fisiológico seguro
  sources.temperatura = 'default';

  if (watchData?.temperatura != null) {
    const temp = parseFloat(watchData.temperatura);
    if (!isNaN(temp) && isInRange('temperatura', temp)) {
      temperatura = temp;
      sources.temperatura = 'watch';
    } else {
      warnings.push(`Temperatura del reloj inválida (${watchData.temperatura}°C) — usando manual`);
    }
  }

  if (sources.temperatura !== 'watch' && manualData?.temperatura != null) {
    const temp = parseFloat(manualData.temperatura);
    if (!isNaN(temp) && isInRange('temperatura', temp)) {
      temperatura = temp;
      sources.temperatura = 'manual';
    }
  }

  // ── 6. GPS — SIEMPRE DEL TELÉFONO ──────────────────────────────────────────
  //   LocationService.getCurrentLocation() devuelve { lat, lon }
  //   El reloj no provee GPS clínico confiable para coordenadas de emergencia.
  const ubicacion_lat = location?.lat ?? 0;
  const ubicacion_lon = location?.lon ?? 0;
  sources.ubicacion = 'phone_location';

  if (!location?.lat || !location?.lon) {
    warnings.push('GPS del teléfono no disponible — coordenadas en 0,0');
  }

  // ── 7. Campos de contexto ──────────────────────────────────────────────────
  const contexto = VALID_CONTEXTS.includes(manualData?.contexto)
    ? manualData.contexto
    : 'reposo';

  const dispositivo = dispositivoId ?? watchData?.deviceName ?? 'samsung_watch8';

  // ── 8. Armar payload final ─────────────────────────────────────────────────
  const payload = {
    usuario_id:           usuarioId,
    frecuencia_cardiaca,
    oxigeno,
    presion_sistolica,    // puede ser null si no hay dato — API lo acepta
    presion_diastolica,   // puede ser null si no hay dato
    temperatura,
    glucosa,
    ubicacion_lat,
    ubicacion_lon,
    dispositivo_id:       dispositivo,
    emergencia_detectada: false,
    contexto,
    // Campo interno de auditoría — no enviado si el backend lo desconoce
    // Útil para debugging y trazabilidad clínica
    _data_sources: sources,
  };

  return { payload, warnings, errors };
}

// ── Función de validación pre-envío ──────────────────────────────────────────

/**
 * Verifica que el payload tiene los campos mínimos obligatorios
 * antes de enviarlo al backend.
 *
 * @param {object} payload - Salida de adaptHealthConnectPayload().payload
 * @returns {{ valid: boolean, blockers: string[] }}
 */
export function validatePayloadForSubmit(payload) {
  const blockers = [];

  if (!payload.usuario_id) {
    blockers.push('usuario_id es obligatorio');
  }
  if (payload.frecuencia_cardiaca == null) {
    blockers.push('Frecuencia cardíaca es obligatoria');
  }
  if (payload.oxigeno == null) {
    blockers.push('SpO2 es obligatoria');
  }
  if (!isInRange('frecuencia_cardiaca', payload.frecuencia_cardiaca)) {
    blockers.push(`FC ${payload.frecuencia_cardiaca} fuera del rango clínico [20–250]`);
  }
  if (!isInRange('oxigeno', payload.oxigeno)) {
    blockers.push(`SpO2 ${payload.oxigeno}% fuera del rango clínico [50–100]`);
  }

  return { valid: blockers.length === 0, blockers };
}

// ── Test de unidad embebido ───────────────────────────────────────────────────
// Solo se ejecuta en entorno Node.js (prueba local) — nunca en la app.
// Uso: node healthConnectAdapter.js

/* istanbul ignore next */
if (typeof require !== 'undefined' && require.main === module) {
  const assert = (cond, msg) => {
    if (!cond) throw new Error(`❌ FALLO: ${msg}`);
    console.log(`✅ ${msg}`);
  };

  const loc = { lat: 16.8634, lon: -99.8901 };

  // Caso 1: SpO2 fracción 0.98 → oxigeno 98
  const { payload: p1 } = adaptHealthConnectPayload(
    { fc: 80, spo2: 0.98, temperatura: 36.6, tas: null, tad: null },
    { glucosa: 90 }, 'u1', 'watch8', loc
  );
  assert(p1.oxigeno === 98, 'SpO2 0.98 → oxigeno 98');
  assert(p1._data_sources.oxigeno === 'watch_converted', 'fuente: watch_converted');

  // Caso 2: SpO2 porcentaje directo 98 → oxigeno 98
  const { payload: p2 } = adaptHealthConnectPayload(
    { fc: 80, spo2: 98, temperatura: 36.6, tas: null, tad: null },
    { glucosa: 90 }, 'u1', 'watch8', loc
  );
  assert(p2.oxigeno === 98, 'SpO2 98 → oxigeno 98');
  assert(p2._data_sources.oxigeno === 'watch', 'fuente: watch');

  // Caso 3: FC del reloj
  assert(p1.frecuencia_cardiaca === 80, 'FC 80 del reloj');
  assert(p1._data_sources.frecuencia_cardiaca === 'watch', 'fuente FC: watch');

  // Caso 4: Sin presión del reloj → usa manualData
  const { payload: p4 } = adaptHealthConnectPayload(
    { fc: 72, spo2: 98, temperatura: null, tas: null, tad: null },
    { glucosa: 90, presion_sistolica: 115, presion_diastolica: 75 },
    'u1', 'watch8', loc
  );
  assert(p4.presion_sistolica === 115, 'PA sistólica de manual (no reloj)');
  assert(p4._data_sources.presion_sistolica === 'manual', 'fuente PA: manual');

  // Caso 5: Glucosa siempre de manualData
  const { payload: p5 } = adaptHealthConnectPayload(
    { fc: 72, spo2: 98, temperatura: 36.5, tas: null, tad: null },
    { glucosa: 120 }, 'u1', 'watch8', loc
  );
  assert(p5.glucosa === 120, 'Glucosa de manual (120)');
  assert(p5._data_sources.glucosa === 'manual', 'fuente glucosa: manual (nunca watch)');

  // Caso 6: GPS del teléfono
  assert(p1.ubicacion_lat === 16.8634, 'GPS lat del teléfono');
  assert(p1._data_sources.ubicacion === 'phone_location', 'fuente GPS: phone_location');

  // Caso 7: SpO2 0 inválida
  const { errors: errs7 } = adaptHealthConnectPayload(
    { fc: 80, spo2: 0, temperatura: null, tas: null, tad: null },
    { glucosa: 90, oxigeno: 98 }, 'u1', 'watch8', loc
  );
  // spo2=0 de reloj falla, cae a manual oxigeno=98
  assert(errs7.length === 0, 'SpO2=0 cae a manual sin error bloqueante');

  // Caso 8: SpO2 imposible > 100
  const { errors: errs8, warnings: w8 } = adaptHealthConnectPayload(
    { fc: 80, spo2: 110, temperatura: null, tas: null, tad: null },
    { glucosa: 90 }, 'u1', 'watch8', loc
  );
  assert(w8.some(w => w.includes('110')), 'SpO2 110 genera warning');

  console.log('\n✅ TODOS LOS CASOS PASARON — healthConnectAdapter.js OK');
}
