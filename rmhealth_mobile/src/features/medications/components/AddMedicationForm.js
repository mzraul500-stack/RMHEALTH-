import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';

export function AddMedicationForm({ onAdd, onCancel }) {
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [time, setTime] = useState('');

  const handleSave = () => {
    if (!name.trim()) return;
    onAdd({
      id: Date.now().toString(),
      name,
      dosage: dosage || 'No especificada',
      frequency: frequency || 'Sin frecuencia',
      time: time || 'Sin horario',
      taken: false,
    });
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.formCard}>
        <Text style={styles.title}>Nuevo Medicamento</Text>
        
        <Text style={styles.label}>Nombre de la pastilla</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Losartán"
          value={name}
          onChangeText={setName}
          placeholderTextColor="#999"
        />

        <Text style={styles.label}>Dosis</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. 50 mg"
          value={dosage}
          onChangeText={setDosage}
          placeholderTextColor="#999"
        />

        <Text style={styles.label}>Frecuencia</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Cada 12 horas"
          value={frequency}
          onChangeText={setFrequency}
          placeholderTextColor="#999"
        />

        <Text style={styles.label}>Primer horario</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. 08:00 AM"
          value={time}
          onChangeText={setTime}
          placeholderTextColor="#999"
        />

        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.button, styles.saveButton, !name.trim() && styles.buttonDisabled]} 
            onPress={handleSave}
            disabled={!name.trim()}
          >
            <Text style={styles.saveButtonText}>Guardar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 20,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 20,
    textAlign: 'center',
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: '#444444',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 16,
    fontSize: 20,
    color: '#333',
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  button: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
    marginRight: 10,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  saveButton: {
    backgroundColor: '#1E88E5',
    marginLeft: 10,
  },
  buttonDisabled: {
    backgroundColor: '#A0C8F0',
  },
  cancelButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#666666',
  },
  saveButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
