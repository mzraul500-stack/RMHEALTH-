/**
 * SleepModeScreen.js — Full-screen sleep/rest context view.
 *
 * DESIGN RULES:
 *  - Sleep data is CONTEXTUAL/PREVENTIVE — never diagnostic.
 *  - Does NOT modify clinical severity, CJM scores, or MedicalEngine.
 *  - Does NOT trigger emergency alerts or notifications.
 *  - Uses approved safe language only (see founder's guidelines).
 *  - User-facing text: Spanish. Code/comments/logs: English.
 *
 * © 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
 */

import React from 'react';
import {
  StyleSheet, View, Text, ScrollView, SafeAreaView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Moon, Clock, Zap, Eye, Sun, Info } from 'lucide-react-native';
import { COLORS, SPACING } from '../theme';
import { useSleepData } from '../hooks/useSleepData';
import { useLanguage } from '../contexts/LanguageContext';

// Stage type mapping from Health Connect numeric values
const STAGE_MAP = {
  0: 'unknown',
  1: 'awake',
  2: 'sleeping',
  3: 'out_of_bed',
  4: 'light',
  5: 'deep',
  6: 'rem',
};

/**
 * Format minutes into "Xh YYmin" string.
 */
function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '--';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}min`;
  return `${h}h ${m.toString().padStart(2, '0')}min`;
}

/**
 * Get quality emoji and color based on heuristic.
 */
function getQualityDisplay(quality, tr) {
  switch (quality) {
    case 'good':
      return { emoji: '🌙', label: tr('sleep_quality_good'), color: COLORS.success };
    case 'fair':
      return { emoji: '🌗', label: tr('sleep_quality_fair'), color: '#F59E0B' };
    case 'poor':
      return { emoji: '⚡', label: tr('sleep_quality_poor'), color: COLORS.error };
    default:
      return { emoji: '❓', label: '--', color: COLORS.text };
  }
}

/**
 * Get stage icon and label.
 */
function getStageInfo(stageType, tr) {
  const type = typeof stageType === 'number' ? (STAGE_MAP[stageType] || 'unknown') : stageType;
  switch (type) {
    case 'light': case '4':
      return { icon: Moon, label: tr('sleep_stages_light'), color: '#818CF8' };
    case 'deep': case '5':
      return { icon: Zap, label: tr('sleep_stages_deep'), color: '#6366F1' };
    case 'rem': case '6':
      return { icon: Eye, label: tr('sleep_stages_rem'), color: '#A78BFA' };
    case 'awake': case '1':
      return { icon: Sun, label: tr('sleep_stages_awake'), color: '#FBBF24' };
    default:
      return { icon: Moon, label: type, color: '#94A3B8' };
  }
}

export const SleepModeScreen = () => {
  const { tr } = useLanguage();
  const { sleepData, isLoading, lastSync, error, refresh, isEnabled } = useSleepData();

  // Feature disabled — should not reach this screen, but guard anyway
  if (!isEnabled) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.emptyContainer}>
          <Moon size={48} color="#94A3B8" />
          <Text style={s.emptyText}>{tr('sleep_no_data')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <Moon size={28} color="#818CF8" />
          <Text style={s.headerTitle}>{tr('sleep_title')}</Text>
        </View>

        {isLoading && !sleepData && (
          <View style={s.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        )}

        {!sleepData && !isLoading && (
          <View style={s.emptyCard}>
            <Moon size={40} color="#94A3B8" />
            <Text style={s.emptyText}>{tr('sleep_no_data')}</Text>
            <Text style={s.hcSource}>{tr('sleep_hc_source')}</Text>
            <TouchableOpacity style={s.refreshBtn} onPress={refresh}>
              <Text style={s.refreshBtnText}>↻ {tr('sleep_last_night')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {sleepData && (
          <>
            {/* Main duration card */}
            <View style={s.mainCard}>
              <Text style={s.cardLabel}>{tr('sleep_total_duration')}</Text>
              <Text style={s.durationText}>
                {formatDuration(sleepData.totalMinutes)}
              </Text>
              {(() => {
                const q = getQualityDisplay(sleepData.quality, tr);
                return (
                  <View style={s.qualityRow}>
                    <Text style={s.qualityEmoji}>{q.emoji}</Text>
                    <Text style={[s.qualityLabel, { color: q.color }]}>
                      {tr('sleep_quality')}: {q.label}
                    </Text>
                  </View>
                );
              })()}
              <Text style={s.sessionCount}>
                {sleepData.sessionCount} {tr('sleep_sessions').toLowerCase()}
              </Text>
            </View>

            {/* Sessions breakdown */}
            {sleepData.sessions && sleepData.sessions.length > 0 && (
              <View style={s.sessionsCard}>
                <Text style={s.sectionTitle}>{tr('sleep_sessions')}</Text>
                {sleepData.sessions.map((session, idx) => {
                  const startDate = new Date(session.start);
                  const endDate = new Date(session.end);
                  return (
                    <View key={idx} style={s.sessionRow}>
                      <Clock size={16} color="#818CF8" />
                      <Text style={s.sessionTime}>
                        {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {' → '}
                        {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <Text style={s.sessionDuration}>
                        {formatDuration(session.durationMinutes)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Sleep stages (if available) */}
            {sleepData.sessions?.some(s => s.stages?.length > 0) && (
              <View style={s.stagesCard}>
                <Text style={s.sectionTitle}>Fases</Text>
                {sleepData.sessions.map((session, sIdx) =>
                  session.stages?.map((stage, stIdx) => {
                    const info = getStageInfo(stage.type, tr);
                    const IconComp = info.icon;
                    const stStart = new Date(stage.startTime);
                    const stEnd = new Date(stage.endTime);
                    const stMin = Math.round((stEnd - stStart) / 60000);
                    return (
                      <View key={`${sIdx}-${stIdx}`} style={s.stageRow}>
                        <IconComp size={14} color={info.color} />
                        <Text style={[s.stageLabel, { color: info.color }]}>{info.label}</Text>
                        <Text style={s.stageDuration}>{formatDuration(stMin)}</Text>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* Source info */}
            <View style={s.sourceRow}>
              <Info size={14} color="#94A3B8" />
              <Text style={s.sourceText}>{tr('sleep_hc_source')}</Text>
            </View>
          </>
        )}

        {/* Disclaimer — always visible */}
        <View style={s.disclaimerCard}>
          <Text style={s.disclaimerText}>{tr('sleep_disclaimer')}</Text>
          <Text style={s.contextInfo}>{tr('sleep_context_info')}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl * 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.secondary,
  },

  // Loading
  loadingContainer: {
    padding: SPACING.xl,
    alignItems: 'center',
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyText: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
  },
  hcSource: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },
  refreshBtn: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
  },
  refreshBtnText: {
    fontSize: 13,
    color: '#6366F1',
    fontWeight: '600',
  },

  // Main card
  mainCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.xs,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: SPACING.md,
  },
  cardLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  durationText: {
    fontSize: 36,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  qualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  qualityEmoji: {
    fontSize: 20,
  },
  qualityLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  sessionCount: {
    fontSize: 12,
    color: '#94A3B8',
  },

  // Sessions
  sessionsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.secondary,
    marginBottom: SPACING.xs,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  sessionTime: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
  },
  sessionDuration: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },

  // Stages
  stagesCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: SPACING.md,
    gap: SPACING.xs,
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 3,
  },
  stageLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  stageDuration: {
    fontSize: 12,
    color: '#64748B',
  },

  // Source
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.xs,
  },
  sourceText: {
    fontSize: 11,
    color: '#94A3B8',
  },

  // Disclaimer
  disclaimerCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    padding: SPACING.md,
    gap: SPACING.xs,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  disclaimerText: {
    fontSize: 11,
    color: '#92400E',
    lineHeight: 16,
  },
  contextInfo: {
    fontSize: 11,
    color: '#B45309',
    fontStyle: 'italic',
  },
});
