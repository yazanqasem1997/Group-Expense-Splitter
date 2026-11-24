import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Keyboard, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { normalizeDateOnly } from "@/utils/format";

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

function isoToDayMonYy(iso: string): string {
  if (!iso || iso.length < 10) return "";
  const [y, m, d] = iso.split("-");
  const month = MONTHS[parseInt(m, 10) - 1]?.slice(0, 3) ?? m;
  return `${parseInt(d, 10)} ${month} ${y.slice(-2)}`;
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
  /** Optional inclusive ISO date bounds for selectable calendar days. */
  minDate?: string;
  maxDate?: string;
  /** Render only a calendar button, useful when the date belongs to a nearby card. */
  compact?: boolean;
  /** Render the compact control as an icon-only button. */
  iconOnly?: boolean;
  /** Allow the selected date to be removed from the calendar. */
  allowClear?: boolean;
  /** When true, close this calendar (used to enforce only one open at a time) */
  forceClose?: boolean;
  onOpen?: () => void;
}

// ── component ───────────────────────────────────────────────────────────────

export function DatePickerField({
  label,
  value,
  onChange,
  colors,
  minDate,
  maxDate,
  compact = false,
  iconOnly = false,
  allowClear = true,
  forceClose,
  onOpen,
}: Props) {
  const normalizedValue = normalizeDateOnly(value);
  const [text, setText] = useState(() => isoToDdMmYyyy(normalizedValue));
  const [open, setOpen] = useState(false);

  const today = new Date();
  const initDate = normalizedValue ? new Date(`${normalizedValue}T00:00:00`) : today;
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  // Sync text when value changes from outside
  useEffect(() => {
    const nextValue = normalizeDateOnly(value);
    setText(isoToDdMmYyyy(nextValue));
    if (nextValue) {
      const d = new Date(`${nextValue}T00:00:00`);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    } else {
      setViewYear(today.getFullYear());
      setViewMonth(today.getMonth());
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
      if (iso && isSelectableIso(iso)) {
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
    if (!isSelectableIso(iso)) return;
    onChange(iso);
    setText(`${dd}-${mm}-${viewYear}`);
    setOpen(false);
  }

  function closeCalendar() {
    setOpen(false);
  }

  function prevMonth() {
    const nextMonth = viewMonth === 0 ? 11 : viewMonth - 1;
    const nextYear = viewMonth === 0 ? viewYear - 1 : viewYear;
    if (!isMonthInBounds(nextYear, nextMonth)) return;
    setViewMonth(nextMonth);
    setViewYear(nextYear);
  }
  function nextMonth() {
    const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
    const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
    if (!isMonthInBounds(nextYear, nextMonth)) return;
    setViewMonth(nextMonth);
    setViewYear(nextYear);
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
  if (normalizedValue) {
    const d = new Date(`${normalizedValue}T00:00:00`);
    selDay = d.getDate();
    selMonth = d.getMonth();
    selYear = d.getFullYear();
  }
  const isSelectedInView = selDay !== null && selMonth === viewMonth && selYear === viewYear;
  const todayDay = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();
  const compactLabel = normalizedValue
    ? isoToDayMonYy(normalizedValue)
    : "Select date";
  const minDateTs = minDate ? new Date(`${minDate}T00:00:00`).getTime() : -Infinity;
  const maxDateTs = maxDate ? new Date(`${maxDate}T00:00:00`).getTime() : Infinity;

  function isSelectableIso(iso: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) return false;
    const [, year, month, day] = match;
    const date = new Date(`${iso}T00:00:00`);
    const ts = date.getTime();
    return (
      !Number.isNaN(ts) &&
      date.getFullYear() === Number(year) &&
      date.getMonth() + 1 === Number(month) &&
      date.getDate() === Number(day) &&
      ts >= minDateTs &&
      ts <= maxDateTs
    );
  }

  function isMonthInBounds(year: number, month: number): boolean {
    const monthStart = new Date(year, month, 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(year, month + 1, 0);
    monthEnd.setHours(0, 0, 0, 0);
    return monthEnd.getTime() >= minDateTs && monthStart.getTime() <= maxDateTs;
  }

  function renderCalendar(inModal = false) {
    return (
      <View style={[
        s.calendar,
        compact && !inModal && s.compactCalendar,
        inModal && s.modalCalendar,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}>

        {/* Month navigation */}
        <View style={s.monthNav}>
          <Pressable
            onPress={prevMonth}
            style={s.navBtn}
            hitSlop={8}
            disabled={!isMonthInBounds(viewMonth === 0 ? viewYear - 1 : viewYear, viewMonth === 0 ? 11 : viewMonth - 1)}
           accessibilityRole="button" accessibilityLabel="Back">
            <Feather
              name="chevron-left"
              size={18}
              color={isMonthInBounds(viewMonth === 0 ? viewYear - 1 : viewYear, viewMonth === 0 ? 11 : viewMonth - 1) ? colors.text : colors.textTertiary}
            />
          </Pressable>
          <Text style={[s.monthLabel, { color: colors.text }]}>
            {MONTHS[viewMonth]} {viewYear}
          </Text>
          <Pressable
            onPress={nextMonth}
            style={s.navBtn}
            hitSlop={8}
            disabled={!isMonthInBounds(viewMonth === 11 ? viewYear + 1 : viewYear, viewMonth === 11 ? 0 : viewMonth + 1)}
          >
            <Feather
              name="chevron-right"
              size={18}
              color={isMonthInBounds(viewMonth === 11 ? viewYear + 1 : viewYear, viewMonth === 11 ? 0 : viewMonth + 1) ? colors.text : colors.textTertiary}
            />
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
              const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isSelectable = isSelectableIso(iso);
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
                    !isSelectable && { opacity: 0.35 },
                    pressed && isSelectable && !isSelected && { opacity: 0.6 },
                  ]}
                  disabled={!isSelectable}
                  onPress={() => handleDayPress(day)}
                >
                  <Text style={[
                    s.dayText,
                    {
                      color: isSelected
                        ? "#fff"
                        : !isSelectable
                        ? colors.textTertiary
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
        {allowClear && value !== "" && (
          <Pressable
            onPress={() => { onChange(""); setText(""); setOpen(false); }}
            style={[s.clearBtn, { borderTopColor: colors.border }]}
          >
            <Text style={[s.clearText, { color: colors.textTertiary }]}>Clear date</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={compact ? s.compactRoot : undefined}>
      {!compact && <Text style={[s.label, { color: colors.textSecondary }]}>{label}</Text>}

      {compact ? (
        <Pressable
          onPress={() => {
            Keyboard.dismiss();
            if (open) setOpen(false);
            else openCalendar();
          }}
          accessibilityRole="button"
            accessibilityLabel={`${label}${value ? `, ${compactLabel}` : ""}`}
          style={[
            s.compactCalBtn,
            iconOnly && s.compactIconBtn,
            { backgroundColor: open ? colors.primaryLight : colors.inputBg, borderColor: open ? colors.primary : colors.border },
          ]}
        >
          <Feather name="calendar" size={17} color={open ? colors.primary : colors.textSecondary} />
          {!iconOnly && (
            <Text style={[s.compactCalText, { color: colors.text }]}>
              {compactLabel}
            </Text>
          )}
        </Pressable>
      ) : (
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
              Keyboard.dismiss();
              if (open) setOpen(false);
              else openCalendar();
            }}
            style={[s.calBtn, { backgroundColor: open ? colors.primaryLight : "transparent" }]}
           accessibilityRole="button" accessibilityLabel="Choose date">
            <Feather name="calendar" size={16} color={open ? colors.primary : colors.textTertiary} />
          </Pressable>
        </View>
      )}

      {/* Calendar */}
      {compact ? (
        <Modal
          visible={open}
          transparent
          animationType="fade"
          onRequestClose={closeCalendar}
        >
          <Pressable style={s.calendarBackdrop} onPress={closeCalendar}>
            <Pressable style={s.modalCalendarSurface} onPress={event => event.stopPropagation()}>
              {renderCalendar(true)}
            </Pressable>
          </Pressable>
        </Modal>
      ) : open ? renderCalendar() : null}
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
  compactRoot: {
    zIndex: 20,
    elevation: 20,
    alignItems: "flex-end",
  },
  compactCalBtn: {
    minWidth: 116,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  compactIconBtn: {
    minWidth: 32,
    width: 32,
    paddingHorizontal: 0,
    gap: 0,
    borderWidth: 1.5,
  },
  compactCalText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  compactCalendar: {
    position: "absolute",
    top: 42,
    right: 0,
    width: 282,
    zIndex: 30,
    elevation: 30,
  },
  calendarBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.28)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCalendarSurface: {
    width: "100%",
    maxWidth: 320,
  },
  modalCalendar: {
    position: "relative",
    top: 0,
    right: 0,
    width: "100%",
  },
});
