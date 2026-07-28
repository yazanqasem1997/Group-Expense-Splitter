import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── helpers ────────────────────────────────────────────────────────────────

function isoToDdMmYyyy(iso: string): string {
  if (!iso || iso.length < 10) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function ddMmYyyyToIso(s: string): string | null {
  if (s.length !== 10) return null;
  const parts = s.split("-");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (d.length !== 2 || m.length !== 2 || y.length !== 4) return null;
  const dd = parseInt(d, 10);
  const mm = parseInt(m, 10);
  const yyyy = parseInt(y, 10);
  if (isNaN(dd) || isNaN(mm) || isNaN(yyyy)) return null;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1900) return null;
  return `${y}-${m}-${d}`;
}

/** Strip non-digits then insert dashes: "25122024" → "25-12-2024" */
function autoFormat(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

// ── types ───────────────────────────────────────────────────────────────────

interface Colors {
  text: string;
  textSecondary: string;
  textTertiary: string;
  surface: string;
  inputBg: string;
  border: string;
  primary: string;
  primaryLight: string;
}

interface Props {
  label: string;
  /** ISO YYYY-MM-DD or "" */
  value: string;
  onChange: (iso: string) => void;
  colors: Colors;
  /** When true, close this calendar (used to enforce only one open at a time) */
  forceClose?: boolean;
  onOpen?: () => void;
}

// ── component ───────────────────────────────────────────────────────────────

export function DatePickerField({ label, value, onChange, colors, forceClose, onOpen }: Props) {
  const [text, setText] = useState(() => isoToDdMmYyyy(value));
  const [open, setOpen] = useState(false);

  const today = new Date();
  const initDate = value ? new Date(value + "T00:00:00") : today;
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  // Sync text when value changes from outside
  useEffect(() => {
    setText(isoToDdMmYyyy(value));
    if (value) {
      const d = new Date(value + "T00:00:00");
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [value]);

  // Let parent force-close this calendar
  useEffect(() => {
    if (forceClose) setOpen(false);
  }, [forceClose]);

  function openCalendar() {
    onOpen?.();
    setOpen(true);
  }

  function handleTextChange(raw: string) {
    const formatted = autoFormat(raw);
    setText(formatted);
    if (formatted.length === 10) {
      const iso = ddMmYyyyToIso(formatted);
      if (iso) {
        onChange(iso);
        const d = new Date(iso + "T00:00:00");
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    } else if (formatted.length === 0) {
      onChange("");
    }
  }

  function handleDayPress(day: number) {
    const mm = String(viewMonth + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    const iso = `${viewYear}-${mm}-${dd}`;
    onChange(iso);
    setText(`${dd}-${mm}-${viewYear}`);
    setOpen(false);
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  // Build calendar grid
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  // Selected day
  let selDay: number | null = null;
  let selMonth: number | null = null;
  let selYear: number | null = null;
  if (value) {
    const d = new Date(value + "T00:00:00");
    selDay = d.getDate();
    selMonth = d.getMonth();
    selYear = d.getFullYear();
  }
  const isSelectedInView = selDay !== null && selMonth === viewMonth && selYear === viewYear;
  const todayDay = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();

  return (
    <View>
      <Text style={[s.label, { color: colors.textSecondary }]}>{label}</Text>

      {/* Input row */}
      <View style={[
        s.inputRow,
        { borderColor: open ? colors.primary : colors.border, backgroundColor: colors.inputBg },
      ]}>
        <TextInput
          style={[s.textInput, { color: colors.text }]}
          value={text}
          onChangeText={handleTextChange}
          placeholder="DD-MM-YYYY"
          placeholderTextColor={colors.textTertiary}
          keyboardType="number-pad"
          maxLength={10}
          onFocus={openCalendar}
        />
        <Pressable
          onPress={() => {
            if (open) setOpen(false);
            else openCalendar();
          }}
          style={[s.calBtn, { backgroundColor: open ? colors.primaryLight : "transparent" }]}
        >
          <Feather name="calendar" size={16} color={open ? colors.primary : colors.textTertiary} />
        </Pressable>
      </View>

      {/* Calendar */}
      {open && (
        <View style={[s.calendar, { backgroundColor: colors.surface, borderColor: colors.border }]}>

          {/* Month navigation */}
          <View style={s.monthNav}>
            <Pressable onPress={prevMonth} style={s.navBtn} hitSlop={8}>
              <Feather name="chevron-left" size={18} color={colors.text} />
            </Pressable>
            <Text style={[s.monthLabel, { color: colors.text }]}>
              {MONTHS[viewMonth]} {viewYear}
            </Text>
            <Pressable onPress={nextMonth} style={s.navBtn} hitSlop={8}>
              <Feather name="chevron-right" size={18} color={colors.text} />
            </Pressable>
          </View>

          {/* Weekday headers */}
          <View style={s.weekRow}>
            {WEEKDAYS.map(d => (
              <Text key={d} style={[s.weekDay, { color: colors.textTertiary }]}>{d}</Text>
            ))}
          </View>

          {/* Day grid */}
          {rows.map((row, ri) => (
            <View key={ri} style={s.weekRow}>
              {row.map((day, di) => {
                if (day === null) return <View key={di} style={s.dayCell} />;
                const isSelected = isSelectedInView && day === selDay;
                const isToday =
                  day === todayDay && viewMonth === todayMonth && viewYear === todayYear;
                return (
                  <Pressable
                    key={di}
                    style={({ pressed }) => [
                      s.dayCell,
                      isSelected && { backgroundColor: colors.primary, borderRadius: 20 },
                      !isSelected && isToday && {
                        borderWidth: 1.5,
                        borderColor: colors.primary,
                        borderRadius: 20,
                      },
                      pressed && !isSelected && { opacity: 0.6 },
                    ]}
                    onPress={() => handleDayPress(day)}
                  >
                    <Text style={[
                      s.dayText,
                      {
                        color: isSelected
                          ? "#fff"
                          : isToday
                          ? colors.primary
                          : colors.text,
                        fontFamily: isSelected || isToday
                          ? "Inter_600SemiBold"
                          : "Inter_400Regular",
                      },
                    ]}>
                      {day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}

          {/* Clear button */}
          {value !== "" && (
            <Pressable
              onPress={() => { onChange(""); setText(""); setOpen(false); }}
              style={[s.clearBtn, { borderTopColor: colors.border }]}
            >
              <Text style={[s.clearText, { color: colors.textTertiary }]}>Clear date</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  label: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 12,
    paddingRight: 4,
    height: 44,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  calBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  calendar: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  navBtn: {
    padding: 4,
  },
  monthLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 2,
  },
  weekDay: {
    width: 34,
    textAlign: "center",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    paddingVertical: 3,
  },
  dayCell: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  dayText: {
    fontSize: 13,
  },
  clearBtn: {
    marginTop: 8,
    borderTopWidth: 1,
    paddingTop: 8,
    alignItems: "center",
  },
  clearText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
});
