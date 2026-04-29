import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import RMHealthAPI from '../../api/client';

const TEXTS = {
  es: {
    title: 'Mis Profesionales de Salud',
    subtitle: 'Médicos y cuidadores vinculados a tu cuenta',
    linkDoctor: 'Vincular Médico',
    enterCode: 'Ingresa el código de invitación',
    codePlaceholder: 'Ej: AB3K9X2M',
    link: 'Vincular',
    cancel: 'Cancelar',
    noLinks: 'No tienes profesionales vinculados. Solicita un código de invitación a tu médico.',
    revokeTitle: 'Revocar acceso',
    revokeMsg: 'Este profesional ya no podrá ver tus datos de salud.',
    confirm: 'Confirmar',
    active: 'Activo',
    pending: 'Pendiente',
    doctor: 'Médico',
    caregiver: 'Cuidador',
    since: 'Vinculado desde',
  },
  en: {
    title: 'My Health Professionals',
    subtitle: 'Doctors and caregivers linked to your account',
    linkDoctor: 'Link Doctor',
    enterCode: 'Enter the invitation code',
    codePlaceholder: 'Ex: AB3K9X2M',
    link: 'Link',
    cancel: 'Cancel',
    noLinks: 'No health professionals linked. Ask your doctor for an invitation code.',
    revokeTitle: 'Revoke access',
    revokeMsg: 'This professional will no longer be able to see your health data.',
    confirm: 'Confirm',
    active: 'Active',
    pending: 'Pending',
    doctor: 'Doctor',
    caregiver: 'Caregiver',
    since: 'Linked since',
  },
};

export default function MyDoctorsScreen({ navigation }) {
  const { token, user } = useAuth();
  const lang = user?.language === 'en' ? 'en' : 'es';
  const t = TEXTS[lang];

  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await RMHealthAPI.getMyDoctors(token);
      if (data.status === 'success') {
        setLinks(data.links || []);
      }
    } catch (e) {
      console.error('[MyDoctors] Load error:', e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadLinks(); }, [loadLinks]);

  const handleAcceptInvite = async () => {
    if (!inviteCode.trim()) return;
    setSubmitting(true);
    try {
      const result = await RMHealthAPI.acceptDoctorInvite(inviteCode.trim(), token);
      if (result.status === 'success') {
        Alert.alert(
          lang === 'es' ? 'Vinculado' : 'Linked',
          result.message
        );
        setShowCodeInput(false);
        setInviteCode('');
        loadLinks();
      } else {
        Alert.alert('Error', result.message || 'Error al vincular');
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = (linkId, doctorName) => {
    Alert.alert(
      t.revokeTitle,
      `${t.revokeMsg}\n\n${doctorName}`,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.confirm,
          style: 'destructive',
          onPress: async () => {
            const result = await RMHealthAPI.revokeDoctorLink(linkId, token);
            if (result.status === 'success') {
              loadLinks();
            }
          },
        },
      ]
    );
  };

  const renderLink = ({ item }) => {
    const roleLabel = item.role === 'CUIDADOR' ? t.caregiver : t.doctor;
    const statusColor = item.status === 'active' ? '#10B981' : '#F59E0B';
    const statusLabel = item.status === 'active' ? t.active : t.pending;
    const dateStr = item.accepted_at
      ? new Date(item.accepted_at).toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US')
      : '';

    return (
      <View style={styles.linkCard}>
        <View style={[styles.roleBar, { backgroundColor: item.role === 'CUIDADOR' ? '#06B6D4' : '#3B82F6' }]} />
        <View style={styles.linkContent}>
          <View style={styles.linkHeader}>
            <Text style={styles.doctorName}>{item.doctor_name}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
          <Text style={styles.roleLabel}>{roleLabel}</Text>
          {dateStr ? <Text style={styles.dateLabel}>{t.since}: {dateStr}</Text> : null}
          {item.status === 'active' && (
            <TouchableOpacity
              style={styles.revokeBtn}
              onPress={() => handleRevoke(item.link_id, item.doctor_name)}
            >
              <Text style={styles.revokeBtnText}>{t.revokeTitle}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t.title}</Text>
      <Text style={styles.subtitle}>{t.subtitle}</Text>

      {/* Invite Code Input */}
      {showCodeInput ? (
        <View style={styles.codeSection}>
          <Text style={styles.codeLabel}>{t.enterCode}</Text>
          <TextInput
            style={styles.codeInput}
            value={inviteCode}
            onChangeText={setInviteCode}
            placeholder={t.codePlaceholder}
            placeholderTextColor="#64748B"
            autoCapitalize="characters"
            maxLength={8}
          />
          <View style={styles.codeButtons}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => { setShowCodeInput(false); setInviteCode(''); }}
            >
              <Text style={styles.cancelBtnText}>{t.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.linkBtn, submitting && { opacity: 0.5 }]}
              onPress={handleAcceptInvite}
              disabled={submitting || !inviteCode.trim()}
            >
              {submitting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.linkBtnText}>{t.link}</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowCodeInput(true)}>
          <Text style={styles.addBtnText}>+ {t.linkDoctor}</Text>
        </TouchableOpacity>
      )}

      {/* Links List */}
      {loading ? (
        <ActivityIndicator size="large" color="#3B82F6" style={{ marginTop: 32 }} />
      ) : links.length === 0 ? (
        <Text style={styles.emptyText}>{t.noLinks}</Text>
      ) : (
        <FlatList
          data={links}
          keyExtractor={(item) => item.link_id}
          renderItem={renderLink}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#F1F5F9',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 20,
  },
  addBtn: {
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  addBtnText: {
    color: '#3B82F6',
    fontSize: 15,
    fontWeight: '800',
  },
  codeSection: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  codeLabel: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  codeInput: {
    backgroundColor: '#0F172A',
    borderWidth: 1.5,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 14,
    color: '#F1F5F9',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: 14,
  },
  codeButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontWeight: '700',
    fontSize: 14,
  },
  linkBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
  },
  linkBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  linkCard: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
    overflow: 'hidden',
  },
  roleBar: {
    width: 4,
  },
  linkContent: {
    flex: 1,
    padding: 16,
  },
  linkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  doctorName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F1F5F9',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  roleLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
    marginBottom: 2,
  },
  dateLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  revokeBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#EF444440',
  },
  revokeBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
    lineHeight: 22,
    paddingHorizontal: 20,
  },
});
