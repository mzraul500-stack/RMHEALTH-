import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, ActivityIndicator, SafeAreaView,
} from 'react-native';
import { MedicationCard } from '../components/MedicationCard';
import { AddMedicationForm } from '../components/AddMedicationForm';
import { AdherenceDashboard } from '../components/AdherenceDashboard';
import { WeeklyChart } from '../components/WeeklyChart';
import { useMedications } from '../hooks/useMedications';
import { useLanguage } from '../../../contexts/LanguageContext';
import { COLORS, SPACING } from '../../../theme';

const TEXTS = {
  es: {
    title: '💊 Mis Medicamentos',
    subtitle: 'Toca una pastilla para registrar que la tomaste hoy',
    loading: 'Cargando medicamentos...',
    empty_icon: '📋',
    empty_title: 'No tienes medicamentos registrados',
    empty_sub: 'Presiona el botón + AGREGAR para comenzar',
    add: 'AGREGAR',
    dismiss: 'Tocar para cerrar',
  },
  en: {
    title: '💊 My Medications',
    subtitle: 'Tap a pill to record that you took it today',
    loading: 'Loading medications...',
    empty_icon: '📋',
    empty_title: 'No medications registered',
    empty_sub: 'Press the + ADD button to start',
    add: 'ADD',
    dismiss: 'Tap to dismiss',
  },
};

export function MedicationScreen() {
  const { language } = useLanguage();
  const txt = TEXTS[language] || TEXTS.es;

  const {
    medications,
    isLoading,
    error,
    recordDose,
    isTakenToday,
    getDoseHistory,
    addMedication,
    deleteMedication,
    clearError,
  } = useMedications();

  const [isFormVisible, setIsFormVisible] = useState(false);

  const handleAdd = (newMed) => {
    addMedication(newMed);
    setIsFormVisible(false);
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>{txt.loading}</Text>
      </View>
    );
  }

  // Build today's adherence stats for dashboard
  const totalMeds = medications.length;
  const takenToday = medications.filter(m => isTakenToday(m.id)).length;

  return (
    <SafeAreaView style={styles.container}>
      {error && (
        <TouchableOpacity style={styles.errorBanner} onPress={clearError}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorDismiss}>{txt.dismiss}</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={medications}
        keyExtractor={item => item.id}
        ListHeaderComponent={() => (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>{txt.title}</Text>
              <Text style={styles.subtitle}>{txt.subtitle}</Text>
              {totalMeds > 0 && (
                <View style={styles.todayBadge}>
                  <Text style={styles.todayText}>
                    {language === 'en' ? 'Today' : 'Hoy'}: {takenToday}/{totalMeds}
                  </Text>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${totalMeds > 0 ? (takenToday / totalMeds) * 100 : 0}%` }]} />
                  </View>
                </View>
              )}
            </View>
            <AdherenceDashboard medications={medications.map(m => ({ ...m, taken: isTakenToday(m.id) }))} />
            <WeeklyChart />
          </>
        )}
        renderItem={({ item }) => (
          <MedicationCard
            medication={item}
            isTaken={isTakenToday(item.id)}
            doseHistory={getDoseHistory(item.id, 7)}
            onRecordDose={recordDose}
            onDelete={deleteMedication}
          />
        )}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>{txt.empty_icon}</Text>
            <Text style={styles.emptyText}>{txt.empty_title}</Text>
            <Text style={styles.emptySubtext}>{txt.empty_sub}</Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.floatingButton}
        onPress={() => setIsFormVisible(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.floatingButtonIcon}>+</Text>
        <Text style={styles.floatingButtonText}>{txt.add}</Text>
      </TouchableOpacity>

      <Modal
        visible={isFormVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsFormVisible(false)}
      >
        <AddMedicationForm
          onAdd={handleAdd}
          onCancel={() => setIsFormVisible(false)}
        />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  loadingText: { marginTop: 16, fontSize: 18, color: '#64748B', fontWeight: '500' },
  errorBanner: { backgroundColor: '#FEE2E2', borderBottomWidth: 2, borderBottomColor: '#EF4444', padding: 14, alignItems: 'center' },
  errorText: { color: '#DC2626', fontWeight: 'bold', fontSize: 16 },
  errorDismiss: { color: '#DC2626', fontSize: 12, marginTop: 4, opacity: 0.7 },
  header: { padding: SPACING.lg, paddingBottom: SPACING.sm },
  title: { fontSize: 28, fontWeight: '900', color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: '#64748B', marginTop: 4, fontWeight: '500' },
  todayBadge: {
    backgroundColor: '#F0FDF4', borderRadius: 12, padding: 12,
    marginTop: 12, borderWidth: 1, borderColor: '#BBF7D0',
  },
  todayText: { fontSize: 15, fontWeight: '800', color: '#166534', marginBottom: 6 },
  progressBar: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#10B981', borderRadius: 3 },
  listContainer: { paddingBottom: 120 },
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: SPACING.md },
  emptyText: { fontSize: 18, color: COLORS.text, fontWeight: '600' },
  emptySubtext: { fontSize: 14, color: '#94A3B8', marginTop: 6 },
  floatingButton: {
    position: 'absolute', bottom: 30, alignSelf: 'center',
    backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center',
    paddingVertical: 16, paddingHorizontal: 32, borderRadius: 30,
    shadowColor: COLORS.primaryDark, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 10,
  },
  floatingButtonIcon: { color: '#FFFFFF', fontSize: 24, fontWeight: '300', marginRight: 6 },
  floatingButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold', letterSpacing: 1 },
});
