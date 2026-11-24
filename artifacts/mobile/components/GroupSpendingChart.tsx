import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path, Rect, Text as SvgText } from "react-native-svg";

import { getCategoryConfig } from "@/components/CategoryIcon";
import { DatePickerField } from "@/components/DatePickerField";
import { ITEMIZATION_CATEGORIES, ITEMIZATION_LABELS, categoryShares, mainItemizationCategory } from "@/utils/spendingCategories";

export type SpendingExpense = {
  categoryBreakdown?: Record<string, number> | null;
  timestamp: number;
  amount: number;
  currency: string;
  category: string;
  description?: string;
  paidById: string;
  splits?: { memberId: string; amount: number }[];
};

export type ChartMember = { id: string; label: string; color: string };

export type Grouping = "week" | "month";
export type ChartType = "pie" | "line";
export type ChartDimension = "category" | "person";
type DateRange = { start: number; end: number };

interface GroupSpendingChartProps {
  expenses: SpendingExpense[];
  members: ChartMember[];
  targetCurrency: string;
  convertAmount: (amount: number, fromCurrency: string, toCurrency: string) => number;
  width: number;
  height?: number;
  textColor?: string;
  gridColor?: string;
  legendTextColor?: string;
  inputBackgroundColor?: string;
  primaryLightColor?: string;
  cardBackgroundColor?: string;
  accentColor?: string;
  emptyText?: string;
  dismissSignal?: number;
  formatValue?: (value: number) => string;
}

const PL = 62;
const PR = 8;
const PT = 10;
const PB = 26;
const TOOLTIP_WIDTH = 180;
const TOTAL_SERIES_KEY = "__total__";
const EMPTY_HIDDEN_SERIES = new Set<string>();
// Keep the chart colorful when expenses fall into the catch-all category.
// Grey remains a last-resort fallback for malformed/custom color values, not a
// normal category color.
const SHOW_PIE_LEADERS = false as boolean;
const MISCELLANEOUS_CHART_COLOR = "#0891B2";
type Bucket = { start: number; end: number; isMajor: boolean };
type Series = { key: string; label: string; color: string; values: number[] };
type Bounds = {
  buckets: Bucket[];
  grouping: Grouping;
  series: Series[];
  totalPerBucket: number[];
  maxY: number;
  ySteps: number[];
};

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function dateOnlyToTimestamp(value: string): number {
  const ts = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(ts) ? NaN : ts;
}
function timestampToDateOnly(ts: number): string {
  const d = new Date(ts);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}
