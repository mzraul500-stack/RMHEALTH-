import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { MedicationCard } from '../components/MedicationCard';
import { AddMedicationForm } from '../components/AddMedicationForm';
import { AdherenceDashboard } from '../components/AdherenceDashboard';
import { WeeklyChart } from '../components/WeeklyChart';
import { useMedications } from '../hooks/useMedications';
import { COLORS, SPACING } from '../../../theme';

export function MedicationScreen() {
  const {
    medications,
    isLoading,
    error,
    toggleTaken,
    addMedication,
    deleteMedication,
    clearError,
  } = useMedications();

  const [isFormVisible, setIsFormVisible] = useState(false);

  const handleAdd = (newMed) => {
    addMedication(newMed);
    setIsFormVisible(false);
  };

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Cargando medicamentos...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Error banner — surfaces storage-full or corruption alerts */}
      {error && (
        <TouchableOpacity style={styles.errorBanner} onPress={clearError}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorDismiss}>Tocar para cerrar</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={medications}
        keyExtractor={item => item.id}
        ListHeaderComponent={() => (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>💊 Mis Medicamentos</Text>
              <Text style={styles.subtitle}>
                Toca una pastilla para marcarla como tomada
              </Text>
            </View>
            <AdherenceDashboard medications={medications} />
            <WeeklyChart />
          </>
        )}
        renderItem={({ item }) => (
          <MedicationCard
            medication={item}
            onToggleTaken={toggleTaken}
            onDelete={deleteMedication}
          />
        )}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>No tienes medicamentos registrados</Text>
            <Text style={styles.emptySubtext}>
              Presiona el botón + AGREGAR para comenzar
            </Text>
          </View>
        }
      />

      {/* Floating Add Button */}
      <TouchableOpacity
        style={styles.floatingButton}
        onPress={() => setIsFormVisible(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.floatingButtonIcon}>+</Text>
        <Text style={styles.floatingButtonText}>AGREGAR</Text>
      </TouchableOpacity>

      {/* Add Medication Modal */}
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
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    color: '#64748B',
    fontWeight: '500',
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    borderBottomWidth: 2,
    borderBottomColor: '#EF4444',
    padding: 14,
    alignItems: 'center',
  },
  errorText: {
    color: '#DC2626',
    fontWeight: 'bold',
    fontSize: 16,
  },
  errorDismiss: {
    color: '#DC2626',
    fontSize: 12,
    marginTop: 4,
    opacity: 0.7,
  },
  header: {
    padding: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '500',
  },
  listContainer: {
    paddingBottom: 120,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: SPACING.md,
  },
  emptyText: {
    fontSize: 18,
    color: COLORS.text,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 6,
  },
  floatingButton: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  floatingButtonIcon: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '300',
    marginRight: 6,
  },
  floatingButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
