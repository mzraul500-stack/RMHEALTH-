import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity,
  TextInput, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS, SPACING } from '../../theme';

const PROFILE_KEY = '@rmhealth/patient_profile';
const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL
  || 'https://rmhealth-api-292048010515.us-central1.run.app/api';

/**
 * ProfileScreen — Complete Medical Profile (M3)
 *
 * 6 sections: Personal Data, Allergies, Conditions,
 * Emergency Contacts (2-5), Treating Doctor, Special Instructions.
 *
 * Data syncs with backend API and caches locally.
 *
 * Compliance: HIPAA §164.312 · NOM-024-SSA3 · NOM-004-SSA3
 * © 2025 MORALES ZEPEDA RAUL | Registro INDAUTOR: 03-2025-070109072500-01
 */
export const ProfileScreen = ({ navigation }) => {
  const { accessToken, user } = useAuth();
  const insets = useSafeAreaInsets();

  // Personal data
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [blood, setBlood] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');

  // Doctor
  const [doctorName, setDoctorName] = useState('');
  const [doctorPhone, setDoctorPhone] = useState('');
  const [doctorSpecialty, setDoctorSpecialty] = useState('');

  // Special instructions
  const [specialInstructions, setSpecialInstructions] = useState('');

  // CRUD lists from API
  const [allergies, setAllergies] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [contacts, setContacts] = useState([]);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Add-item forms
  const [newAllergy, setNewAllergy] = useState('');
  const [newAllergyType, setNewAllergyType] = useState('medication');
  const [newAllergySeverity, setNewAllergySeverity] = useState('moderate');
  const [newCondition, setNewCondition] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newContactRelation, setNewContactRelation] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');

  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

  const loadProfile = useCallback(async () => {
    try {
      // Load local cache first so we have fallback values
      const raw = await AsyncStorage.getItem(PROFILE_KEY);
      const local = raw ? JSON.parse(raw) : {};

      const res = await fetch(`${API_BASE}/profile`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) {
        const data = await res.json();
        const p = data.profile || {};
        // Only update state if API has a real value; otherwise keep local/current
        setName(p.full_name || local.name || user?.full_name || '');
        setAge(p.age ? String(p.age) : (local.age || ''));
        setBlood(p.blood_type || local.blood || '');
        setWeight(p.weight ? String(p.weight) : (local.weight || ''));
        setHeight(p.height ? String(p.height) : (local.height || ''));
        setDoctorName(p.treating_doctor_name || local.doctorName || '');
        setDoctorPhone(p.treating_doctor_phone || local.doctorPhone || '');
        setDoctorSpecialty(p.treating_doctor_specialty || local.doctorSpecialty || '');
        setSpecialInstructions(p.special_instructions || local.specialInstructions || '');
        setAllergies(data.allergies || []);
        setConditions(data.conditions || []);
        setContacts(data.emergency_contacts || []);
      } else {
        // Fallback to local only
        setName(local.name || '');
        setAge(local.age || '');
        setBlood(local.blood || '');
        setWeight(local.weight || '');
        setHeight(local.height || '');
        setDoctorName(local.doctorName || '');
        setDoctorPhone(local.doctorPhone || '');
        setDoctorSpecialty(local.doctorSpecialty || '');
        setSpecialInstructions(local.specialInstructions || '');
      }
    } catch (e) {
      console.warn('[Profile] Load failed:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, user]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Error', 'El nombre es obligatorio.'); return; }
    setIsSaving(true);
    
    // Auto-save pending items in text inputs if the user forgot to click "+ Agregar"
    if (newContactName.trim() && newContactPhone.trim() && newContactRelation.trim() && contacts.length < 5) {
      try {
        const res = await fetch(`${API_BASE}/profile/emergency-contacts`, {
          method: 'POST', headers,
          body: JSON.stringify({ name: newContactName.trim(), relationship: newContactRelation.trim(), phone: newContactPhone.trim() }),
        });
        if (res.ok) {
          const data = await res.json();
          setContacts(prev => [...prev, data.contact]);
          setNewContactName(''); setNewContactRelation(''); setNewContactPhone('');
        }
      } catch(e) {}
    }
    if (newAllergy.trim()) {
      try {
        const res = await fetch(`${API_BASE}/profile/allergies`, {
          method: 'POST', headers,
          body: JSON.stringify({ agent: newAllergy.trim(), allergy_type: 'other', severity: 'moderate' }),
        });
        if (res.ok) {
          const data = await res.json();
          setAllergies(prev => [...prev, data.allergy]);
          setNewAllergy('');
        }
      } catch(e) {}
    }
    if (newCondition.trim()) {
      try {
        const res = await fetch(`${API_BASE}/profile/conditions`, {
          method: 'POST', headers,
          body: JSON.stringify({ name: newCondition.trim(), status: 'active' }),
        });
        if (res.ok) {
          const data = await res.json();
          setConditions(prev => [...prev, data.condition]);
          setNewCondition('');
        }
      } catch(e) {}
    }

    try {
      const body = {
        full_name: name.trim(),
        age: age ? parseInt(age) : null,
        blood_type: blood.trim() || null,
        weight: weight ? parseFloat(weight) : null,
        height: height ? parseFloat(height) : null,
        treating_doctor_name: doctorName.trim() || null,
        treating_doctor_phone: doctorPhone.trim() || null,
        treating_doctor_specialty: doctorSpecialty.trim() || null,
        special_instructions: specialInstructions.trim() || null,
      };
      const res = await fetch(`${API_BASE}/profile`, { method: 'PUT', headers, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`Server: ${res.status}`);

      // Cache locally
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify({
        name, age, blood, weight, height,
        doctorName, doctorPhone, doctorSpecialty, specialInstructions,
        lastUpdated: new Date().toISOString(),
      }));
      Alert.alert('Guardado', 'Tu perfil ha sido actualizado.');
    } catch (e) {
      console.error('[Profile] Save:', e);
      Alert.alert('Error', 'No se pudieron guardar los cambios.');
    } finally { setIsSaving(false); }
  };

  // --- CRUD Handlers ---
  const addAllergy = async () => {
    if (!newAllergy.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/profile/allergies`, {
        method: 'POST', headers,
        body: JSON.stringify({ agent: newAllergy.trim(), allergy_type: newAllergyType, severity: newAllergySeverity }),
      });
      if (res.ok) {
        const data = await res.json();
        setAllergies(prev => [data.allergy, ...prev]);
        setNewAllergy('');
      }
    } catch (e) { Alert.alert('Error', 'No se pudo agregar la alergia.'); }
  };

  const removeAllergy = (id) => {
    Alert.alert('Eliminar Alergia', '¿Seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try {
          await fetch(`${API_BASE}/profile/allergies/${id}`, { method: 'DELETE', headers });
          setAllergies(prev => prev.filter(a => a.id !== id));
        } catch (e) { Alert.alert('Error', 'No se pudo eliminar.'); }
      }},
    ]);
  };

  const addCondition = async () => {
    if (!newCondition.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/profile/conditions`, {
        method: 'POST', headers,
        body: JSON.stringify({ name: newCondition.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setConditions(prev => [data.condition, ...prev]);
        setNewCondition('');
      }
    } catch (e) { Alert.alert('Error', 'No se pudo agregar.'); }
  };

  const removeCondition = (id) => {
    Alert.alert('Resolver Condición', '¿Marcar como resuelta?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Resolver', onPress: async () => {
        try {
          await fetch(`${API_BASE}/profile/conditions/${id}`, { method: 'DELETE', headers });
          setConditions(prev => prev.filter(c => c.id !== id));
        } catch (e) { Alert.alert('Error', 'No se pudo resolver.'); }
      }},
    ]);
  };

  const addContact = async () => {
    if (!newContactName.trim() || !newContactPhone.trim() || !newContactRelation.trim()) {
      Alert.alert('Error', 'Nombre, relación y teléfono son obligatorios.');
      return;
    }
    if (contacts.length >= 5) { Alert.alert('Límite', 'Máximo 5 contactos de emergencia.'); return; }
    try {
      const res = await fetch(`${API_BASE}/profile/emergency-contacts`, {
        method: 'POST', headers,
        body: JSON.stringify({ name: newContactName.trim(), relationship: newContactRelation.trim(), phone: newContactPhone.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setContacts(prev => [...prev, data.contact]);
        setNewContactName(''); setNewContactRelation(''); setNewContactPhone('');
      }
    } catch (e) { Alert.alert('Error', 'No se pudo agregar.'); }
  };

  const removeContact = (id) => {
    if (contacts.length <= 2) { Alert.alert('Mínimo', 'Necesitas al menos 2 contactos de emergencia.'); return; }
    Alert.alert('Eliminar Contacto', '¿Seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try {
          await fetch(`${API_BASE}/profile/emergency-contacts/${id}`, { method: 'DELETE', headers });
          setContacts(prev => prev.filter(c => c.id !== id));
        } catch (e) { Alert.alert('Error', 'No se pudo eliminar.'); }
      }},
    ]);
  };

  const SEVERITY_COLORS = { mild: '#22C55E', moderate: '#F59E0B', severe: '#EF4444', life_threatening: '#7C3AED' };
  const SEVERITY_LABELS = { mild: 'Leve', moderate: 'Moderada', severe: 'Severa', life_threatening: 'Amenaza vital' };
  const TYPE_LABELS = { medication: 'Medicamento', food: 'Alimento', environmental: 'Ambiental', other: 'Otro' };

  if (isLoading) {
    return <View style={s.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 30 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadProfile(); }} tintColor={COLORS.primary} />}
      >
        {/* Avatar */}
        <View style={s.avatarBox}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{name ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?'}</Text>
          </View>
          <Text style={s.userName}>{name || 'Nuevo Paciente'}</Text>
          <Text style={s.userRole}>Paciente · RMHealth v2.0</Text>
        </View>

        {/* 1. Personal Data */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Información Personal</Text>
          <View style={s.inputGroup}>
            <Text style={s.label}>NOMBRE COMPLETO *</Text>
            <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Nombre completo" placeholderTextColor="#94A3B8" />
          </View>
          <View style={s.row}>
            <View style={[s.inputGroup, { flex: 1, marginRight: 6 }]}>
              <Text style={s.label}>EDAD</Text>
              <TextInput style={s.input} value={age} onChangeText={setAge} keyboardType="numeric" placeholder="Años" placeholderTextColor="#94A3B8" maxLength={3} />
            </View>
            <View style={[s.inputGroup, { flex: 1, marginLeft: 6 }]}>
              <Text style={s.label}>TIPO SANGRE</Text>
              <TextInput style={s.input} value={blood} onChangeText={setBlood} placeholder="O+" placeholderTextColor="#94A3B8" />
            </View>
          </View>
          <View style={s.row}>
            <View style={[s.inputGroup, { flex: 1, marginRight: 6 }]}>
              <Text style={s.label}>PESO (kg)</Text>
              <TextInput style={s.input} value={weight} onChangeText={setWeight} keyboardType="numeric" placeholder="70" placeholderTextColor="#94A3B8" />
            </View>
            <View style={[s.inputGroup, { flex: 1, marginLeft: 6 }]}>
              <Text style={s.label}>ESTATURA (cm)</Text>
              <TextInput style={s.input} value={height} onChangeText={setHeight} keyboardType="numeric" placeholder="170" placeholderTextColor="#94A3B8" />
            </View>
          </View>
        </View>

        {/* 2. Allergies */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Alergias</Text>
          {allergies.map(a => (
            <View key={a.id} style={s.listItem}>
              <View style={s.listInfo}>
                <Text style={s.listName}>{a.agent}</Text>
                <View style={s.tagRow}>
                  <Text style={s.tag}>{TYPE_LABELS[a.allergy_type] || a.allergy_type}</Text>
                  <View style={[s.severityDot, { backgroundColor: SEVERITY_COLORS[a.severity] || '#94A3B8' }]} />
                  <Text style={s.tagSmall}>{SEVERITY_LABELS[a.severity] || a.severity}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => removeAllergy(a.id)} style={s.removeBtn}><Text style={s.removeTxt}>✕</Text></TouchableOpacity>
            </View>
          ))}
          <View style={s.addRow}>
            <TextInput style={[s.input, { flex: 1 }]} value={newAllergy} onChangeText={setNewAllergy} placeholder="Ej: Penicilina" placeholderTextColor="#94A3B8" />
            <TouchableOpacity style={s.addBtn} onPress={addAllergy}><Text style={s.addBtnTxt}>+ Agregar</Text></TouchableOpacity>
          </View>
        </View>

        {/* 3. Conditions */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Condiciones Médicas</Text>
          {conditions.map(c => (
            <View key={c.id} style={s.listItem}>
              <View style={s.listInfo}>
                <Text style={s.listName}>{c.name}</Text>
                <Text style={s.tagSmall}>{c.status === 'active' ? 'Activa' : 'Controlada'}</Text>
              </View>
              <TouchableOpacity onPress={() => removeCondition(c.id)} style={s.removeBtn}><Text style={s.removeTxt}>✕</Text></TouchableOpacity>
            </View>
          ))}
          <View style={s.addRow}>
            <TextInput style={[s.input, { flex: 1 }]} value={newCondition} onChangeText={setNewCondition} placeholder="Ej: Diabetes Tipo 2" placeholderTextColor="#94A3B8" />
            <TouchableOpacity style={s.addBtn} onPress={addCondition}><Text style={s.addBtnTxt}>+ Agregar</Text></TouchableOpacity>
          </View>
        </View>

        {/* 4. Emergency Contacts (2-5) */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Contactos de Emergencia</Text>
          <Text style={s.hint}>Mínimo 2, máximo 5 contactos.</Text>
          {contacts.map(c => (
            <View key={c.id} style={s.listItem}>
              <View style={s.listInfo}>
                <Text style={s.listName}>{c.name}</Text>
                <Text style={s.tagSmall}>{c.relationship} · {c.phone}</Text>
              </View>
              <TouchableOpacity onPress={() => removeContact(c.id)} style={s.removeBtn}><Text style={s.removeTxt}>✕</Text></TouchableOpacity>
            </View>
          ))}
          {contacts.length < 5 && (
            <View style={s.contactForm}>
              <TextInput style={s.input} value={newContactName} onChangeText={setNewContactName} placeholder="Nombre" placeholderTextColor="#94A3B8" />
              <View style={[s.row, { marginTop: 8 }]}>
                <TextInput style={[s.input, { flex: 1, marginRight: 6 }]} value={newContactRelation} onChangeText={setNewContactRelation} placeholder="Relación" placeholderTextColor="#94A3B8" />
                <TextInput style={[s.input, { flex: 1, marginLeft: 6 }]} value={newContactPhone} onChangeText={setNewContactPhone} placeholder="Teléfono" placeholderTextColor="#94A3B8" keyboardType="phone-pad" />
              </View>
              <TouchableOpacity style={[s.addBtn, { marginTop: 8, alignSelf: 'stretch' }]} onPress={addContact}>
                <Text style={s.addBtnTxt}>+ Agregar Contacto</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* 5. Treating Doctor */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Médico Tratante</Text>
          <TextInput style={s.input} value={doctorName} onChangeText={setDoctorName} placeholder="Nombre del médico" placeholderTextColor="#94A3B8" />
          <View style={[s.row, { marginTop: 8 }]}>
            <TextInput style={[s.input, { flex: 1, marginRight: 6 }]} value={doctorPhone} onChangeText={setDoctorPhone} placeholder="Teléfono" placeholderTextColor="#94A3B8" keyboardType="phone-pad" />
            <TextInput style={[s.input, { flex: 1, marginLeft: 6 }]} value={doctorSpecialty} onChangeText={setDoctorSpecialty} placeholder="Especialidad" placeholderTextColor="#94A3B8" />
          </View>
        </View>

        {/* 6. Special Instructions */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Instrucciones Especiales</Text>
          <Text style={s.hint}>Información crítica para paramédicos.</Text>
          <TextInput
            style={[s.input, { height: 90, textAlignVertical: 'top' }]}
            value={specialInstructions} onChangeText={setSpecialInstructions}
            placeholder="Ej: Tiene marcapasos. No administrar aspirina."
            placeholderTextColor="#94A3B8" multiline
          />
        </View>

        {/* Emergency Card Button */}
        {navigation && (
          <TouchableOpacity style={s.cardBtn} onPress={() => navigation.navigate('EmergencyCard')}>
            <Text style={s.cardBtnTxt}>Tarjeta de Emergencia</Text>
          </TouchableOpacity>
        )}

        {/* Save */}
        <TouchableOpacity style={[s.saveBtn, isSaving && s.saveBtnOff]} onPress={handleSave} disabled={isSaving}>
          {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveBtnTxt}>GUARDAR CAMBIOS</Text>}
        </TouchableOpacity>

        <Text style={s.footer}>
          RMHealth protege tus datos con cifrado de dispositivo Android.{'\n'}
          Cumplimiento: HIPAA §164.312 · NOM-024-SSA3 · NOM-004-SSA3
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 16 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  avatarBox: { alignItems: 'center', marginBottom: 20 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', elevation: 4 },
  avatarText: { fontSize: 28, fontWeight: '900', color: '#FFF' },
  userName: { fontSize: 20, fontWeight: '800', color: COLORS.secondary, marginTop: 10 },
  userRole: { fontSize: 13, color: '#64748B', marginTop: 2 },
  section: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border, elevation: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.secondary, marginBottom: 12 },
  hint: { fontSize: 12, color: '#64748B', marginBottom: 10 },
  inputGroup: { marginBottom: 10 },
  label: { fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 4, letterSpacing: 0.5 },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, padding: 12, fontSize: 15, color: COLORS.secondary },
  row: { flexDirection: 'row' },
  listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  listInfo: { flex: 1 },
  listName: { fontSize: 15, fontWeight: '700', color: COLORS.secondary },
  tagRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  tag: { fontSize: 11, color: '#64748B', marginRight: 8 },
  tagSmall: { fontSize: 11, color: '#64748B' },
  severityDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  removeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center' },
  removeTxt: { fontSize: 14, color: '#DC2626', fontWeight: '800' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  addBtn: { backgroundColor: COLORS.primary + '15', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.primary + '40' },
  addBtnTxt: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  contactForm: { marginTop: 8, padding: 12, backgroundColor: '#F0FDFA', borderRadius: 12, borderWidth: 1, borderColor: COLORS.primary + '30' },
  cardBtn: { backgroundColor: '#FEF3C7', padding: 16, borderRadius: 14, alignItems: 'center', marginBottom: 14, borderWidth: 1.5, borderColor: '#F59E0B' },
  cardBtnTxt: { fontSize: 16, fontWeight: '800', color: '#92400E' },
  saveBtn: { backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginBottom: 12, elevation: 3 },
  saveBtnOff: { opacity: 0.6 },
  saveBtnTxt: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  footer: { textAlign: 'center', fontSize: 11, color: '#94A3B8', lineHeight: 16, marginTop: 4 },
});
