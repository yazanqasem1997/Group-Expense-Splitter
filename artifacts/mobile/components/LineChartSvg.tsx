import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type ChartSeries = {
  label: string;
  color: string;
  points: { timestamp: number; value: number }[];
};

interface LineChartSvgProps {
  series: ChartSeries[];
  width: number;
  height?: number;
  formatY?: (val: number) => string;
  textColor?: string;
  gridColor?: string;
  legendTextColor?: string;
  emptyText?: string;
}

const PL = 44;
const PR = 8;
const PT = 10;
const PB = 26;

export function LineChartSvg({
  series,
  width,
  height = 210,
  formatY,
  textColor = "#8BA3BE",
  gridColor = "#E2E8EF",
  legendTextColor = "#6B7785",
  emptyText = "No data yet",
}: LineChartSvgProps) {
  const cW = Math.max(width - PL - PR, 1);
  const cH = Math.max(height - PT - PB, 1);

  const [tooltip, setTooltip] = useState<{ x: number; items: { label: string; color: string; value: number }[] } | null>(null);

  const data = useMemo(() => {
    const all = series.flatMap(s => s.points);
    if (all.length === 0) return null;

    const minX = Math.min(...all.map(p => p.timestamp));
    const maxX = Math.max(...all.map(p => p.timestamp));
    const xRange = maxX - minX || 1;
    const rawMax = Math.max(...all.map(p => p.value), 1);
    const maxY = rawMax * 1.1;

    const rawStep = rawMax / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 1))));
    const step = Math.ceil(rawStep / magnitude) * magnitude || 1;
    const ySteps = [0, 1, 2, 3, 4].map(i => i * step).filter(v => v <= maxY);

    const allTs = Array.from(new Set(all.map(p => p.timestamp))).sort((a, b) => a - b);
    const tickEvery = Math.max(1, Math.ceil(allTs.length / 4));
    const xTicks: number[] = [];
    allTs.forEach((ts, i) => {
      if (i % tickEvery === 0) xTicks.push(ts);
    });
    const last = allTs[allTs.length - 1];
    if (xTicks[xTicks.length - 1] !== last) xTicks.push(last);

    return { minX, xRange, maxY, ySteps, xTicks };
  }, [series]);

  const toX = (ts: number) =>
    PL + ((ts - (data?.minX ?? 0)) / (data?.xRange ?? 1)) * cW;
  const toY = (val: number) =>
    PT + cH - (val / (data?.maxY ?? 1)) * cH;

  const fmtDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.toLocaleString("default", { month: "short" })} ${d.getDate()}`;
  };

  const fmt = (v: number) =>
    formatY
      ? formatY(v)
      : v >= 1000
      ? `${(v / 1000).toFixed(1)}k`
      : v.toFixed(0);

  const activeSeries = series.filter(s => s.points.length > 0);

  function handlePress(locationX: number) {
    if (!data) return;
    const clampedX = Math.max(PL, Math.min(PL + cW, locationX));
    const ts = data.minX + ((clampedX - PL) / cW) * data.xRange;

    const items = activeSeries.map(s => {
      const sorted = [...s.points].sort((a, b) => a.timestamp - b.timestamp);
      let nearest = sorted[0];
      for (const pt of sorted) {
        if (Math.abs(pt.timestamp - ts) < Math.abs(nearest.timestamp - ts)) nearest = pt;
      }
      return { label: s.label, color: s.color, value: nearest?.value ?? 0 };
    });

    setTooltip({ x: clampedX, items });
    setTimeout(() => setTooltip(null), 2200);
  }

  if (activeSeries.length === 0 || !data || width < 2) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={[styles.emptyText, { color: textColor }]}>{emptyText}</Text>
      </View>
    );
  }

  const tooltipLeft = tooltip
    ? Math.min(Math.max(tooltip.x - 60, 0), width - 130)
    : 0;

  return (
    <View>
      <Pressable
        onPress={e => handlePress(e.nativeEvent.locationX)}
        style={{ width, height }}
      >
        {/* Grid lines + Y labels */}
        {data.ySteps.map((val, i) => {
          const y = toY(val);
          if (y < 0 || y > height) return null;
          return (
            <React.Fragment key={`y${i}`}>
              <View
                style={{
                  position: "absolute",
                  left: PL,
                  top: y,
                  width: cW,
                  height: 1,
                  backgroundColor: gridColor,
                  opacity: i === 0 ? 1 : 0.6,
                }}
              />
              <Text
                style={{
                  position: "absolute",
                  left: 0,
                  top: y - 7,
                  width: PL - 4,
                  textAlign: "right",
                  fontSize: 9,
                  color: textColor,
                }}
              >
                {fmt(val)}
              </Text>
            </React.Fragment>
          );
        })}

        {/* X tick labels */}
        {data.xTicks.map((ts, i) => {
          const x = toX(ts);
          return (
            <Text
              key={`x${i}`}
              style={{
                position: "absolute",
                left: x - 20,
                top: PT + cH + 6,
                width: 40,
                textAlign: "center",
                fontSize: 9,
                color: textColor,
              }}
            >
              {fmtDate(ts)}
            </Text>
          );
        })}

        {/* Series lines + dots */}
        {activeSeries.map((s, si) => {
          const sorted = [...s.points].sort((a, b) => a.timestamp - b.timestamp);
          return (
            <React.Fragment key={`s${si}`}>
              {sorted.slice(0, -1).map((pt, pi) => {
                const x1 = toX(pt.timestamp);
                const y1 = toY(pt.value);
                const next = sorted[pi + 1];
                const x2 = toX(next.timestamp);
                const y2 = toY(next.value);
                const dx = x2 - x1;
                const dy = y2 - y1;
                const length = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                if (length < 0.5) return null;
                return (
                  <View
                    key={`l${pi}`}
                    style={{
                      position: "absolute",
                      left: (x1 + x2) / 2 - length / 2,
                      top: (y1 + y2) / 2 - 1.25,
                      width: length,
                      height: 2.5,
                      backgroundColor: s.color,
                      borderRadius: 2,
                      transform: [{ rotate: `${angle}deg` }],
                    }}
                  />
                );
              })}
              {sorted.map((pt, pi) => (
                <View
                  key={`d${pi}`}
                  style={{
                    position: "absolute",
                    left: toX(pt.timestamp) - 4.5,
                    top: toY(pt.value) - 4.5,
                    width: 9,
                    height: 9,
                    borderRadius: 5,
                    backgroundColor: s.color,
                    borderWidth: 2,
                    borderColor: "white",
                  }}
                />
              ))}
            </React.Fragment>
          );
        })}

        {/* Touch hairline */}
        {tooltip && (
          <View
            style={{
              position: "absolute",
              left: tooltip.x,
              top: PT,
              width: 1.5,
              height: cH,
              backgroundColor: textColor,
              opacity: 0.4,
            }}
          />
        )}
      </Pressable>

      {/* Tooltip bubble */}
      {tooltip && (
        <View
          style={[
            styles.tooltip,
            { left: tooltipLeft },
          ]}
        >
          {tooltip.items.map((item, i) => (
            <View key={i} style={styles.tooltipRow}>
              <View style={[styles.tooltipDot, { backgroundColor: item.color }]} />
              <Text style={styles.tooltipLabel} numberOfLines={1}>{item.label}</Text>
              <Text style={[styles.tooltipValue, { color: item.color }]}>{fmt(item.value)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        {activeSeries.map((s, i) => (
          <View key={i} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: s.color }]} />
            <Text style={[styles.legendLabel, { color: legendTextColor }]}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  tooltip: {
    position: "absolute",
    top: 0,
    backgroundColor: "#1C2B3A",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
    minWidth: 130,
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  tooltipRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tooltipDot: { width: 7, height: 7, borderRadius: 4 },
  tooltipLabel: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#B0BEC5",
  },
  tooltipValue: { fontSize: 12, fontFamily: "Inter_700Bold" },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingLeft: PL,
    marginTop: 12,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
});
