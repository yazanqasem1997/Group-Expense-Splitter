import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Circle, G, Line, Polyline, Svg, Text as SvgText } from "react-native-svg";

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

const PL = 46;
const PR = 16;
const PT = 14;
const PB = 34;

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
  const cW = width - PL - PR;
  const cH = height - PT - PB;

  const { minX, xRange, maxY, ySteps, xTicks } = useMemo(() => {
    const all = series.flatMap(s => s.points);
    if (all.length === 0) {
      return { minX: 0, xRange: 1, maxY: 100, ySteps: [0, 25, 50, 75, 100], xTicks: [] };
    }

    const minX = Math.min(...all.map(p => p.timestamp));
    const maxX = Math.max(...all.map(p => p.timestamp));
    const xRange = maxX - minX || 1;
    const rawMax = Math.max(...all.map(p => p.value), 1);
    const maxY = rawMax * 1.08;

    const rawStep = rawMax / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 1))));
    const step = Math.ceil(rawStep / magnitude) * magnitude || 1;
    const ySteps = [0, 1, 2, 3, 4].map(i => i * step).filter(v => v <= maxY);

    const uniqueTs = Array.from(new Set(all.map(p => p.timestamp))).sort((a, b) => a - b);
    const tickEvery = Math.max(1, Math.ceil(uniqueTs.length / 4));
    const xTicks: number[] = [];
    uniqueTs.forEach((ts, i) => { if (i % tickEvery === 0) xTicks.push(ts); });
    if (xTicks[xTicks.length - 1] !== uniqueTs[uniqueTs.length - 1]) {
      xTicks.push(uniqueTs[uniqueTs.length - 1]);
    }

    return { minX, xRange, maxY, ySteps, xTicks };
  }, [series]);

  const toX = (ts: number) => PL + ((ts - minX) / xRange) * cW;
  const toY = (val: number) => PT + cH - (val / maxY) * cH;

  const fmtDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.toLocaleString("default", { month: "short" })} ${d.getDate()}`;
  };

  const activeSeries = series.filter(s => s.points.length > 0);

  if (activeSeries.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={[styles.emptyText, { color: textColor }]}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <View>
      <Svg width={width} height={height}>
        {ySteps.map((val, i) => {
          const y = toY(val);
          if (y < 0 || y > height) return null;
          return (
            <G key={`y${i}`}>
              <Line
                x1={PL}
                y1={y}
                x2={PL + cW}
                y2={y}
                stroke={gridColor}
                strokeWidth={1}
                strokeDasharray={i === 0 ? undefined : "3,3"}
              />
              <SvgText x={PL - 5} y={y + 4} fontSize={9} fill={textColor} textAnchor="end">
                {formatY
                  ? formatY(val)
                  : val >= 1000
                  ? `${(val / 1000).toFixed(0)}k`
                  : val.toFixed(0)}
              </SvgText>
            </G>
          );
        })}

        {xTicks.map((ts, i) => (
          <SvgText
            key={`x${i}`}
            x={toX(ts)}
            y={height - 4}
            fontSize={9}
            fill={textColor}
            textAnchor="middle"
          >
            {fmtDate(ts)}
          </SvgText>
        ))}

        {activeSeries.map((s, si) => {
          const sorted = [...s.points].sort((a, b) => a.timestamp - b.timestamp);
          const pts = sorted.map(p => `${toX(p.timestamp)},${toY(p.value)}`).join(" ");
          return (
            <G key={`s${si}`}>
              <Polyline
                points={pts}
                fill="none"
                stroke={s.color}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {sorted.map((p, pi) => (
                <Circle
                  key={`d${pi}`}
                  cx={toX(p.timestamp)}
                  cy={toY(p.value)}
                  r={4}
                  fill={s.color}
                  stroke="white"
                  strokeWidth={1.5}
                />
              ))}
            </G>
          );
        })}
      </Svg>

      <View style={styles.legend}>
        {activeSeries.map((s, i) => (
          <View key={i} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: s.color }]} />
            <Text style={[styles.legendLabel, { color: legendTextColor }]}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: PL,
    marginTop: 10,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
});
