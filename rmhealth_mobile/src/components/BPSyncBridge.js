/**
 * BPSyncBridge.js — Bridge para sincronización manual de Blood Pressure.
 *
 * CONTEXTO TÉCNICO:
 * Samsung Health Monitor (com.samsung.android.shealthmonitor) NO tiene
 * integración con Health Connect. Solo Samsung Health (com.sec.android.app.shealth)
 * escribe a HC, pero solo sincroniza HR y SpO2, NO BP.
 *
 * Este componente actúa como bridge: cuando el usuario toma la presión en el
 * Galaxy Watch, Samsung Health la muestra, pero Health Connect no la recibe.
 * BPSyncBridge permite al usuario ingresar esos valores rápidamente y los
 * escribe en Health Connect vía writeBloodPressure(), restaurando el flujo.
 *
 * FLUJO:
 * Galaxy Watch → Samsung Health Monitor → Samsung Health (phone)
 *   → [usuario ve los valores] → BPSyncBridge → Health Connect → RMHealth
 *
 * © 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, TextInput,
  StyleSheet, ActivityIndicator, Keyboard, Alert,
} from 'react-native';
import { Activity, RefreshCw, CheckCircle, X } from 'lucide-react-native';
import { writeBloodPressure } from '../services/HealthConnectService';

/**
 * @param {Object} props
 * @param {boolean} props.visible - Si el BP en HC está obsoleto (>2h)
 * @param {string}  props.lastBPTime - ISO string del último BP en HC
 * @param {number}  props.lastSys - Último valor sistólico en HC
 * @param {number}  props.lastDia - Último valor diastólico en HC
 * @param {string}  props.language - 'en' | 'es'
 * @param {Function} props.onSyncComplete - Callback cuando se escribe exitosamente
 */
