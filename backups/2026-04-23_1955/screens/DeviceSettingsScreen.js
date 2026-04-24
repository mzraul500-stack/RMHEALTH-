import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { COLORS, SPACING } from '../theme';
import { useLanguage } from '../contexts/LanguageContext';

const SUPPORTED_DEVICES = [
  {
    id: 'samsung_watch',
    name: 'Samsung Galaxy Watch',
    sdk: 'Health Connect',
    platform: 'Android',
    status: 'available',
    icon: '⌚'
  },
  {
    id: 'wear_os',
    name: 'Google Pixel Watch',
    sdk: 'Health Connect',
    platform: 'Android',
    status: 'available',
    icon: '⌚'
  },
  {
    id: 'rmhealth_wearable',
    name: 'RMHealth Brazalete',
    sdk: 'RMHealth SDK',
    platform: 'BLE / Cellular',
    status: 'coming_soon',
    icon: '🔒'
  }
];

const TEXTS = {
  es: {
    title: 'Configuración de Dispositivos',
    subtitle: 'Selecciona el reloj que usarás para enviar signos vitales a RmHealth. Requiere el dispositivo físico.',
    available: 'DISPONIBLE',
    selected: 'SELECCIONADO',
    coming_soon: 'PRÓXIMAMENTE',
    not_connected: 'Sin dispositivo conectado',
    info_title: '¿Por qué vincular un reloj?',
    info_text: 'El protocolo RmHealth utiliza los sensores del reloj para monitorear tus signos vitales de forma continua y detectar anomalías automáticamente.',
    manual_note: 'Actualmente estás usando ingreso manual de signos vitales. Conecta un reloj para activar el monitoreo continuo.',
  },
  en: {
    title: 'Device Settings',
    subtitle: 'Select the watch you will use to send vital signs to RmHealth. Requires the physical device.',
    available: 'AVAILABLE',
    selected: 'SELECTED',
    coming_soon: 'COMING SOON',
    not_connected: 'No device connected',
    info_title: 'Why connect a watch?',
    info_text: 'The RmHealth protocol uses the watch sensors to continuously monitor your vital signs and automatically detect anomalies.',
    manual_note: 'You are currently using manual vital signs entry. Connect a watch to enable continuous monitoring.',
  }
};

export const DeviceSettingsScreen = () => {
  const { language } = useLanguage();
  const txt = TEXTS[language] || TEXTS.es;
  const [selectedDevice, setSelectedDevice] = useState(null);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>{txt.title}</Text>
        <Text style={styles.subtitle}>{txt.subtitle}</Text>

        {/* Manual mode indicator */}
        <View style={styles.manualBanner}>
          <Text style={styles.manualIcon}>✍️</Text>
          <Text style={styles.manualText}>{txt.manual_note}</Text>
        </View>

        {SUPPORTED_DEVICES.map((device) => (
          <TouchableOpacity 
            key={device.id} 
            style={[
              styles.deviceCard, 
              selectedDevice === device.id && styles.selectedCard,
              device.status === 'coming_soon' && styles.disabledCard
            ]}
            onPress={() => device.status === 'available' && setSelectedDevice(device.id)}
            disabled={device.status === 'coming_soon'}
          >
            <View style={styles.iconContainer}>
              <Text style={styles.deviceIcon}>{device.icon}</Text>
            </View>
            <View style={styles.deviceInfo}>
              <Text style={styles.deviceName}>{device.name}</Text>
              <Text style={styles.deviceSdk}>SDK: {device.sdk}</Text>
              <Text style={styles.devicePlatform}>{device.platform}</Text>
            </View>
            {device.status === 'available' ? (
              <View style={[styles.statusBadge, selectedDevice === device.id && styles.activeBadge]}>
                <Text style={[styles.statusText, selectedDevice === device.id && styles.activeText]}>
                  {selectedDevice === device.id ? txt.selected : txt.available}
                </Text>
              </View>
            ) : (
              <View style={styles.soonBadge}>
                <Text style={styles.soonText}>{txt.coming_soon}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>{txt.info_title}</Text>
          <Text style={styles.infoText}>{txt.info_text}</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { padding: SPACING.lg },
  title: { color: COLORS.secondary, fontSize: 24, fontWeight: 'bold', marginBottom: SPACING.xs },
  subtitle: { color: COLORS.text, fontSize: 14, marginBottom: SPACING.lg, lineHeight: 20 },
  manualBanner: {
    flexDirection: 'row', backgroundColor: '#FEF3C7', borderRadius: 12,
    padding: SPACING.md, marginBottom: SPACING.lg, alignItems: 'center',
    borderWidth: 1, borderColor: '#F59E0B',
  },
  manualIcon: { fontSize: 20, marginRight: 10 },
  manualText: { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 18 },
  deviceCard: {
    backgroundColor: COLORS.surface, borderRadius: 16, padding: SPACING.md,
    flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border, elevation: 2,
  },
  selectedCard: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: 'rgba(59,175,170,0.05)' },
  disabledCard: { opacity: 0.5 },
  iconContainer: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: '#E2E8F0',
    justifyContent: 'center', alignItems: 'center', marginRight: SPACING.md,
  },
  deviceIcon: { fontSize: 24 },
  deviceInfo: { flex: 1 },
  deviceName: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  deviceSdk: { color: COLORS.text, fontSize: 12, marginTop: 2 },
  devicePlatform: { color: COLORS.primary, fontSize: 10, fontWeight: 'bold', marginTop: 4 },
  statusBadge: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: '#E2E8F0',
  },
  activeBadge: { backgroundColor: COLORS.primary },
  statusText: { color: COLORS.text, fontSize: 10, fontWeight: 'bold' },
  activeText: { color: '#FFF' },
  soonBadge: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  soonText: { color: '#94A3B8', fontSize: 8, fontWeight: 'bold' },
  infoBox: {
    marginTop: SPACING.xl, padding: SPACING.md, borderRadius: 12,
    backgroundColor: 'rgba(59,175,170,0.08)', borderLeftWidth: 4, borderLeftColor: COLORS.primary,
  },
  infoTitle: { color: COLORS.primary, fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  infoText: { color: COLORS.text, fontSize: 12, lineHeight: 18 },
});
