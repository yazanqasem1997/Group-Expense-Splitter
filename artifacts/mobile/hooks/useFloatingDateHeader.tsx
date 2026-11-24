import React, { useMemo, useRef, useState } from "react";
import { View } from "react-native";
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, StyleProp, ViewStyle } from "react-native";

/**
 * A steady date bar for a feed with date headers. The bar sits above the list
 * (on the teal wave) and always shows the month or day you're looking at; rows
 * scroll up and disappear under it. The feed's first header is shown by the
 * bar instead of in the list, so a date is never shown twice. When the next
 * header scrolls up to the bar, the bar's label swaps to it.
 */
export function useFloatingDateHeader<T>(rows: T[], labelOf: (row: T) => string | null) {
  const { listRows, labels, firstLabel } = useMemo(() => {
    const firstIsHeader = rows.length > 0 && labelOf(rows[0]) != null;
    const list = firstIsHeader ? rows.slice(1) : rows;
    const ls = list.map(labelOf);
    const first = firstIsHeader ? labelOf(rows[0]) : (ls.find(l => l != null) ?? null);
    return { listRows: list, labels: ls, firstLabel: first };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const firstRef = useRef(firstLabel);
  firstRef.current = firstLabel;
  const headerY = useRef<Map<number, number>>(new Map());
  const offsetRef = useRef(0);
  const [label, setLabel] = useState<string | null>(null);

  function recompute() {
    const y = offsetRef.current;
    let cur = firstRef.current;
    let best = -Infinity;
    headerY.current.forEach((hy, i) => {
      const l = labelsRef.current[i];
      if (l != null && hy <= y + 1 && hy > best) { best = hy; cur = l; }
    });
    setLabel(prev => (prev === cur ? prev : cur));
  }
  const recomputeRef = useRef(recompute);
  recomputeRef.current = recompute;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetRef.current = e.nativeEvent.contentOffset.y;
    recomputeRef.current();
  };

  const CellRendererComponent = useMemo(() => {
    function Cell(props: { index: number; style?: StyleProp<ViewStyle>; onLayout?: (e: LayoutChangeEvent) => void; children?: React.ReactNode }) {
      const { index, style, onLayout, children, ...rest } = props;
      return (
        <View
          {...rest}
          style={style}
          onLayout={e => {
            onLayout?.(e);
            if (labelsRef.current[index] != null) {
              headerY.current.set(index, e.nativeEvent.layout.y);
              recomputeRef.current();
            }
          }}
        >
          {children}
        </View>
      );
    }
    return Cell;
  }, []);

  return { label: label ?? firstLabel, listRows, onScroll, scrollEventThrottle: 16, CellRendererComponent };
}