export function BPSyncBridge({ visible, lastBPTime, lastSys, lastDia, language, onSyncComplete }) {
  const [showModal, setShowModal] = useState(false);
  const [sys, setSys] = useState('');
  const [dia, setDia] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!visible) return null;

  // Calcular antigüedad del dato
  const ageHours = lastBPTime
    ? ((Date.now() - new Date(lastBPTime).getTime()) / (1000 * 60 * 60)).toFixed(0)
    : '?';

  const handleSync = async () => {
    const sysVal = parseInt(sys, 10);
    const diaVal = parseInt(dia, 10);

    if (isNaN(sysVal) || isNaN(diaVal) || sysVal < 60 || sysVal > 250 || diaVal < 30 || diaVal > 180) {
      return; // Validación básica
    }

    Keyboard.dismiss();
    setSaving(true);
    try {
      const ok = await writeBloodPressure(sysVal, diaVal);
      if (ok) {
        setSuccess(true);
        console.log('[BPSyncBridge] ✅ BP escrito a HC:', sysVal + '/' + diaVal);
        setTimeout(() => {
          setShowModal(false);
          setSuccess(false);
          setSys('');
          setDia('');
          onSyncComplete?.(sysVal, diaVal);
        }, 1200);
      } else {
        console.warn('[BPSyncBridge] writeBloodPressure returned false');
        Alert.alert(
          language === 'en' ? 'Sync failed' : 'Error de sincronización',
          language === 'en'
            ? 'Could not write to Health Connect. Grant blood pressure write permission in Health Connect settings.'
            : 'No se pudo escribir en Health Connect. Activa el permiso de escritura de presión arterial en la configuración de Health Connect.',
        );
      }
    } catch (e) {
      console.warn('[BPSyncBridge] Error:', e);
      Alert.alert(
        language === 'en' ? 'Error' : 'Error',
        e?.message || String(e),
      );
    } finally {
      setSaving(false);
    }
  };

  const t = {
    title: language === 'en'
      ? '⌚ Update Blood Pressure'
      : '⌚ Actualizar Presión Arterial',
    subtitle: language === 'en'
      ? `Last reading: ${lastSys || '?'}/${lastDia || '?'} (${ageHours}h ago)`
      : `Última lectura: ${lastSys || '?'}/${lastDia || '?'} (hace ${ageHours}h)`,
    explanation: language === 'en'
      ? 'Enter the BP values shown on your Samsung Health app. RMHealth will sync them.'
      : 'Ingresa los valores de presión que muestra Samsung Health. RMHealth los sincronizará.',
    btnText: language === 'en'
      ? 'Update Blood Pressure'
      : 'Actualizar Presión',
    sysLabel: language === 'en' ? 'Systolic' : 'Sistólica',
    diaLabel: language === 'en' ? 'Diastolic' : 'Diastólica',
    save: language === 'en' ? 'Sync to Health Connect' : 'Sincronizar a Health Connect',
    successMsg: language === 'en' ? 'Synced!' : '¡Sincronizado!',
    cancel: language === 'en' ? 'Cancel' : 'Cancelar',
  };

  return (
    <>
      {/* Banner inline — visible cuando BP está obsoleta */}
      <TouchableOpacity
        style={styles.banner}
        onPress={() => setShowModal(true)}
        activeOpacity={0.7}
        testID="btn-bp-sync-bridge"
        accessibilityLabel={t.btnText}
        accessibilityRole="button"
      >
        <View style={styles.bannerLeft}>
          <RefreshCw size={16} color="#F59E0B" strokeWidth={2.5} />
          <View style={styles.bannerTextWrap}>
            <Text style={styles.bannerTitle}>{t.title}</Text>
            <Text style={styles.bannerSub}>{t.subtitle}</Text>
          </View>
        </View>
        <Activity size={18} color="#F59E0B" strokeWidth={2} />
      </TouchableOpacity>

      {/* Modal para ingreso rápido */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.card}>
            {success ? (
              <View style={styles.successWrap}>
                <CheckCircle size={48} color="#10B981" strokeWidth={2} />
                <Text style={styles.successText}>{t.successMsg}</Text>
              </View>
            ) : (
              <>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{t.title}</Text>
                  <TouchableOpacity onPress={() => setShowModal(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <X size={22} color="#94A3B8" strokeWidth={2} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.explanation}>{t.explanation}</Text>

                <View style={styles.inputRow}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>{t.sysLabel}</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="number-pad"
                      placeholder="120"
                      placeholderTextColor="#475569"
                      value={sys}
                      onChangeText={setSys}
                      maxLength={3}
                      testID="input-bp-sys"
                    />
                    <Text style={styles.inputUnit}>mmHg</Text>
                  </View>
                  <Text style={styles.slash}>/</Text>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>{t.diaLabel}</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="number-pad"
                      placeholder="80"
                      placeholderTextColor="#475569"
                      value={dia}
                      onChangeText={setDia}
                      maxLength={3}
                      testID="input-bp-dia"
                    />
                    <Text style={styles.inputUnit}>mmHg</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.syncBtn, saving && styles.syncBtnDisabled]}
                  onPress={handleSync}
                  disabled={saving || !sys || !dia}
                  activeOpacity={0.8}
                  testID="btn-bp-sync-confirm"
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.syncBtnText}>{t.save}</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setShowModal(false)}
                >
                  <Text style={styles.cancelText}>{t.cancel}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // ── Banner inline ──
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F59E0B14',
    borderWidth: 1,
    borderColor: '#F59E0B40',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 8,
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  bannerTextWrap: {
    marginLeft: 10,
    flex: 1,
  },
  bannerTitle: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '700',
  },
  bannerSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },

  // ── Modal overlay ──
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    color: '#F1F5F9',
    fontSize: 18,
    fontWeight: '700',
  },
  explanation: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 20,
  },

  // ── Inputs ──
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  inputGroup: {
    alignItems: 'center',
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    color: '#F1F5F9',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    width: 100,
    height: 56,
    paddingHorizontal: 8,
  },
  inputUnit: {
    color: '#475569',
    fontSize: 10,
    marginTop: 4,
  },
  slash: {
    color: '#475569',
    fontSize: 32,
    fontWeight: '300',
    marginHorizontal: 12,
    marginTop: 16,
  },

  // ── Buttons ──
  syncBtn: {
    backgroundColor: '#F59E0B',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  syncBtnDisabled: {
    opacity: 0.5,
  },
  syncBtnText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelText: {
    color: '#64748B',
    fontSize: 13,
  },

  // ── Success ──
  successWrap: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  successText: {
    color: '#10B981',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
  },
});