function dateRangeLabel(range: DateRange): string {
  const start = new Date(range.start);
  const end = new Date(range.end);
  const startLabel = start.toLocaleDateString("default", { month: "short", day: "numeric", year: "numeric" });
  const endLabel = end.toLocaleDateString("default", { month: "short", day: "numeric", year: "numeric" });
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}
function startOfMonth(ts: number): number {
  const d = new Date(ts);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function endOfMonth(ts: number): number {
  return addMonths(startOfMonth(ts), 1) - 1;
}
function addDays(ts: number, n: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}
function addMonths(ts: number, n: number): number {
  const d = new Date(ts);
  d.setMonth(d.getMonth() + n);
  return d.getTime();
}
/** Monday 00:00 of the week containing ts. */
function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts));
  const dow = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diffToMonday);
  return d.getTime();
}
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sliceLabelColor(color: string): string {
  const match = color.match(/^#([0-9a-f]{6})$/i);
  if (!match) return "#FFFFFF";
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.62 ? "#14202B" : "#FFFFFF";
}

function chartCategoryColor(category: string): string {
  return category === "other"
    ? MISCELLANEOUS_CHART_COLOR
    : getCategoryConfig(category).color;
}

function percentageLabel(value: number, total: number): string {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  if (percentage > 0 && percentage < 1) return "<1%";
  return `${Math.round(percentage)}%`;
}

function slightlyDarkerColor(color: string): string {
  const hex = color.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return color;
  const channels = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  return `#${channels.map(channel => Math.max(0, Math.round(channel * 0.82)).toString(16).padStart(2, "0")).join("")}`;
}

/** Days between two dates spanning ts range, inclusive. */
function daySpan(minTs: number, maxTs: number): number {
  return Math.round((startOfDay(maxTs) - startOfDay(minTs)) / (24 * 60 * 60 * 1000)) + 1;
}

export function autoGroupingFor(minTs: number, maxTs: number): Grouping {
  const span = daySpan(minTs, maxTs);
  // Six months is represented as the maximum 183-day interval so the
  // automatic view stays weekly through the full 1–6 month range.
  if (span <= 183) return "week";
  return "month";
}

function defaultDateRange(minTs: number, maxTs: number): DateRange {
  const start = startOfDay(minTs);
  const end = startOfDay(maxTs);
  if (start === end) {
    const weekStart = startOfWeek(start);
    return { start: weekStart, end: addDays(weekStart, 6) };
  }
  return { start, end };
}

function buildBuckets(range: DateRange, grouping: Grouping): Bucket[] {
  const buckets: Bucket[] = [];
  const SAFETY = 400;
  if (grouping === "week") {
    let cursor = startOfWeek(range.start);
    const rangeEnd = startOfWeek(range.end);
    while (cursor <= rangeEnd && buckets.length < SAFETY) {
      buckets.push({ start: cursor, end: addDays(cursor, 7) - 1, isMajor: true });
      cursor = addDays(cursor, 7);
    }
  } else {
    let cursor = startOfMonth(range.start);
    const rangeEnd = startOfMonth(range.end);
    while (cursor <= rangeEnd && buckets.length < SAFETY) {
      buckets.push({ start: cursor, end: endOfMonth(cursor), isMajor: true });
      cursor = addMonths(cursor, 1);
    }
  }
  return buckets;
}

function bucketLabel(bucket: Bucket, grouping: Grouping, multiYear: boolean): string {
  const d = new Date(bucket.start);
  if (grouping === "month") {
    const month = d.toLocaleString("default", { month: "short" });
    return multiYear ? `${month} '${String(d.getFullYear()).slice(2)}` : month;
  }
  const month = d.toLocaleString("default", { month: "short" });
  return multiYear ? `${d.getDate()} ${month} '${String(d.getFullYear()).slice(2)}` : `${d.getDate()} ${month}`;
}

function periodRangeLabel(bucket: Bucket, grouping: Grouping): string {
  const start = new Date(bucket.start);
  if (grouping === "month") {
    return start.toLocaleDateString("default", { month: "long", year: "numeric" });
  }
  if (grouping === "week") {
    const end = new Date(bucket.end);
    const startStr = start.toLocaleDateString("default", { day: "numeric", month: "short" });
    const endStr = end.toLocaleDateString("default", { day: "numeric", month: "short", year: "numeric" });
    return `${startStr}–${endStr}`;
  }
  return start.toLocaleDateString("default", { day: "numeric", month: "short", year: "numeric" });
}

function useChartData(
  expenses: SpendingExpense[],
  members: ChartMember[],
  dimension: ChartDimension,
  targetCurrency: string,
  convertAmount: (a: number, f: string, t: string) => number,
  grouping: Grouping,
  range: DateRange,
  hidden: Set<string>,
): Bounds | null {
  return useMemo(() => {
    if (expenses.length === 0) return null;
    const buckets = buildBuckets(range, grouping);
    if (buckets.length === 0) return null;
    const rangeEndExclusive = addDays(range.end, 1);
    const inRangeExpenses = expenses.filter(e => e.timestamp >= range.start && e.timestamp < rangeEndExclusive);

    let seriesDefs: { key: string; label: string; color: string }[];

    if (dimension === "person") {
      const present = new Set<string>();
      inRangeExpenses.forEach(e => {
        (e.splits ?? []).forEach(split => present.add(split.memberId));
      });
      seriesDefs = members.filter(m => present.has(m.id)).map(m => ({ key: m.id, label: m.label, color: m.color }));
    } else {
      const present = new Set<string>();
      inRangeExpenses.forEach(e => categoryShares(e.category, e.description, e.categoryBreakdown).forEach(share => present.add(share.category)));
      seriesDefs = ITEMIZATION_CATEGORIES.filter(c => present.has(c)).map(cat => ({
        key: cat,
        label: ITEMIZATION_LABELS[cat] ?? "Miscellaneous",
        color: chartCategoryColor(cat),
      }));
    }

    const series: Series[] = seriesDefs.map(s => ({ ...s, values: new Array(buckets.length).fill(0) }));
    const seriesIndex = new Map<string, number>(seriesDefs.map((s, i) => [s.key, i]));

    inRangeExpenses.forEach(e => {
      const bucketI = buckets.findIndex(b => e.timestamp >= b.start && e.timestamp <= b.end);
      if (bucketI === -1) return;
      if (dimension === "person") {
        (e.splits ?? []).forEach(split => {
          const si = seriesIndex.get(split.memberId);
          if (si === undefined) return;
          series[si].values[bucketI] += convertAmount(split.amount, e.currency, targetCurrency);
        });
        return;
      }
      const converted = convertAmount(e.amount, e.currency, targetCurrency);
      categoryShares(e.category, e.description, e.categoryBreakdown).forEach(({ category, fraction }) => {
        const si = seriesIndex.get(category);
        if (si !== undefined) series[si].values[bucketI] += converted * fraction;
      });
    });

    const visible = series.filter(s => !hidden.has(s.key));
    const totalPerBucket = buckets.map((_, i) => visible.reduce((sum, s) => sum + s.values[i], 0));

    const rawMax = Math.max(...totalPerBucket, 1);
    const maxY = rawMax * 1.1;
    const rawStep = rawMax / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 1))));
    const step = Math.ceil(rawStep / magnitude) * magnitude || 1;
    const ySteps = [0, 1, 2, 3, 4].map(i => i * step).filter(v => v <= maxY);

    return { buckets, grouping, series, totalPerBucket, maxY, ySteps };
  }, [expenses, members, dimension, targetCurrency, convertAmount, grouping, range, hidden]);
}

