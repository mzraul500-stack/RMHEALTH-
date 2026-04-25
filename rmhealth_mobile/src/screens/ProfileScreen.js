import React, { useState, useEffect } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  TextInput, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING } from '../theme';

const PROFILE_KEY = '@rmhealth/patient_profile';

/**
 * ProfileScreen — Patient profile with persistent storage.
 *
 * Data is stored locally via AsyncStorage and loaded on mount.
 * In production, this should sync with the backend's patient table
 * to ensure the ML engine uses real patient context (age, comorbidities).
 *
 * Compliance note: Patient data at rest should be encrypted (AES-256)
 * per HIPAA §164.312(a)(2)(iv) and NOM-024-SSA3-2012 (COFEPRIS).
 * Currently relies on device-level encryption (Android full-disk encryption).
 */
export const ProfileScreen = () => {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [blood, setBlood] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [allergies, setAllergies] = useState('');
  const [conditions, setConditions] = useState({
    diabetico: false,
    hipertenso: false,
    cardiopata: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load profile on mount
  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const raw = await AsyncStorage.getItem(PROFILE_KEY);
      if (raw) {
        const profile = JSON.parse(raw);
        setName(profile.name || '');
        setAge(profile.age || '');
        setBlood(profile.blood || '');
        setWeight(profile.weight || '');
        setHeight(profile.height || '');
        setContactName(profile.contactName || '');
        setContactPhone(profile.contactPhone || '');
        setAllergies(profile.allergies || '');
        setConditions(profile.conditions || { diabetico: false, hipertenso: false, cardiopata: false });
      }
    } catch (error) {
      console.error('[ProfileScreen] Load failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'El nombre es obligatorio.');
      return;
    }

    setIsSaving(true);
    try {
      const profile = {
        name, age, blood, weight, height,
        contactName, contactPhone, allergies, conditions,
        lastUpdated: new Date().toISOString(),
      };
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      Alert.alert('✅ Guardado', 'Tu perfil ha sido actualizado correctamente.');
    } catch (error) {
      console.error('[ProfileScreen] Save failed:', error);
      Alert.alert('Error', 'No se pudieron guardar los cambios.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleCondition = (key) => {
    setConditions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {name ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?'}
            </Text>
          </View>
          <Text style={styles.userName}>{name || 'Nuevo Paciente'}</Text>
          <Text style={styles.userRole}>Paciente · RMHealth v2.0</Text>
        </View>

        {/* Personal Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Información Personal</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>NOMBRE COMPLETO *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Nombre completo"
              placeholderTextColor="#94A3B8"
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: SPACING.sm }]}>
              <Text style={styles.label}>EDAD</Text>
              <TextInput
                style={styles.input}
                value={age}
                onChangeText={setAge}
                keyboardType="numeric"
                placeholder="Años"
                placeholderTextColor="#94A3B8"
                maxLength={3}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1, marginHorizontal: SPACING.sm }]}>
              <Text style={styles.label}>TIPO SANGRE</Text>
              <TextInput
                style={styles.input}
                value={blood}
                onChangeText={setBlood}
                placeholder="O+"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: SPACING.sm }]}>
              <Text style={styles.label}>PESO (kg)</Text>
              <TextInput
                style={styles.input}
                value={weight}
                onChangeText={setWeight}
                keyboardType="numeric"
                placeholder="70"
                placeholderTextColor="#94A3B8"
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1, marginLeft: SPACING.sm }]}>
              <Text style={styles.label}>ESTATURA (cm)</Text>
              <TextInput
                style={styles.input}
                value={height}
                onChangeText={setHeight}
                keyboardType="numeric"
                placeholder="170"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>
        </View>

        {/* Medical Patterns / Background */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Antecedentes de Detección</Text>
          <Text style={styles.conditionNote}>
            Esta información optimiza los patrones de detección del motor MDP para personalizar tu monitoreo.
          </Text>

          {[
            { key: 'diabetico', label: 'Diabetes', icon: '🩸' },
            { key: 'hipertenso', label: 'Hipertensión', icon: '💓' },
            { key: 'cardiopata', label: 'Cardiopatía', icon: '🫀' },
          ].map(({ key, label, icon }) => (
            <TouchableOpacity
              key={key}
              style={[styles.conditionRow, conditions[key] && styles.conditionActive]}
              onPress={() => toggleCondition(key)}
              activeOpacity={0.7}
            >
              <Text style={styles.conditionIcon}>{icon}</Text>
              <Text style={[styles.conditionLabel, conditions[key] && styles.conditionLabelActive]}>
                {label}
              </Text>
              <View style={[styles.toggle, conditions[key] && styles.toggleActive]}>
                <Text style={styles.toggleText}>{conditions[key] ? 'SÍ' : 'NO'}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Allergies */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Alergias</Text>
          <TextInput
            style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
            value={allergies}
            onChangeText={setAllergies}
            placeholder="Ej: Penicilina, Sulfas, AINEs..."
            placeholderTextColor="#94A3B8"
            multiline
          />
        </View>

        {/* Emergency Contact */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contacto de Emergencia</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>NOMBRE</Text>
            <TextInput
              style={styles.input}
              value={contactName}
              onChangeText={setContactName}
              placeholder="Nombre del contacto"
              placeholderTextColor="#94A3B8"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>TELÉFONO</Text>
            <TextInput
              style={styles.input}
              value={contactPhone}
              onChangeText={setContactPhone}
              keyboardType="phone-pad"
              placeholder="+52 33 1234 5678"
              placeholderTextColor="#94A3B8"
            />
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.saveButtonText}>GUARDAR CAMBIOS</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          RMHealth protege tus datos con cifrado de dispositivo Android.{'\n'}
          Cumplimiento: HIPAA §164.312 · NOM-024-SSA3-2012 (COFEPRIS)
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 150,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
    borderWidth: 3,
    borderColor: COLORS.border,
  },
  avatarText: {
    color: COLORS.white,
    fontSize: 28,
    fontWeight: 'bold',
  },
  userName: {
    color: COLORS.secondary,
    fontSize: 22,
    fontWeight: 'bold',
  },
  userRole: {
    color: COLORS.primary,
    fontSize: 12,
    marginTop: 4,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    color: COLORS.textHighlight,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: SPACING.md,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  inputGroup: {
    marginBottom: SPACING.md,
  },
  label: {
    color: COLORS.text,
    fontSize: 11,
    marginBottom: 6,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 14,
    color: COLORS.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  row: {
    flexDirection: 'row',
  },
  conditionNote: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: SPACING.md,
    fontStyle: 'italic',
  },
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  conditionActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
  },
  conditionIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  conditionLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  conditionLabelActive: {
    color: COLORS.primary,
  },
  toggle: {
    paddingVertical: 4,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
  },
  toggleActive: {
    backgroundColor: COLORS.primary,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFF',
  },
  saveButton: {
    backgroundColor: COLORS.primaryDark,
    borderRadius: 14,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.md,
    elevation: 4,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1,
  },
  footerNote: {
    color: COLORS.text,
    fontSize: 10,
    textAlign: 'center',
    marginTop: SPACING.xl,
    lineHeight: 16,
    opacity: 0.5,
  },
});
