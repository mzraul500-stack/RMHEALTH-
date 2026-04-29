import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { COLORS } from '../../../theme';
import { useLanguage } from '../../../contexts/LanguageContext';

const MED_TYPES = [
  { key: 'pill', icon: '💊', es: 'Pastilla', en: 'Pill' },
  { key: 'injection', icon: '💉', es: 'Inyectable', en: 'Injectable' },
  { key: 'liquid', icon: '🧴', es: 'Jarabe', en: 'Liquid' },
  { key: 'patch', icon: '🩹', es: 'Parche', en: 'Patch' },
  { key: 'inhaler', icon: '🌬️', es: 'Inhalador', en: 'Inhaler' },
];

const TEXTS = {
  es: {
    titleNew: 'Nuevo Medicamento',
    titleEdit: 'Editar Medicamento',
    name: 'Nombre',
    namePh: 'Ej. Losartán',
    dosage: 'Dosis',
    dosagePh: 'Ej. 50 mg',
    frequency: 'Frecuencia',
    frequencyPh: 'Ej. Cada 12 horas',
    time: 'Horario',
    timePh: 'Ej. 08:00 AM',
    type: 'Tipo',
    doctor: 'Médico prescriptor',
    doctorPh: 'Ej. Dr. García',
    notes: 'Notas',
    notesPh: 'Instrucciones especiales...',
    cancel: 'Cancelar',
    save: 'Guardar',
    add: 'Agregar',
  },
  en: {
    titleNew: 'New Medication',
    titleEdit: 'Edit Medication',
    name: 'Name',
    namePh: 'E.g. Losartan',
    dosage: 'Dosage',
    dosagePh: 'E.g. 50 mg',
    frequency: 'Frequency',
    frequencyPh: 'E.g. Every 12 hours',
    time: 'Schedule',
    timePh: 'E.g. 08:00 AM',
    type: 'Type',
    doctor: 'Prescribing doctor',
    doctorPh: 'E.g. Dr. Smith',
    notes: 'Notes',
    notesPh: 'Special instructions...',
    cancel: 'Cancel',
    save: 'Save',
    add: 'Add',
  },
};

export function AddMedicationForm({ onAdd, onCancel, initialData = null }) {
  const { language } = useLanguage();
  const txt = TEXTS[language] || TEXTS.es;

  const [name, setName] = useState(initialData?.name || '');
  const [dosage, setDosage] = useState(initialData?.dosage || '');
  const [frequency, setFrequency] = useState(initialData?.frequency || '');
  const [time, setTime] = useState(initialData?.schedule_time || initialData?.time || '');
  const [medType, setMedType] = useState(initialData?.med_type || 'pill');
  const [doctor, setDoctor] = useState(initialData?.doctor || '');
  const [notes, setNotes] = useState(initialData?.notes || '');

  const isEditing = !!initialData;

  const handleSave = () => {
    if (!name.trim()) return;
    
    const medData = {
      name: name.trim(),
      dosage: dosage || null,
      frequency: frequency || null,
      schedule_time: time || null,
      med_type: medType,
      doctor: doctor || null,
      notes: notes || null,
    };

    if (isEditing) {
      onAdd({ ...initialData, ...medData });
    } else {
      onAdd({
        id: Date.now().toString(),
        ...medData,
        taken: false,
      });
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.formCard}>
        <Text style={styles.title}>
          {isEditing ? txt.titleEdit : txt.titleNew}
        </Text>
        
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Medication Type Selector */}
          <Text style={styles.label}>{txt.type}</Text>
          <View style={styles.typeRow}>
            {MED_TYPES.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[styles.typePill, medType === t.key && styles.typePillActive]}
                onPress={() => setMedType(t.key)}
              >
                <Text style={styles.typeIcon}>{t.icon}</Text>
                <Text style={[styles.typeText, medType === t.key && styles.typeTextActive]}>
                  {t[language] || t.es}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>{txt.name}</Text>
          <TextInput
            style={styles.input}
            placeholder={txt.namePh}
            value={name}
            onChangeText={setName}
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.label}>{txt.dosage}</Text>
          <TextInput
            style={styles.input}
            placeholder={txt.dosagePh}
            value={dosage}
            onChangeText={setDosage}
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.label}>{txt.frequency}</Text>
          <TextInput
            style={styles.input}
            placeholder={txt.frequencyPh}
            value={frequency}
            onChangeText={setFrequency}
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.label}>{txt.time}</Text>
          <TextInput
            style={styles.input}
            placeholder={txt.timePh}
            value={time}
            onChangeText={setTime}
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.label}>{txt.doctor}</Text>
          <TextInput
            style={styles.input}
            placeholder={txt.doctorPh}
            value={doctor}
            onChangeText={setDoctor}
            placeholderTextColor="#94A3B8"
          />

          <Text style={styles.label}>{txt.notes}</Text>
          <TextInput
            style={[styles.input, styles.inputMulti]}
            placeholder={txt.notesPh}
            value={notes}
            onChangeText={setNotes}
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={3}
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>{txt.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.button, styles.saveButton, !name.trim() && styles.buttonDisabled]} 
              onPress={handleSave}
              disabled={!name.trim()}
            >
              <Text style={styles.saveButtonText}>
                {isEditing ? txt.save : txt.add}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 20,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1B4F72',
    marginBottom: 20,
    textAlign: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    color: '#1E293B',
    marginBottom: 16,
    fontWeight: '600',
  },
  inputMulti: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  typePillActive: {
    backgroundColor: '#E0F2F1',
    borderColor: '#3BAFAA',
  },
  typeIcon: {
    fontSize: 18,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  typeTextActive: {
    color: '#3BAFAA',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  saveButton: {
    backgroundColor: '#3BAFAA',
  },
  buttonDisabled: {
    backgroundColor: '#94A3B8',
    opacity: 0.5,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#64748B',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
