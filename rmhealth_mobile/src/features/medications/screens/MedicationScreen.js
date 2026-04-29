import React, { useState, useEffect, useCallback } from 'react';
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

const MED_TYPE_ICONS = {
  pill: '💊', injection: '💉', liquid: '🧴',
  patch: '🩹', inhaler: '🌬️',
};

const TEXTS = {
  es: {
    title: 'Mis Medicamentos',
    tab_current: 'Mis Tomas',
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
  },
  en: {
    title: 'My Medications',
    tab_current: 'My Doses',
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
  },
};

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

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3BAFAA" />
      </View>
    );
  }

  // Build merged medications with today's dose status for dashboard
  const todayKey = new Date().toISOString().split('T')[0];
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
        
        {/* TAB NAVIGATION */}
        <View style={styles.tabBar}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'current' && styles.tabActive]}
            onPress={() => setActiveTab('current')}
          >
            <Text style={[styles.tabText, activeTab === 'current' && styles.tabTextActive]}>
              {txt.tab_current}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'history' && styles.tabActive]}
            onPress={() => setActiveTab('history')}
          >
            <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
              {txt.tab_history}
            </Text>
          </TouchableOpacity>
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
      ) : renderHistory()}

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
  tabText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  tabTextActive: { color: '#3BAFAA' },
  dashboardContainer: { marginTop: 8 },
  listContainer: { paddingBottom: 100, paddingTop: 4 },
  historyScroll: { padding: 16, paddingBottom: 100 },
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
});
