/**
 * EmergencyCardScreen — QR-based Personal Information Card (M3)
 *
 * Generates a temporary public URL (24h) with user wellness data.
 * Contacts can scan QR without needing login.
 *
 * © 2025 MORALES ZEPEDA RAUL | Registro INDAUTOR: 03-2025-070109072500-01
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Share,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../../theme';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL
  || 'https://rmhealth-api-292048010515.us-central1.run.app/api';

export function EmergencyCardScreen() {
  const { accessToken, user } = useAuth();
  const insets = useSafeAreaInsets();
  const [cardUrl, setCardUrl] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    // Load profile summary
    fetch(`${API_BASE}/profile`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(r => r.json())
      .then(data => setProfile(data))
      .catch(() => {});
  }, [accessToken]);

  const generateCard = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/profile/emergency-card`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Error: ${res.status}`);
      const data = await res.json();
      setCardUrl(data.card_url);
      setExpiresAt(data.expires_at);
    } catch (e) {
      Alert.alert('Error', 'No se pudo generar la tarjeta.');
    } finally { setLoading(false); }
  };

  const shareCard = async () => {
    if (!cardUrl) return;
    try {
      await Share.share({
        message: `⚠️ Tarjeta de Información Personal RMHealth\n\nEscanea o abre este enlace para ver datos de seguridad:\n${cardUrl}\n\nVálida por 24 horas.`,
        url: cardUrl,
      });
    } catch (e) {}
  };

  const p = profile?.profile || {};
  const allergies = profile?.allergies || [];
  const conditions = profile?.conditions || [];
  const contacts = profile?.emergency_contacts || [];

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
      {/* Card Preview */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.cardIcon}>⚠️</Text>
          <Text style={s.cardTitle}>INFORMACIÓN PERSONAL</Text>
          <Text style={s.cardSubtitle}>RMHealth Info Card</Text>
        </View>

        <View style={s.cardBody}>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Usuario</Text>
            <Text style={s.infoValue}>{p.full_name || 'Sin nombre'}</Text>
          </View>
          {p.blood_type && (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Tipo de Sangre</Text>
              <View style={s.bloodBadge}><Text style={s.bloodText}>{p.blood_type}</Text></View>
            </View>
          )}
          {p.age && (
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>Edad</Text>
              <Text style={s.infoValue}>{p.age} años</Text>
            </View>
          )}
        </View>

        {/* Allergies */}
        {allergies.length > 0 && (
          <View style={s.cardSection}>
            <Text style={s.cardSectionTitle}>ALERGIAS</Text>
            {allergies.map((a, i) => (
              <Text key={i} style={s.cardItem}>• {a.agent} ({a.severity})</Text>
            ))}
          </View>
        )}

        {/* Conditions */}
        {conditions.length > 0 && (
          <View style={s.cardSection}>
            <Text style={s.cardSectionTitle}>PERFIL DE SALUD</Text>
            {conditions.map((c, i) => (
              <Text key={i} style={s.cardItem}>• {c.name}</Text>
            ))}
          </View>
        )}

        {/* Contacts */}
        {contacts.length > 0 && (
          <View style={s.cardSection}>
            <Text style={s.cardSectionTitle}>📞 CONTACTOS</Text>
            {contacts.map((c, i) => (
              <Text key={i} style={s.cardItem}>• {c.name} ({c.relationship}): {c.phone}</Text>
            ))}
          </View>
        )}
      </View>

      {/* QR Section */}
      {cardUrl ? (
        <View style={s.qrSection}>
          <Text style={s.qrTitle}>Escanea para acceso de seguridad</Text>
          <View style={s.qrBox}>
            <QRCode value={cardUrl} size={200} backgroundColor="#FFF" color="#1B4F72" />
          </View>
          <Text style={s.qrExpires}>
            Válido hasta: {new Date(expiresAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
          </Text>
          <TouchableOpacity style={s.shareBtn} onPress={shareCard}>
            <Text style={s.shareBtnTxt}>📤 Compartir Enlace</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.regenerateBtn} onPress={generateCard}>
            <Text style={s.regenerateBtnTxt}>🔄 Generar Nuevo QR</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={s.generateBtn} onPress={generateCard} disabled={loading}>
          {loading ? <ActivityIndicator color="#FFF" /> : (
            <Text style={s.generateBtnTxt}>⚠️ Generar Tarjeta Personal</Text>
          )}
        </TouchableOpacity>
      )}

      <Text style={s.disclaimer}>
        Esta tarjeta es válida por 24 horas y proporciona acceso de solo lectura a datos del perfil.
        RMHealth es una herramienta preventiva. No constituye diagnóstico ni tratamiento.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  card: { backgroundColor: '#FFF', borderRadius: 20, overflow: 'hidden', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, marginBottom: 20 },
  cardHeader: { backgroundColor: '#DC2626', paddingVertical: 20, alignItems: 'center' },
  cardIcon: { fontSize: 40 },
  cardTitle: { fontSize: 20, fontWeight: '900', color: '#FFF', letterSpacing: 2, marginTop: 4 },
  cardSubtitle: { fontSize: 12, color: '#FECACA', marginTop: 2 },
  cardBody: { padding: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  infoLabel: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  infoValue: { fontSize: 15, color: COLORS.secondary, fontWeight: '700' },
  bloodBadge: { backgroundColor: '#DC2626', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 },
  bloodText: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  cardSection: { paddingHorizontal: 16, paddingBottom: 12 },
  cardSectionTitle: { fontSize: 12, fontWeight: '800', color: '#64748B', letterSpacing: 1, marginBottom: 6 },
  cardItem: { fontSize: 14, color: COLORS.secondary, lineHeight: 22 },
  qrSection: { alignItems: 'center', marginBottom: 20 },
  qrTitle: { fontSize: 14, fontWeight: '700', color: COLORS.secondary, marginBottom: 12 },
  qrBox: { padding: 20, backgroundColor: '#FFF', borderRadius: 16, elevation: 3 },
  qrExpires: { fontSize: 12, color: '#64748B', marginTop: 12 },
  shareBtn: { backgroundColor: COLORS.primary, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 14, marginTop: 16 },
  shareBtnTxt: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  regenerateBtn: { marginTop: 10, padding: 10 },
  regenerateBtnTxt: { fontSize: 13, color: COLORS.primary, fontWeight: '700' },
  generateBtn: { backgroundColor: '#DC2626', paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginBottom: 16, elevation: 3 },
  generateBtnTxt: { color: '#FFF', fontSize: 17, fontWeight: '900' },
  disclaimer: { fontSize: 11, color: '#94A3B8', textAlign: 'center', lineHeight: 16 },
});
