/**
 * MedicationScreen — Medication management with Calendar adherence tab.
 *
 * DESIGN RULES:
 *  - Non-diagnostic — adherence tracking is informational.
 *  - Local persistence via AsyncStorage (@rmhealth/dose_log).
 *  - Calendar tab uses reusable CalendarMonthView.
 *  - Color-coded dots: 🟢 Taken, 🔴 Missed, 🟡 Pending (today only).
 *  - All user-facing text: Spanish (with language switch support).
 *
 * TABS: Mis Tomas | Calendario | Historial
 *
 * © 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, ActivityIndicator, SafeAreaView, Alert, ScrollView, RefreshControl
} from 'react-native';
import { MedicationCard } from '../components/MedicationCard';
import { AddMedicationForm } from '../components/AddMedicationForm';
import { AdherenceDashboard } from '../components/AdherenceDashboard';
import { WeeklyChart } from '../components/WeeklyChart';
import { useMedications } from '../hooks/useMedications';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useAuth } from '../../../contexts/AuthContext';
import { apiService } from '../../../api/client';
import { COLORS, SPACING } from '../../../theme';
import { CalendarMonthView } from '../../../components/CalendarMonthView';
import { Info } from 'lucide-react-native';

const MED_TYPE_ICONS = {
  pill: '💊', injection: '💉', liquid: '🧴',
  patch: '🩹', inhaler: '🌬️',
};

const TEXTS = {
  es: {
    title: 'Mis Medicamentos',
    tab_current: 'Mis Tomas',
    tab_calendar: 'Calendario',
    tab_history: 'Historial',
    history_title: 'Registro de Tomas',
    delete_confirm_title: 'Eliminar Medicamento',
    delete_confirm_msg: '¿Seguro que deseas eliminar {name}?',
    delete: 'Eliminar',
    cancel: 'Cancelar',
    adherence: 'Adherencia Mensual',
    empty_history: 'No hay tomas registradas todavía.',
    add: 'AGREGAR',
    on_time: 'A tiempo',
    cal_title: 'Calendario de Adherencia',
    cal_taken: 'Tomado',
    cal_missed: 'No tomado',
    cal_pending: 'Pendiente',
    cal_no_data: 'Sin datos para este día',
    disclaimer: 'El seguimiento de medicamentos es informativo. No sustituye la prescripción ni el consejo médico profesional.',
  },
  en: {
    title: 'My Medications',
    tab_current: 'My Doses',
    tab_calendar: 'Calendar',
    tab_history: 'History',
    history_title: 'Dose Records',
    delete_confirm_title: 'Delete Medication',
    delete_confirm_msg: 'Are you sure you want to delete {name}?',
    delete: 'Delete',
    cancel: 'Cancel',
    adherence: 'Monthly Adherence',
    empty_history: 'No doses recorded yet.',
    add: 'ADD',
    on_time: 'On time',
    cal_title: 'Adherence Calendar',
    cal_taken: 'Taken',
    cal_missed: 'Missed',
    cal_pending: 'Pending',
    cal_no_data: 'No data for this day',
    disclaimer: 'Medication tracking is informational. It does not replace professional medical prescription or advice.',
  },
};

const TABS = ['current', 'calendar', 'history'];

export function MedicationScreen() {
  const { language } = useLanguage();
  const { accessToken } = useAuth();
  const txt = TEXTS[language] || TEXTS.es;

  const {
    medications,
    isLoading,
    error,
    recordDose,
    isTakenToday,
    getDoseHistory,
    addMedication,
    updateMedication,
    deleteMedication,
    clearError,
  } = useMedications();

  const [activeTab, setActiveTab] = useState('current');
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingMed, setEditingMed] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [serverAdherence, setServerAdherence] = useState(null);
  const [selectedCalDate, setSelectedCalDate] = useState(null);

  // Sync with server: fetch medications on mount
  useEffect(() => {
    if (accessToken) {
      syncFromServer();
    }
  }, [accessToken]);

  const syncFromServer = async () => {
    try {
      const adherenceData = await apiService.getAdherence(accessToken);
      if (adherenceData.status === 'success') {
        setServerAdherence(adherenceData);
      }
    } catch (e) {
      console.warn('[MedicationScreen] Server sync failed:', e);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await syncFromServer();
    setRefreshing(false);
  }, [accessToken]);

  const handleAddOrUpdate = async (medData) => {
    if (editingMed) {
      updateMedication(medData.id, medData);
      // Sync to server
      if (accessToken && editingMed.serverId) {
        apiService.updateMedication(editingMed.serverId, medData, accessToken);
      }
    } else {
      addMedication(medData);
      // Create on server
      if (accessToken) {
        apiService.createMedication(medData, accessToken);
      }
    }
    setIsFormVisible(false);
    setEditingMed(null);
  };

  const handleEdit = (med) => {
    setEditingMed(med);
    setIsFormVisible(true);
  };

  const handleDelete = (id, name) => {
    Alert.alert(
      txt.delete_confirm_title,
      txt.delete_confirm_msg.replace('{name}', name),
      [
        { text: txt.cancel, style: 'cancel' },
        { text: txt.delete, style: 'destructive', onPress: () => {
          deleteMedication(id);
          // Delete from server
          const med = medications.find(m => m.id === id);
          if (accessToken && med?.serverId) {
            apiService.deleteMedication(med.serverId, accessToken);
          }
        }}
      ]
    );
  };

  const handleRecordDose = async (medId) => {
    recordDose(medId);
    // Sync dose to server
    const med = medications.find(m => m.id === medId);
    if (accessToken && med?.serverId) {
      apiService.recordDose(med.serverId, accessToken);
    }
  };

  // ── Build calendar markedDates ──
  const markedDates = useMemo(() => {
    const marks = {};
    const todayKey = new Date().toISOString().split('T')[0];

    // Build a map: { 'YYYY-MM-DD': { taken: [medName], missed: [medName] } }
    if (medications.length === 0) return marks;

    // Look back 90 days
    for (let i = 0; i < 90; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];

      let takenCount = 0;
      let missedCount = 0;
      const medDetails = [];

      medications.forEach(med => {
        const dayHistory = getDoseHistory(med.id, i + 1);
        const dayEntry = dayHistory.find(h => h.date === key);
        if (dayEntry) {
          if (dayEntry.taken) {
            takenCount++;
            medDetails.push({ name: med.name, status: 'taken', takenAt: dayEntry.takenAt });
          } else {
            // If date is in the past, it's missed; if today, it's pending
            if (key === todayKey) {
              medDetails.push({ name: med.name, status: 'pending' });
            } else {
              missedCount++;
              medDetails.push({ name: med.name, status: 'missed' });
            }
          }
        }
      });

      if (takenCount > 0 || missedCount > 0 || (key === todayKey && medDetails.length > 0)) {
        const dots = [];
        if (takenCount > 0) dots.push({ color: '#10B981', key: 'taken' });
        if (missedCount > 0) dots.push({ color: '#EF4444', key: 'missed' });
        if (key === todayKey && medDetails.some(m => m.status === 'pending')) {
          dots.push({ color: '#F59E0B', key: 'pending' });
        }
        marks[key] = { dots, data: { date: key, meds: medDetails, takenCount, missedCount } };
      }
    }
    return marks;
  }, [medications, getDoseHistory]);

  // Selected day data for calendar
  const selectedDayInfo = useMemo(() => {
    if (!selectedCalDate) return null;
    return markedDates[selectedCalDate]?.data || null;
  }, [selectedCalDate, markedDates]);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3BAFAA" />
      </View>
    );
  }

  // Build merged medications with today's dose status for dashboard
  const medsWithStatus = medications.map(med => ({
    ...med,
    taken: isTakenToday(med.id),
  }));

  // Calculate real adherence from local data
  const calcLocalAdherence = () => {
    if (medications.length === 0) return 0;
    let totalPossible = 0;
    let totalTaken = 0;
    medications.forEach(med => {
      const history = getDoseHistory(med.id, 30);
      history.forEach(day => {
        totalPossible++;
        if (day.taken) totalTaken++;
      });
    });
    return totalPossible > 0 ? Math.round((totalTaken / totalPossible) * 100) : 0;
  };

  const adherencePct = serverAdherence?.adherence_pct ?? calcLocalAdherence();

  // --- HEADER COMPONENT for FlatList ---
  const renderListHeader = () => (
    <View style={styles.dashboardContainer}>
      <AdherenceDashboard medications={medsWithStatus} language={language} />
    </View>
  );

  // --- CALENDAR VIEW ---
  const renderCalendar = () => (
    <ScrollView
      contentContainerStyle={styles.calendarScroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3BAFAA" />}
    >
      <Text style={styles.calTitle}>{txt.cal_title}</Text>

      {/* Legend */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
          <Text style={styles.legendText}>{txt.cal_taken}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
          <Text style={styles.legendText}>{txt.cal_missed}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
          <Text style={styles.legendText}>{txt.cal_pending}</Text>
        </View>
      </View>

      <CalendarMonthView
        markedDates={markedDates}
        selectedDate={selectedCalDate}
        onSelectDate={setSelectedCalDate}
        accentColor="#3BAFAA"
        language={language === 'en' ? 'en' : 'es'}
      />

      {/* Selected day detail */}
      {selectedCalDate && (
        selectedDayInfo ? (
          <View style={styles.dayDetailCard}>
            <Text style={styles.dayDetailDate}>
              {new Date(selectedCalDate + 'T12:00:00').toLocaleDateString(
                language === 'en' ? 'en-US' : 'es-MX',
                { weekday: 'long', day: 'numeric', month: 'long' }
              )}
            </Text>
            {selectedDayInfo.meds.map((med, i) => (
              <View key={i} style={styles.dayMedRow}>
                <Text style={styles.dayMedName}>{med.name}</Text>
                <View style={[
                  styles.dayMedStatus,
                  { backgroundColor: med.status === 'taken' ? '#D1FAE5'
                    : med.status === 'missed' ? '#FEE2E2' : '#FEF3C7' }
                ]}>
                  <Text style={[
                    styles.dayMedStatusText,
                    { color: med.status === 'taken' ? '#065F46'
                      : med.status === 'missed' ? '#991B1B' : '#92400E' }
                  ]}>
                    {med.status === 'taken' ? `✓ ${txt.cal_taken}` 
                      : med.status === 'missed' ? `✗ ${txt.cal_missed}`
                      : `● ${txt.cal_pending}`}
                  </Text>
                </View>
              </View>
            ))}
            {selectedDayInfo.takenCount > 0 && (
              <Text style={styles.dayAdherenceText}>
                {selectedDayInfo.takenCount}/{selectedDayInfo.takenCount + selectedDayInfo.missedCount} {txt.cal_taken.toLowerCase()}
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.dayDetailEmpty}>
            <Text style={styles.dayDetailEmptyText}>{txt.cal_no_data}</Text>
          </View>
        )
      )}

      {/* Disclaimer */}
      <View style={styles.disclaimerCard}>
        <Info size={14} color="#92400E" />
        <Text style={styles.disclaimerText}>{txt.disclaimer}</Text>
      </View>
    </ScrollView>
  );

  // --- HISTORY VIEW ---
  const renderHistory = () => {
    const allHistory = [];
    medications.forEach(med => {
      const history = getDoseHistory(med.id, 30);
      history.forEach(h => {
        if (h.taken) {
          allHistory.push({ ...h, medName: med.name, medType: med.med_type || 'pill' });
        }
      });
    });

    const sortedHistory = allHistory.sort((a, b) => new Date(b.takenAt) - new Date(a.takenAt));

    if (sortedHistory.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>📋 {txt.empty_history}</Text>
        </View>
      );
    }

    return (
      <ScrollView
        contentContainerStyle={styles.historyScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3BAFAA" />}
      >
        {/* Adherence Stats Card */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>{txt.adherence}</Text>
          <Text style={styles.statsValue}>{adherencePct}%</Text>
          <Text style={styles.statsSub}>
            {language === 'en' ? 'Last 30 days' : 'Últimos 30 días'}
          </Text>
        </View>

        {/* Weekly Chart */}
        <View style={styles.chartContainer}>
          <WeeklyChart medications={medications} getDoseHistory={getDoseHistory} />
        </View>

        {/* Dose Records */}
        {sortedHistory.map((item, index) => (
          <View key={index} style={styles.historyItem}>
            <Text style={styles.historyIcon}>{MED_TYPE_ICONS[item.medType] || '💊'}</Text>
            <View style={styles.historyContent}>
              <Text style={styles.historyMed}>{item.medName}</Text>
              <Text style={styles.historyTime}>
                {new Date(item.takenAt).toLocaleDateString()} - {new Date(item.takenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <Text style={styles.historyStatus}>{txt.on_time}</Text>
          </View>
        ))}
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{txt.title}</Text>
        
        {/* TAB NAVIGATION — 3 tabs */}
        <View style={styles.tabBar}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'current' ? txt.tab_current
                  : tab === 'calendar' ? txt.tab_calendar
                  : txt.tab_history}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {activeTab === 'current' ? (
        <FlatList
          data={medications}
          keyExtractor={item => item.id}
          ListHeaderComponent={renderListHeader}
          renderItem={({ item }) => (
            <MedicationCard
              medication={item}
              isTaken={isTakenToday(item.id)}
              onRecordDose={handleRecordDose}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3BAFAA" />}
        />
      ) : activeTab === 'calendar' ? renderCalendar() : renderHistory()}

      <TouchableOpacity
        style={styles.floatingButton}
        onPress={() => {
          setEditingMed(null);
          setIsFormVisible(true);
        }}
      >
        <Text style={styles.floatingButtonText}>+ {txt.add}</Text>
      </TouchableOpacity>

      <Modal
        visible={isFormVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsFormVisible(false)}
      >
        <AddMedicationForm
          initialData={editingMed}
          onAdd={handleAddOrUpdate}
          onCancel={() => setIsFormVisible(false)}
        />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  title: { fontSize: 24, fontWeight: '900', color: '#1B4F72', marginBottom: 20 },
  tabBar: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#FFFFFF', elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  tabText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  tabTextActive: { color: '#3BAFAA' },
  dashboardContainer: { marginTop: 8 },
  listContainer: { paddingBottom: 100, paddingTop: 4 },
  historyScroll: { padding: 16, paddingBottom: 100 },
  calendarScroll: { padding: 16, paddingBottom: 100 },
  statsCard: { backgroundColor: '#3BAFAA', padding: 20, borderRadius: 20, alignItems: 'center', marginBottom: 16 },
  statsTitle: { color: '#E0F2F1', fontSize: 14, fontWeight: '700' },
  statsValue: { color: '#FFFFFF', fontSize: 36, fontWeight: '900', marginVertical: 4 },
  statsSub: { color: '#E0F2F1', fontSize: 12 },
  chartContainer: { marginBottom: 16 },
  historyItem: { 
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', 
    padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F1F5F9' 
  },
  historyIcon: { fontSize: 24, marginRight: 12 },
  historyContent: { flex: 1 },
  historyMed: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
  historyTime: { fontSize: 12, color: '#64748B', marginTop: 2 },
  historyStatus: { fontSize: 12, fontWeight: '700', color: '#10B981' },
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#94A3B8', fontWeight: '600' },
  floatingButton: {
    position: 'absolute', bottom: 30, right: 20, left: 20,
    backgroundColor: '#1B4F72', paddingVertical: 16, borderRadius: 16,
    alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8
  },
  floatingButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', letterSpacing: 1 },

  // Calendar Tab
  calTitle: { fontSize: 18, fontWeight: '800', color: '#1B4F72', marginBottom: 12 },
  legendRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: '#64748B', fontWeight: '600' },

  // Day detail card
  dayDetailCard: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#E2E8F0', marginTop: 4,
  },
  dayDetailDate: {
    fontSize: 14, fontWeight: '700', color: '#1B4F72',
    marginBottom: 10, textTransform: 'capitalize',
  },
  dayMedRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  dayMedName: { fontSize: 14, fontWeight: '700', color: '#1E293B', flex: 1 },
  dayMedStatus: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  dayMedStatusText: { fontSize: 12, fontWeight: '700' },
  dayAdherenceText: { fontSize: 12, color: '#64748B', marginTop: 8, textAlign: 'right', fontWeight: '600' },
  dayDetailEmpty: {
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 4,
  },
  dayDetailEmptyText: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic' },

  // Disclaimer
  disclaimerCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FFF7ED', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#FED7AA', marginTop: 16,
  },
  disclaimerText: { flex: 1, fontSize: 11, color: '#92400E', lineHeight: 16 },
});
