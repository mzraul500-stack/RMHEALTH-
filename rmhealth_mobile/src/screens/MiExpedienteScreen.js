/**
 * MiExpedienteScreen — Unified Clinical Record View
 * Phase 7 (M9) — NOM-004 compliant medical record
 *
 * Features:
 * - Summary stats (measurements, days, alerts, medications)
 * - Download complete PDF (server-side generated)
 * - No emojis — Lucide icons only
 *
 * © 2025 MORALES ZEPEDA RAUL | Registro INDAUTOR: 03-2025-070109072500-01
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Linking, RefreshControl,
} from 'react-native';
import { COLORS } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  FileText, Download, Heart, Activity, Pill,
  ShieldAlert, Calendar, AlertTriangle, ClipboardList,
  Stethoscope, Droplets, Edit3,
} from 'lucide-react-native';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL
  || 'https://rmhealth-api-292048010515.us-central1.run.app/api';

export function MiExpedienteScreen() {
  const { accessToken } = useAuth();
  const { language } = useLanguage();
  const { isHighContrast, colors } = useTheme();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const tr = useCallback((key) => {
    const texts = {
      title: { es: 'Mi Expediente Clinico', en: 'My Clinical Record' },
      subtitle: { es: 'Resumen de tu historial medico', en: 'Summary of your medical history' },
      download_pdf: { es: 'Descargar Expediente PDF', en: 'Download Record PDF' },
      downloading: { es: 'Generando PDF...', en: 'Generating PDF...' },
      measurements: { es: 'Mediciones', en: 'Measurements' },
      monitoring_days: { es: 'Dias monitoreados', en: 'Monitoring days' },
      alerts: { es: 'Alertas', en: 'Alerts' },
      active_meds: { es: 'Medicamentos activos', en: 'Active medications' },
      conditions: { es: 'Condiciones medicas', en: 'Medical conditions' },
      allergies: { es: 'Alergias', en: 'Allergies' },
      corrections: { es: 'Correcciones', en: 'Corrections' },
      first_reading: { es: 'Primera lectura', en: 'First reading' },
      last_reading: { es: 'Ultima lectura', en: 'Last reading' },
      no_data_yet: { es: 'Sin datos registrados aun', en: 'No data recorded yet' },
      immutability_notice: {
        es: 'Los registros medicos son inmutables. Solo se pueden agregar notas de correccion, nunca editar o eliminar datos originales.',
        en: 'Medical records are immutable. Only correction notes can be added, original data can never be edited or deleted.',
      },
      nom004_notice: {
        es: 'Conservacion minima de 5 anios conforme a NOM-004-SSA3-2012.',
        en: 'Minimum 5-year retention per NOM-004-SSA3-2012.',
      },
      error_load: { es: 'Error al cargar expediente', en: 'Error loading record' },
      error_pdf: { es: 'Error al generar PDF', en: 'Error generating PDF' },
      pdf_ready: { es: 'PDF listo', en: 'PDF ready' },
      pdf_opening: { es: 'Abriendo PDF en el navegador...', en: 'Opening PDF in browser...' },
    };
    return texts[key]?.[language] || texts[key]?.es || key;
  }, [language]);

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/expediente/summary`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
      } else {
        console.warn('[Expediente] Load failed:', res.status);
      }
    } catch (e) {
      console.error('[Expediente] Load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadSummary();
  };

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      const pdfUrl = `${API_BASE_URL}/expediente/pdf?token=${encodeURIComponent(accessToken)}&lang=${language}`;
      await Linking.openURL(pdfUrl);
    } catch (e) {
      console.error('[Expediente] PDF error:', e);
      Alert.alert(tr('error_pdf'), e.message);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <View style={[s.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const stats = [
    { icon: Heart, color: isHighContrast ? colors.text : '#EF4444', label: tr('measurements'), value: summary?.total_measurements || 0 },
    { icon: Calendar, color: isHighContrast ? colors.text : '#1B7A6E', label: tr('monitoring_days'), value: summary?.monitoring_days || 0 },
    { icon: AlertTriangle, color: isHighContrast ? colors.text : '#F59E0B', label: tr('alerts'), value: summary?.total_alerts || 0 },
    { icon: Pill, color: isHighContrast ? colors.text : '#8B5CF6', label: tr('active_meds'), value: summary?.active_medications || 0 },
    { icon: Stethoscope, color: isHighContrast ? colors.text : '#1B7A6E', label: tr('conditions'), value: summary?.active_conditions || 0 },
    { icon: Droplets, color: isHighContrast ? colors.text : '#E74C3C', label: tr('allergies'), value: summary?.active_allergies || 0 },
  ];

  return (
    <ScrollView
      style={[s.container, { backgroundColor: colors.background }]}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
    >
      {/* Header */}
      <View style={[s.headerCard, { backgroundColor: colors.surface, borderColor: colors.border }, isHighContrast && s.hcBorder]}>
        <View style={[s.headerIcon, isHighContrast && { backgroundColor: '#E2E8F0', borderWidth: 1 }]}>
          <FileText size={32} color={colors.primary} strokeWidth={isHighContrast ? 2.5 : 2} />
        </View>
        <Text style={[s.title, { color: colors.secondary }]}>{tr('title')}</Text>
        <Text style={[s.subtitle, { color: colors.textMuted }]}>{tr('subtitle')}</Text>
        {summary?.patient_name && (
          <Text style={[s.patientName, { color: colors.text }]}>{summary.patient_name}</Text>
        )}
      </View>

      {/* Download PDF Button — visible and prominent */}
      <TouchableOpacity
        style={[s.downloadBtn, { backgroundColor: colors.primary }, downloading && s.downloadBtnDisabled, isHighContrast && s.hcBorder]}
        onPress={handleDownloadPDF}
        disabled={downloading}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={tr('download_pdf')}
        activeOpacity={0.8}
      >
        {downloading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Download size={22} color="#FFF" strokeWidth={isHighContrast ? 3 : 2.5} style={{ marginRight: 8 }} />
        )}
        <Text style={s.downloadText}>
          {downloading ? tr('downloading') : tr('download_pdf')}
        </Text>
      </TouchableOpacity>

      {/* Stats Grid */}
      <View style={s.statsGrid}>
        {stats.map((stat, i) => (
          <View key={i} style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }, isHighContrast && s.hcBorder]}>
            <stat.icon size={22} color={stat.color} strokeWidth={2} />
            <Text style={s.statValue}>{stat.value}</Text>
            <Text style={s.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Date Range */}
      {summary?.first_reading && (
        <View style={s.dateRangeCard}>
          <View style={s.dateRow}>
            <ClipboardList size={16} color="#1B7A6E" strokeWidth={2} />
            <Text style={s.dateLabel}>{tr('first_reading')}:</Text>
            <Text style={s.dateValue}>
              {new Date(summary.first_reading).toLocaleDateString()}
            </Text>
          </View>
          <View style={s.dateRow}>
            <ClipboardList size={16} color="#1B7A6E" strokeWidth={2} />
            <Text style={s.dateLabel}>{tr('last_reading')}:</Text>
            <Text style={s.dateValue}>
              {new Date(summary.last_reading).toLocaleDateString()}
            </Text>
          </View>
          {(summary?.total_corrections || 0) > 0 && (
            <View style={s.dateRow}>
              <Edit3 size={16} color="#F59E0B" strokeWidth={2} />
              <Text style={s.dateLabel}>{tr('corrections')}:</Text>
              <Text style={s.dateValue}>{summary.total_corrections}</Text>
            </View>
          )}
        </View>
      )}

      {!summary?.first_reading && (
        <View style={s.emptyCard}>
          <ClipboardList size={40} color="#CBD5E1" strokeWidth={1.5} />
          <Text style={s.emptyText}>{tr('no_data_yet')}</Text>
        </View>
      )}

      {/* Legal Notices */}
      <View style={s.legalCard}>
        <ShieldAlert size={16} color="#64748B" strokeWidth={2} />
        <Text style={s.legalText}>{tr('immutability_notice')}</Text>
      </View>
      <View style={[s.legalCard, { marginTop: 8 }]}>
        <FileText size={16} color="#64748B" strokeWidth={2} />
        <Text style={s.legalText}>{tr('nom004_notice')}</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  hcBorder: {
    borderWidth: 2,
    borderColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  headerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
    elevation: 2,
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E0F2F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
  },
  patientName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1B7A6E',
    marginTop: 8,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1B7A6E',
    padding: 16,
    borderRadius: 14,
    marginBottom: 20,
    elevation: 4,
    shadowColor: '#1B7A6E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  downloadBtnDisabled: {
    opacity: 0.7,
  },
  downloadText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    width: '48%',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 1,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.text,
    marginTop: 6,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
  },
  dateRangeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  dateLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    marginLeft: 8,
    flex: 1,
  },
  dateValue: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 12,
  },
  legalCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  legalText: {
    fontSize: 11,
    color: '#64748B',
    marginLeft: 8,
    flex: 1,
    lineHeight: 16,
  },
});

export default MiExpedienteScreen;
