import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet, Animated } from 'react-native';
import { COLORS, SPACING } from '../theme';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * Tactical Panic Button for emergencies (with pulse animation)
 */
export const EmergencyButton = ({ onPress }) => {
  const { language } = useLanguage();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const TEXTS = {
    es: { label: 'SOS', sub: 'MANTENER 5s' },
    en: { label: 'SOS', sub: 'HOLD 5s' },
  };
  const txt = TEXTS[language] || TEXTS.es;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1, duration: 1500, useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1, duration: 1500, useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  return (
    <TouchableOpacity 
      style={styles.container}
      onLongPress={onPress} 
      delayLongPress={5000} 
      activeOpacity={0.7}
      accessibilityLabel={language === 'es' ? 'Botón de emergencia, mantener 5 segundos' : 'Emergency button, hold 5 seconds'}
      accessibilityRole="button"
    >
      <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]} />
      <Animated.View style={[styles.pulseRingInner, { transform: [{ scale: pulseAnim }] }]} />
      
      <TouchableOpacity 
        style={styles.button} 
        onLongPress={onPress} 
        delayLongPress={5000} 
        activeOpacity={0.9}
        disabled={true}
      >
        <Text style={styles.text}>{txt.label}</Text>
        <Text style={styles.subtext}>{txt.sub}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center', alignItems: 'center',
    marginTop: SPACING.lg, width: 200, height: 200,
  },
  pulseRing: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  pulseRingInner: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
  },
  button: {
    backgroundColor: COLORS.error, width: 140, height: 140, borderRadius: 70,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 4, borderColor: 'rgba(255,255,255,0.4)',
    elevation: 15, shadowColor: COLORS.error,
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.6, shadowRadius: 20,
  },
  text: {
    color: '#FFF', fontSize: 38, fontWeight: '900', letterSpacing: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4,
  },
  subtext: {
    color: '#FFF', fontSize: 10, textAlign: 'center',
    paddingHorizontal: 10, marginTop: 2, fontWeight: 'bold', opacity: 0.9,
  },
});
