/**
 * CalendarMonthView — Reusable monthly calendar grid component.
 *
 * DESIGN RULES:
 *  - Purely visual / UI — no diagnostic logic.
 *  - Color-coded dots for different data types.
 *  - Adult-friendly: large touch targets (>= 44x44), readable text (>= 13px).
 *  - Syncs with device local timezone via new Date().
 *
 * Props:
 *  - markedDates: { '2026-05-19': { dots: [{ color, key }], data: any } }
 *  - onSelectDate(dateStr): callback when a day cell is tapped
 *  - selectedDate: string ISO date currently selected
 *  - accentColor: brand color for selected highlight (default: COLORS.primary)
 *  - language: 'es' | 'en' (default: 'es')
 *
 * © 2025-2026 Morales Zepeda Raúl | INDAUTOR 03-2025-070109072500-01
 */

import React, { useState, useMemo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { COLORS } from '../theme';

const DAY_LABELS = {
  es: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

const MONTH_LABELS = {
  es: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
       'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June',
       'July', 'August', 'September', 'October', 'November', 'December'],
};

/**
 * Generate the calendar grid for a given year/month.
 * Returns an array of weeks, each containing 7 day objects (or null for empty cells).
 */
function buildCalendarGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay(); // 0=Sun
  const totalDays = lastDay.getDate();

  const cells = [];
  // Leading empty cells
  for (let i = 0; i < startDow; i++) cells.push(null);
  // Day cells
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  // Trailing empty cells to complete last week
  while (cells.length % 7 !== 0) cells.push(null);

  // Split into weeks
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

function padDate(year, month, day) {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export const CalendarMonthView = ({
  markedDates = {},
  onSelectDate,
  selectedDate,
  accentColor = COLORS.primary,
  language = 'es',
}) => {
  const today = new Date();
  const todayStr = padDate(today.getFullYear(), today.getMonth(), today.getDate());

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const weeks = useMemo(
    () => buildCalendarGrid(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const dayLabels = DAY_LABELS[language] || DAY_LABELS.es;
  const monthLabels = MONTH_LABELS[language] || MONTH_LABELS.es;
  const monthTitle = `${monthLabels[viewMonth]} ${viewYear}`;

  const goBack = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const goForward = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  return (
    <View style={cs.card}>
      {/* Month navigation */}
      <View style={cs.navRow}>
        <TouchableOpacity onPress={goBack} style={cs.navBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ChevronLeft size={22} color="#64748B" />
        </TouchableOpacity>
        <Text style={cs.monthTitle}>{monthTitle}</Text>
        <TouchableOpacity onPress={goForward} style={cs.navBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ChevronRight size={22} color="#64748B" />
        </TouchableOpacity>
      </View>

      {/* Day-of-week headers */}
      <View style={cs.weekRow}>
        {dayLabels.map((label, i) => (
          <View key={i} style={cs.dayHeaderCell}>
            <Text style={cs.dayHeaderText}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
      {weeks.map((week, wi) => (
        <View key={wi} style={cs.weekRow}>
          {week.map((day, di) => {
            if (day === null) {
              return <View key={di} style={cs.dayCell} />;
            }

            const dateStr = padDate(viewYear, viewMonth, day);
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const markData = markedDates[dateStr];
            const dots = markData?.dots || [];

            return (
              <TouchableOpacity
                key={di}
                style={[
                  cs.dayCell,
                  isToday && cs.todayCell,
                  isSelected && { backgroundColor: accentColor + '20' },
                ]}
                onPress={() => onSelectDate?.(dateStr)}
                activeOpacity={0.6}
              >
                <Text style={[
                  cs.dayNumber,
                  isToday && cs.todayNumber,
                  isSelected && { color: accentColor, fontWeight: '900' },
                ]}>
                  {day}
                </Text>
                {dots.length > 0 && (
                  <View style={cs.dotRow}>
                    {dots.slice(0, 3).map((dot, idx) => (
                      <View key={idx} style={[cs.dot, { backgroundColor: dot.color }]} />
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
};

const cs = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text || '#1E293B',
    textAlign: 'center',
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  dayHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: 4,
    borderRadius: 10,
    marginVertical: 1,
    marginHorizontal: 1,
  },
  todayCell: {
    borderWidth: 1.5,
    borderColor: COLORS.primary || '#1B7A6E',
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  todayNumber: {
    fontWeight: '900',
    color: COLORS.primary || '#1B7A6E',
  },
  dotRow: {
    flexDirection: 'row',
    marginTop: 2,
    gap: 3,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