function polarToCartesian(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  const radians = ((angle - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

function pieSlicePath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

function PieChartCanvas({
  data,
  hidden,
  dismissSignal = 0,
  plotWidth,
  height,
  textColor,
  formatValue,
}: {
  data: Bounds;
  hidden: Set<string>;
  dismissSignal?: number;
  plotWidth: number;
  height: number;
  textColor: string;
  formatValue: (value: number) => string;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const visible = data.series
    .filter(s => !hidden.has(s.key))
    .map(seriesItem => ({
      series: seriesItem,
      total: seriesItem.values.reduce((sum, value) => sum + value, 0),
    }))
    .sort((a, b) => b.total - a.total);
  const totals = visible.map(item => item.total);
  const total = totals.reduce((sum, value) => sum + value, 0);
  const centerX = plotWidth / 2;
  const hasTinySlices = total > 0 && visible.some(item => (item.total / total) * 100 < 3);
  const tinyLabelColor = slightlyDarkerColor(textColor);
  const radius = Math.max(
    1,
    Math.min(plotWidth * (hasTinySlices ? 0.37 : 0.42), height * (hasTinySlices ? 0.44 : 0.48)),
  );
  // Leave a clear callout lane above the pie. This prevents tiny-slice labels
  // from being forced back onto the slice when the leader line reaches the top.
  const centerY = Math.min(height * 0.54, height - radius - 12);
  const selected = selectedKey ? visible.find(item => item.series.key === selectedKey) : undefined;

  useEffect(() => {
    if (selectedKey && !visible.some(item => item.series.key === selectedKey)) {
      setSelectedKey(null);
    }
  }, [selectedKey, visible]);

  useEffect(() => {
    setSelectedKey(null);
  }, [dismissSignal]);

  if (total <= 0) {
    return (
      <View style={{ width: plotWidth, height, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: textColor, fontSize: 12 }}>No visible data</Text>
      </View>
    );
  }

  const safeMargin = 8;
  const textHalfWidth = 16;
  const minLabelGap = 28;
  let startAngle = 0;
  const slices = visible.map(({ series, total: sliceValue }) => {
    const endAngle = startAngle + (sliceValue / total) * 360;
    const sliceStart = startAngle;
    startAngle = endAngle;
    const percentage = (sliceValue / total) * 100;
    const displayPercentage = Math.round(percentage);
    const midAngle = sliceStart + (endAngle - sliceStart) / 2;
    const isTiny = percentage > 0 && percentage < 3;
    const labelRadius = displayPercentage === 20 ? radius * 0.58 : radius * 0.68;
    let labelPoint = polarToCartesian(centerX, centerY, labelRadius, midAngle);
    let leaderLine: { x1: number; y1: number; bendX: number; x2: number; y2: number } | null = null;
    let labelAnchor: "start" | "middle" | "end" = "middle";
    let isRight = true;
    let isTop = false;
    if (isTiny) {
      const leaderStart = polarToCartesian(centerX, centerY, radius * 0.98, midAngle);
      const leaderRadial = polarToCartesian(centerX, centerY, radius + 12, midAngle);
      isRight = leaderRadial.x >= centerX;
      isTop = leaderRadial.y < centerY - radius * 0.45;
      labelAnchor = isTop ? "middle" : isRight ? "start" : "end";
      const minX = safeMargin + (isRight ? 0 : textHalfWidth * 2);
      const maxX = plotWidth - safeMargin - (isRight ? textHalfWidth * 2 : 0);
      const outsideX = isTop
        ? Math.min(Math.max(leaderRadial.x, safeMargin + textHalfWidth), plotWidth - safeMargin - textHalfWidth)
        : isRight
          ? Math.min(leaderRadial.x + 16, maxX)
          : Math.max(leaderRadial.x - 16, minX);
      const bendX = isTop
        ? outsideX - (isRight ? 8 : -8)
        : isRight
          ? Math.min(leaderRadial.x + 10, maxX)
          : Math.max(leaderRadial.x - 10, minX);
      const clampedY = isTop
        ? Math.max(safeMargin + 8, centerY - radius - 18)
        : Math.min(Math.max(leaderRadial.y, safeMargin + 8), height - safeMargin - 8);
      labelPoint = { x: outsideX, y: clampedY };
      leaderLine = { x1: leaderStart.x, y1: leaderStart.y, bendX, x2: outsideX, y2: clampedY };
    }
    return {
      series,
      sliceValue,
      sliceStart,
      endAngle,
      percentage,
      isTiny,
      isRight,
      isTop,
      labelPoint,
      leaderLine,
      labelAnchor,
    };
  });

  // Tiny slices get outward leader-line labels, which can land close together when
  // several small slices sit near the same side of the pie. Push overlapping labels
  // apart vertically (per side) so their text never touches, then re-clamp into the
  // safe drawing area and keep each leader line anchored to its final label.
  const topGroup = slices
    .filter(s => s.isTiny && s.isTop)
    .sort((a, b) => a.labelPoint.x - b.labelPoint.x);
  for (let i = 1; i < topGroup.length; i++) {
    const previous = topGroup[i - 1];
    const current = topGroup[i];
    if (current.labelPoint.x < previous.labelPoint.x + minLabelGap) {
      current.labelPoint = { x: previous.labelPoint.x + minLabelGap, y: current.labelPoint.y };
    }
  }
  if (topGroup.length > 0) {
    const minX = safeMargin + textHalfWidth;
    const maxX = plotWidth - safeMargin - textHalfWidth;
    const overflow = topGroup[topGroup.length - 1].labelPoint.x - maxX;
    if (overflow > 0) {
      topGroup.forEach(item => {
        item.labelPoint = { x: item.labelPoint.x - overflow, y: item.labelPoint.y };
      });
    }
    const underflow = minX - topGroup[0].labelPoint.x;
    if (underflow > 0) {
      topGroup.forEach(item => {
        item.labelPoint = { x: item.labelPoint.x + underflow, y: item.labelPoint.y };
      });
    }
    topGroup.forEach(item => {
      item.labelAnchor = "middle";
      if (item.leaderLine) {
        item.leaderLine = {
          ...item.leaderLine,
          bendX: item.labelPoint.x - (item.isRight ? 8 : -8),
          x2: item.labelPoint.x,
          y2: item.labelPoint.y,
        };
      }
    });
  }

  (["left", "right"] as const).forEach(side => {
    const group = slices
      .filter(s => s.isTiny && !s.isTop && (side === "right" ? s.isRight : !s.isRight))
      .sort((a, b) => a.labelPoint.y - b.labelPoint.y);
    for (let i = 1; i < group.length; i++) {
      const prev = group[i - 1];
      const current = group[i];
      const minY = prev.labelPoint.y + minLabelGap;
      if (current.labelPoint.y < minY) {
        current.labelPoint = { x: current.labelPoint.x, y: minY };
      }
    }
    // Re-clamp after spacing so pushed-down labels stay inside the safe area, then
    // pull any that overflowed back up while preserving the minimum gap.
    for (let i = group.length - 1; i >= 0; i--) {
      const maxY = height - safeMargin - 8;
      if (group[i].labelPoint.y > maxY) {
        group[i].labelPoint = { x: group[i].labelPoint.x, y: maxY };
        if (i > 0 && group[i - 1].labelPoint.y > group[i].labelPoint.y - minLabelGap) {
          group[i - 1].labelPoint = { x: group[i - 1].labelPoint.x, y: group[i].labelPoint.y - minLabelGap };
        }
      }
      if (group[i].leaderLine) {
        group[i].leaderLine = { ...group[i].leaderLine!, x2: group[i].labelPoint.x, y2: group[i].labelPoint.y };
      }
    }
  });

  return (
    <View style={{ width: plotWidth, alignItems: "center" }}>
      <Svg width={plotWidth} height={height}>
        {slices.map(
          ({ series, sliceStart, endAngle }) => {
            const isSelected = selectedKey === series.key;
            const sliceStroke = isSelected ? sliceLabelColor(series.color) : "#FFFFFF";
            return (
              <React.Fragment key={series.key}>
                {visible.length === 1 ? (
                  <Circle
                    cx={centerX}
                    cy={centerY}
                    r={radius}
                    fill={series.color}
                    opacity={isSelected ? 0.82 : 1}
                    stroke={isSelected ? sliceStroke : textColor}
                    strokeWidth={isSelected ? 3 : 1.5}
                    onPress={() => setSelectedKey(series.key)}
                  />
                ) : (
                  <Path
                    d={pieSlicePath(centerX, centerY, radius, sliceStart, endAngle)}
                    fill={series.color}
                    opacity={isSelected ? 0.82 : 1}
                    stroke={sliceStroke}
                    strokeWidth={isSelected ? 3 : 1.5}
                    onPress={() => setSelectedKey(series.key)}
                  />
                )}
              </React.Fragment>
            );
          }
        )}
        {SHOW_PIE_LEADERS && slices.map(({ series, isTiny, labelPoint, leaderLine, labelAnchor }) =>
          leaderLine ? (
            <Path
              key={`leader-${series.key}`}
              d={`M ${leaderLine.x1} ${leaderLine.y1} L ${leaderLine.bendX} ${
                labelAnchor === "middle" ? labelPoint.y + 8 : labelPoint.y
              } L ${
                labelAnchor === "start" ? labelPoint.x - 6 : labelAnchor === "end" ? labelPoint.x + 6 : labelPoint.x
              } ${labelAnchor === "middle" ? labelPoint.y + 8 : labelPoint.y}`}
              stroke={isTiny ? tinyLabelColor : textColor}
              strokeWidth={1}
              opacity={isTiny ? 0.72 : 0.6}
              fill="none"
              pointerEvents="none"
            />
          ) : null
        )}
        {slices.map(({ series, sliceValue, percentage, isTiny, labelPoint, labelAnchor }) =>
          percentage > 0 ? (
            <SvgText
              key={`label-${series.key}`}
              x={labelPoint.x}
              y={labelPoint.y + 4}
              textAnchor={labelAnchor}
              fill={isTiny ? tinyLabelColor : sliceLabelColor(series.color)}
              fontSize={percentage < 5 ? 10 : percentage < 10 ? 11 : 13}
              fontWeight="700"
              stroke={isTiny ? "none" : sliceLabelColor(series.color) === "#FFFFFF" ? "#14202B" : "#FFFFFF"}
              strokeWidth={isTiny ? 0 : 0.25}
            >
              {percentageLabel(sliceValue, total)}
            </SvgText>
          ) : null
        )}
        {visible.length > 1 && (
          <Circle
            cx={centerX}
            cy={centerY}
            r={radius}
            fill="none"
            stroke={textColor}
            strokeWidth={1.5}
            opacity={0.55}
            pointerEvents="none"
          />
        )}
      </Svg>
      {/* pieKeyList: clear key instead of crowded leader-line labels */}
      <View style={{ width: plotWidth, paddingHorizontal: 8, paddingTop: 12, gap: 8 }}>
        {[...visible]
          .sort((x, y) => (y as any).total - (x as any).total)
          .map(({ series, ...rest }) => {
            const value = (rest as any).total as number;
            const isSel = selectedKey === series.key;
            return (
              <Pressable
                key={`key-${series.key}`}
                onPress={() => setSelectedKey(series.key)}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10, backgroundColor: isSel ? series.color + "22" : "transparent" }}
              >
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: series.color }} />
                <Text style={{ flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: textColor }} numberOfLines={1}>{series.label}</Text>
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: textColor, minWidth: 44, textAlign: "right", fontVariant: ["tabular-nums"] }}>{percentageLabel(value, total)}</Text>
                <Text style={{ fontSize: 13, color: textColor, opacity: 0.7, minWidth: 80, textAlign: "right", fontVariant: ["tabular-nums"] }}>{formatValue(value)}</Text>
              </Pressable>
            );
          })}
      </View>
      {selected && (
        <View pointerEvents="none" style={styles.pieTooltip}>
          <View style={styles.pieTooltipHeader}>
            <View style={[styles.tooltipDot, { backgroundColor: selected.series.color }]} />
            <Text style={styles.pieTooltipCategory}>{selected.series.label}</Text>
          </View>
          <View style={styles.pieTooltipDetails}>
            <Text style={styles.pieTooltipPercentage}>{percentageLabel(selected.total, total)}</Text>
            <Text style={styles.pieTooltipAmount}>{formatValue(selected.total)}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function LineChartCanvas({
  data,
  hidden,
  dismissSignal = 0,
  plotWidth,
  height,
  fmt,
  textColor,
  gridColor,
  yAxisTitle,
  totalColor,
}: {
  data: Bounds;
  hidden: Set<string>;
  dismissSignal?: number;
  plotWidth: number;
  height: number;
  fmt: (v: number) => string;
  textColor: string;
  gridColor: string;
  yAxisTitle: string;
  totalColor: string;
}) {
  const cW = Math.max(plotWidth - PL - PR, 1);
  const { buckets, grouping, series } = data;
  const chartHeight = height;
  const cH = Math.max(chartHeight - PT - PB, 1);
  const visible = series.filter(s => !hidden.has(s.key));
  const cumulativeSeries = visible.map(seriesItem => {
    let runningTotal = 0;
    return {
      ...seriesItem,
      values: seriesItem.values.map(value => {
        runningTotal += value;
        return runningTotal;
      }),
    };
  });
  const cumulativeTotalPerBucket = buckets.map((_, bucketIndex) =>
    cumulativeSeries.reduce((sum, seriesItem) => sum + seriesItem.values[bucketIndex], 0),
  );
  const showTotal = !hidden.has(TOTAL_SERIES_KEY);
  const lineSeries: Series[] = showTotal
    ? [
        ...cumulativeSeries,
        { key: TOTAL_SERIES_KEY, label: "Total", color: totalColor, values: cumulativeTotalPerBucket },
      ]
    : cumulativeSeries;
  const lineValues = lineSeries.flatMap(seriesItem => seriesItem.values);
  const rawMax = Math.max(...lineValues, 1);
  const lineMaxY = rawMax * 1.1;
  const rawStep = rawMax / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 1))));
  const step = Math.ceil(rawStep / magnitude) * magnitude || 1;
  const lineYSteps = [0, 1, 2, 3, 4].map(i => i * step).filter(value => value <= lineMaxY);
  const slotWidth = cW / Math.max(buckets.length, 1);
  const multiYear = new Date(buckets[0].start).getFullYear() !== new Date(buckets[buckets.length - 1].start).getFullYear();
  const axisColor = textColor;

  const [tooltip, setTooltip] = useState<{
    x: number;
    dateLabel: string;
    items: { label: string; color: string; value: number }[];
    total: number;
  } | null>(null);
  const tooltipBucketRef = useRef<number | null>(null);

  useEffect(() => {
    tooltipBucketRef.current = null;
    setTooltip(null);
  }, [data, hidden, dismissSignal]);

  const tickIndices = useMemo(() => {
    if (buckets.length <= 1) return buckets.length === 1 ? [0] : [];
    const labelWidth = grouping === "month"
      ? (multiYear ? 52 : 38)
      : (multiYear ? 62 : 52);
    const minLabelGap = labelWidth + 8;
    const desiredTicks = clamp(Math.floor((cW + 8) / minLabelGap) + 1, 2, 7);
    const candidates = Array.from({ length: desiredTicks }, (_, tick) =>
      Math.round((tick * (buckets.length - 1)) / (desiredTicks - 1)),
    );
    const kept: number[] = [];
    let lastX = -Infinity;
    candidates.forEach(i => {
      const x = i * slotWidth + slotWidth / 2;
      if (kept.length === 0 || x - lastX >= minLabelGap) {
        kept.push(i);
        lastX = x;
      }
    });
    if (kept[kept.length - 1] !== buckets.length - 1) {
      const lastIndex = buckets.length - 1;
      const lastXPosition = lastIndex * slotWidth + slotWidth / 2;
      if (lastXPosition - lastX >= minLabelGap) kept.push(lastIndex);
    }
    return kept;
  }, [buckets, cW, slotWidth, grouping, multiYear]);

  function handlePress(locationX: number) {
    if (buckets.length === 0) return;
    const safeLocationX = Number.isFinite(locationX) ? locationX : PL + slotWidth / 2;
    const i = clamp(Math.round((safeLocationX - PL - slotWidth / 2) / slotWidth), 0, buckets.length - 1);
    if (!buckets[i]) return;
    if (tooltipBucketRef.current === i) return;
    tooltipBucketRef.current = i;
    const x = PL + i * slotWidth + slotWidth / 2;
    const items = lineSeries
      .map(s => ({ label: s.label, color: s.color, value: s.values[i] }))
      .filter(it => it.value > 0);
    setTooltip({ x, dateLabel: periodRangeLabel(buckets[i], grouping), items, total: cumulativeTotalPerBucket[i] });
  }

  const chartPanGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-14, 14])
    .shouldCancelWhenOutside(false)
    .onUpdate(event => {
      runOnJS(handlePress)(event.x);
    });

  const tooltipLeft = tooltip
    ? clamp(tooltip.x - TOOLTIP_WIDTH / 2, 0, Math.max(plotWidth - TOOLTIP_WIDTH, 0))
    : 0;

  return (
    <View>
      <GestureDetector gesture={chartPanGesture}>
        <Pressable
          onPress={e => handlePress(e.nativeEvent.locationX)}
          style={{ width: plotWidth, height }}
        >
          <Svg width={plotWidth} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
          {tickIndices.map(i => {
            const x = PL + i * slotWidth + slotWidth / 2;
            return <Rect key={`vg${i}`} x={x} y={PT} width={1} height={cH} fill={gridColor} opacity={grouping === "week" ? 0.18 : 0.14} />;
          })}
          {lineSeries.map(seriesItem => {
            const points = seriesItem.values.map((value, i) => ({
              x: PL + i * slotWidth + slotWidth / 2,
              y: PT + cH - (value / lineMaxY) * cH,
            }));
            const path = points.map((point, i) => `${i === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
            const isTotal = seriesItem.key === TOTAL_SERIES_KEY;
            return (
              <React.Fragment key={seriesItem.key}>
                <Path d={path} fill="none" stroke={seriesItem.color} strokeWidth={isTotal ? 3.5 : 2.5} strokeLinejoin="round" strokeLinecap="round" />
              </React.Fragment>
            );
          })}
          </Svg>

        {lineYSteps.map((val, i) => {
          const y = PT + cH - (val / lineMaxY) * cH;
           if (y < 0 || y > chartHeight) return null;
          return (
            <React.Fragment key={`y${i}`}>
              <View style={{ position: "absolute", left: PL, top: y, width: cW, height: 1, backgroundColor: i === 0 ? axisColor : gridColor, opacity: i === 0 ? 1 : 0.6 }} />
               <Text style={{ position: "absolute", left: 20, top: y - 7, width: PL - 24, textAlign: "right", fontSize: 9, color: axisColor }}>
                {fmt(val)}
              </Text>
            </React.Fragment>
          );
        })}

        <Text
          numberOfLines={1}
          style={{
            position: "absolute",
            left: -56,
            top: PT + cH / 2 - 7,
            width: 130,
            textAlign: "center",
            fontSize: 9,
            color: axisColor,
            transform: [{ rotate: "-90deg" }],
          }}
        >
          {yAxisTitle}
        </Text>

        {tickIndices.map(i => {
          const x = PL + i * slotWidth + slotWidth / 2;
          const labelWidth = grouping === "month"
            ? (multiYear ? 52 : 38)
            : (multiYear ? 62 : 52);
          const left = clamp(x - labelWidth / 2, PL, PL + cW - labelWidth);
          return (
            <Text
              key={`x${i}`}
              numberOfLines={1}
              style={{ position: "absolute", left, top: PT + cH + 6, width: labelWidth, textAlign: "center", fontSize: 9, fontWeight: grouping === "month" ? "700" : "400", color: axisColor }}
            >
              {bucketLabel(buckets[i], grouping, multiYear)}
            </Text>
          );
        })}

        <View style={{ position: "absolute", left: PL, top: PT, width: 1, height: cH, backgroundColor: axisColor }} />
        <View style={{ position: "absolute", left: PL, top: PT + cH, width: cW, height: 1, backgroundColor: axisColor }} />
        {tickIndices.map(i => {
          const x = PL + i * slotWidth + slotWidth / 2;
          return <View key={`xt${i}`} style={{ position: "absolute", left: x, top: PT + cH, width: 1, height: 4, backgroundColor: axisColor }} />;
        })}

          {tooltip && (
            <View pointerEvents="none" style={{ position: "absolute", left: tooltip.x, top: PT, width: 1.5, height: cH, backgroundColor: textColor, opacity: 0.3 }} />
          )}
        </Pressable>
      </GestureDetector>

      {tooltip && (
        <View pointerEvents="none" style={[styles.tooltip, { left: tooltipLeft }]}>
          <Text style={styles.tooltipDate}>{tooltip.dateLabel}</Text>
          {tooltip.items.length === 0 ? (
            <Text style={styles.tooltipEmpty}>No spending</Text>
          ) : (
            tooltip.items.map((item, i) => (
              <View key={i} style={styles.tooltipRow}>
                <View style={[styles.tooltipDot, { backgroundColor: item.color }]} />
                <Text style={styles.tooltipLabel} numberOfLines={1}>{item.label}</Text>
                <Text style={styles.tooltipValue}>{fmt(item.value)}</Text>
              </View>
            ))
          )}
          <View style={[styles.tooltipRow, styles.tooltipTotalRow]}>
            <Text style={styles.tooltipLabel}>Total</Text>
            <Text style={styles.tooltipValue}>{fmt(tooltip.total)}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function ChartTypeSelector({
  value,
  onChange,
  colors,
}: {
  value: ChartType;
  onChange: (chartType: ChartType) => void;
  colors: { border: string; primary: string; icon: string; textSecondary: string };
}) {
  const options: { key: ChartType; icon: keyof typeof Feather.glyphMap; label: string }[] = [
    { key: "pie", icon: "pie-chart", label: "Pie" },
    { key: "line", icon: "trending-up", label: "Line" },
  ];
  return (
    <View style={[styles.segmented, { borderColor: colors.border }]}>
      {options.map(opt => {
        const active = value === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            accessibilityRole="button"
            accessibilityLabel={`${opt.label} chart`}
            style={[styles.chartTypeItem, active && { backgroundColor: colors.primary }]}
          >
            <Feather name={opt.icon} size={12} color={active ? "#fff" : colors.icon} />
            <Text style={[styles.chartTypeText, { color: active ? "#fff" : colors.textSecondary }]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Two icon buttons for switching the stack dimension between category and person. */
function DimensionToggle({
  value,
  onChange,
  colors,
}: {
  value: ChartDimension;
  onChange: (d: ChartDimension) => void;
  colors: { border: string; primary: string; icon: string };
}) {
  const options: { key: ChartDimension; icon: keyof typeof Feather.glyphMap; label: string }[] = [
    { key: "category", icon: "tag", label: "By category" },
    { key: "person", icon: "users", label: "By person" },
  ];
  return (
    <View style={[styles.segmented, { borderColor: colors.border }]}>
      {options.map(opt => {
        const active = value === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            accessibilityRole="button"
            accessibilityLabel={opt.label}
            style={[styles.segmentedIconItem, active && { backgroundColor: colors.primary }]}
          >
            <Feather name={opt.icon} size={13} color={active ? "#fff" : colors.icon} />
          </Pressable>
        );
      })}
    </View>
  );
}

function DateRangeControl({
  range,
  minDate,
  maxDate,
  onChange,
  colors,
}: {
  range: DateRange;
  minDate: string;
  maxDate: string;
  onChange: (range: DateRange) => void;
  colors: {
    text: string;
    textSecondary: string;
    textTertiary: string;
    inputBg: string;
    border: string;
    primary: string;
    primaryLight: string;
    surface: string;
  };
}) {
  const start = timestampToDateOnly(range.start);
  const end = timestampToDateOnly(range.end);
  const pickerColors = {
    text: colors.text,
    textSecondary: colors.textSecondary,
    textTertiary: colors.textTertiary,
    surface: colors.surface,
    inputBg: colors.inputBg,
    border: colors.border,
    primary: colors.primary,
    primaryLight: colors.primaryLight,
  };

  function updateStart(value: string) {
    const next = dateOnlyToTimestamp(value);
    if (!Number.isNaN(next) && next >= dateOnlyToTimestamp(minDate) && next <= range.end) {
      onChange({ start: next, end: range.end });
    }
  }
  function updateEnd(value: string) {
    const next = dateOnlyToTimestamp(value);
    if (!Number.isNaN(next) && next <= dateOnlyToTimestamp(maxDate) && next >= range.start) {
      onChange({ start: range.start, end: next });
    }
  }

  return (
    <View style={styles.rangeRow}>
      <DatePickerField
        label="From"
        value={start}
        onChange={updateStart}
        colors={pickerColors}
        minDate={minDate}
        maxDate={maxDate}
        compact
        allowClear={false}
      />
      <Text style={[styles.rangeSeparator, { color: colors.textTertiary }]}>–</Text>
      <DatePickerField
        label="To"
        value={end}
        onChange={updateEnd}
        colors={pickerColors}
        minDate={minDate}
        maxDate={maxDate}
        compact
        allowClear={false}
      />
    </View>
  );
}

function Legend({
  items,
  textColor,
  separatorColor,
  vertical = false,
}: {
  items: { key: string; label: string; color: string; percentage?: string }[];
  textColor: string;
  separatorColor?: string;
  vertical?: boolean;
}) {
  return (
    <View style={[styles.legend, vertical && styles.legendVertical]}>
      {items.map((item, index) => {
        return (
          <View
            key={item.key}
            style={[
              styles.legendItem,
              vertical && styles.legendItemVertical,
              vertical && index < items.length - 1 && {
                borderBottomColor: separatorColor ?? textColor,
                borderBottomWidth: StyleSheet.hairlineWidth,
              },
            ]}
          >
            <View style={[styles.legendDot, { backgroundColor: item.color, borderColor: item.color }]} />
            <View style={styles.legendCopy}>
              <View style={styles.legendLine}>
                <Text
                  numberOfLines={1}
                  style={[styles.legendLabel, { color: textColor }]}
                >
                  {item.label}
                </Text>
                {item.percentage !== undefined && (
                  <Text
                    numberOfLines={1}
                    style={[styles.legendPercentage, { color: textColor }]}
                  >
                    {item.percentage}
                  </Text>
                )}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function GroupSpendingChart({
  expenses,
  members,
  targetCurrency,
  convertAmount,
  width,
  height = 220,
  textColor = "#8BA3BE",
  gridColor = "#E2E8EF",
  legendTextColor = "#6B7785",
  inputBackgroundColor = "#F8F9FA",
  primaryLightColor = "#EEF0F3",
  cardBackgroundColor = "#FFFFFF",
  accentColor = "#2563EB",
  emptyText = "No data yet",
  dismissSignal = 0,
  formatValue,
}: GroupSpendingChartProps) {
  const [dimension, setDimension] = useState<ChartDimension>("category");
  const [selectedRange, setSelectedRange] = useState<DateRange | null>(null);
  const [rangeSourceKey, setRangeSourceKey] = useState("");

  const hidden = EMPTY_HIDDEN_SERIES;

  const bounds = expenses.length
    ? { minTs: Math.min(...expenses.map(e => e.timestamp)), maxTs: Math.max(...expenses.map(e => e.timestamp)) }
    : null;
  const naturalRange = bounds ? defaultDateRange(bounds.minTs, bounds.maxTs) : null;
  const naturalRangeKey = naturalRange ? `${naturalRange.start}:${naturalRange.end}` : "";

  useEffect(() => {
    if (!naturalRange || naturalRangeKey === rangeSourceKey) return;
    setSelectedRange(naturalRange);
    setRangeSourceKey(naturalRangeKey);
  }, [naturalRange, naturalRangeKey, rangeSourceKey]);

  const activeRange = selectedRange ?? naturalRange;
  const autoGrouping: Grouping = activeRange ? autoGroupingFor(activeRange.start, activeRange.end) : "week";
  const grouping = autoGrouping;

  // Always call the hook (same order every render); ignore its result when there is no range.
  const chartDataAlways = useChartData(expenses, members, dimension, targetCurrency, convertAmount, grouping, activeRange ?? ({ start: 0, end: 0 } as NonNullable<typeof activeRange>), hidden);
  const data = activeRange ? chartDataAlways : null;

  const formatDisplayValue = formatValue ?? ((v: number) => `${targetCurrency} ${v.toFixed(2)}`);

  if (!data || expenses.length === 0 || width < 2) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={[styles.emptyText, { color: textColor }]}>{emptyText}</Text>
      </View>
    );
  }

  const pieTotal = data.series
    .filter(s => !hidden.has(s.key))
    .reduce((sum, seriesItem) => sum + seriesItem.values.reduce((seriesSum, value) => seriesSum + value, 0), 0);
  const legendSeries = [...data.series].sort((a, b) => {
    const aTotal = a.values.reduce((sum, value) => sum + value, 0);
    const bTotal = b.values.reduce((sum, value) => sum + value, 0);
    return bTotal - aTotal;
  });
  const legendItems = [
    ...legendSeries.map(s => {
      const seriesTotal = s.values.reduce((sum, value) => sum + value, 0);
      const percentage = percentageLabel(seriesTotal, pieTotal);
      return {
        key: s.key,
        label: s.label,
        color: s.color,
        percentage,
      };
    }),
  ];
  const chartWidth = width;
  const chartRenderHeight = Math.max(height, 320);

  return (
    <View>
      <View style={styles.headerRow}>
        {activeRange ? (
          <View style={styles.headerRange}>
            <DateRangeControl
              range={activeRange}
              minDate={bounds ? timestampToDateOnly(bounds.minTs) : timestampToDateOnly(activeRange.start)}
              maxDate={bounds ? timestampToDateOnly(bounds.maxTs) : timestampToDateOnly(activeRange.end)}
              onChange={setSelectedRange}
              colors={{
                text: legendTextColor,
                textSecondary: legendTextColor,
                textTertiary: textColor,
                inputBg: inputBackgroundColor,
                border: gridColor,
                primary: accentColor,
                primaryLight: primaryLightColor,
                surface: cardBackgroundColor,
              }}
            />
          </View>
        ) : (
          <View />
        )}
        <View style={styles.headerRightGroup}>
          <DimensionToggle value={dimension} onChange={setDimension} colors={{ border: gridColor, primary: accentColor, icon: textColor }} />
        </View>
      </View>

      <Text style={[styles.chartModeLabel, { color: textColor }]}>
        {dimension === "person" ? "Expense share by person" : "Spending by category"}
      </Text>

      <View style={[styles.chartViewport, { width }]}>
        <PieChartCanvas
          data={data}
          hidden={hidden}
          dismissSignal={dismissSignal}
          plotWidth={chartWidth}
          height={chartRenderHeight}
          textColor={textColor}
          formatValue={formatDisplayValue}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 6 },
  chartControls: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  headerRange: { flex: 1, minWidth: 0 },
  headerRightGroup: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  rangeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 0, flexShrink: 1 },
  rangeLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginRight: 2 },
  rangeSeparator: { fontSize: 13, fontFamily: "Inter_500Medium" },
  segmented: { flexDirection: "row", borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  segmentedItem: { paddingHorizontal: 12, paddingVertical: 5 },
  segmentedIconItem: { paddingHorizontal: 9, paddingVertical: 6 },
  segmentedText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  chartTypeItem: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 6 },
  chartTypeText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  tooltip: {
    position: "absolute",
    top: 0,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
    backgroundColor: "#1C2B3A",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
    minWidth: 150,
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  tooltipDate: { fontSize: 11, fontFamily: "Inter_700Bold", marginBottom: 2, color: "#FFFFFF" },
  tooltipEmpty: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#8BA3BE" },
  tooltipRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tooltipTotalRow: { marginTop: 2, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#3A4A5C" },
  tooltipDot: { width: 7, height: 7, borderRadius: 4 },
  tooltipLabel: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", color: "#B0BEC5" },
  tooltipValue: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#E8EEF5" },
  pieTooltip: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 10,
    borderRadius: 10,
    backgroundColor: "#1C2B3A",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  pieTooltipHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  pieTooltipCategory: { flex: 1, color: "#FFFFFF", fontSize: 12, fontFamily: "Inter_700Bold" },
  pieTooltipDetails: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  pieTooltipPercentage: { color: "#B0BEC5", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  pieTooltipAmount: { flex: 1, color: "#E8EEF5", fontSize: 12, fontFamily: "Inter_700Bold", textAlign: "right" },
  chartViewport: { flexGrow: 0 },
  chartModeLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 8, marginBottom: 2 },
  legend: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", columnGap: 8, rowGap: 10, paddingHorizontal: 4, marginTop: 12 },
  legendItem: { width: "48%", minWidth: 0, flexDirection: "row", alignItems: "center", gap: 5 },
  legendVertical: { flexDirection: "column", alignItems: "stretch", justifyContent: "flex-start", width: "100%", rowGap: 10 },
  legendItemVertical: { width: "100%" },
  legendDot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1.5 },
  legendCopy: { flex: 1, minWidth: 0 },
  legendLine: { width: "100%", minWidth: 0, flexDirection: "row", alignItems: "center", columnGap: 10 },
  legendLabel: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 16, fontFamily: "Inter_500Medium" },
  legendPercentage: { width: 42, flexShrink: 0, textAlign: "right", fontSize: 11, fontFamily: "Inter_600SemiBold" },
});
