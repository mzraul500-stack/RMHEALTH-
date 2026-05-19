/**
 * SleepSummaryCard.js — Compact sleep/rest summary for HomeScreen.
 *
 * DESIGN:
 *  - Shows: last night duration, quality emoji, and simple message.
 *  - Tapping opens full SleepModeScreen.
 *  - Returns null when SLEEP_MODE_ENABLED=false → no render, no side effects.
 *  - Sleep data is CONTEXTUAL/PREVENTIVE only. NEVER diagnostic.
 *
 * © 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
 */

import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Moon } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SPACING } from '../theme';
import { useLanguage } from '../contexts/LanguageContext';
import { useSleepData } from '../hooks/useSleepData';

/**
 * Format minutes to short display.
 */
function formatShort(minutes) {
  if (!minutes || minutes <= 0) return '--';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}min`;
  return `${h}h ${m.toString().padStart(2, '0')}min`;
}

export const SleepSummaryCard = () => {
  const { tr } = useLanguage();
  const { sleepData, isEnabled } = useSleepData();
  const navigation = useNavigation();

  // Feature disabled → render nothing (zero impact)
  if (!isEnabled) return null;

  const handlePress = () => {
    if (navigation) {
      navigation.navigate('SleepMode');
    }
  };

  return (
    <TouchableOpacity
      style={s.card}
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityLabel={tr('sleep_title')}
    >
      <View style={s.iconWrap}>
        <Moon size={20} color="#818CF8" />
      </View>
      <View style={s.content}>
        <Text style={s.title}>{tr('sleep_card_title')}</Text>
        {sleepData ? (
          <View style={s.dataRow}>
            <Text style={s.duration}>
              {formatShort(sleepData.totalMinutes)}
            </Text>
            <Text style={s.qualityEmoji}>
              {sleepData.quality === 'good' ? '🌙' : sleepData.quality === 'fair' ? '🌗' : '⚡'}
            </Text>
          </View>
        ) : (
          <Text style={s.noData}>{tr('sleep_no_data')}</Text>
        )}
      </View>
      <Text style={s.chevron}>›</Text>
    </TouchableOpacity>
  );
};

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: SPACING.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.secondary,
    letterSpacing: 0.3,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  duration: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
  },
  qualityEmoji: {
    fontSize: 14,
  },
  noData: {
    fontSize: 12,
    color: '#94A3B8',
  },
  chevron: {
    fontSize: 22,
    color: '#94A3B8',
    fontWeight: '300',
  },
});
