import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import React, { useCallback, useEffect } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "@/hooks/useTheme";

/** A wavy line two screens wide, so shifting it by one screen width loops seamlessly. */
function wavePath(width: number, y: number, amplitude: number, wavelength: number): string {
  let d = "M 0 " + y;
  for (let x = 0; x < width * 2; x += wavelength) {
    d += " Q " + (x + wavelength / 4) + " " + (y - amplitude) + " " + (x + wavelength / 2) + " " + y;
    d += " T " + (x + wavelength) + " " + y;
  }
  return d;
}

/**
 * "Tide" background for the main tabs: a deep teal band behind the header with two
 * slow wave lines drifting at different speeds, ending in a soft wave into the page.
 * The waves hold still when Reduce Motion is on.
 */
export function TideBackdrop({ height }: { height?: number }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const bandHeight = height ?? insets.top + 210;
  const fast = useSharedValue(0);
  const slow = useSharedValue(0);

  useEffect(() => {
    fast.value = 0;
    slow.value = 0;
    fast.value = withRepeat(withTiming(-width, { duration: 24000, easing: Easing.linear, reduceMotion: ReduceMotion.System }), -1, false);
    slow.value = withRepeat(withTiming(-width, { duration: 38000, easing: Easing.linear, reduceMotion: ReduceMotion.System }), -1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  // Light status bar text on the dark band while a tab is on screen.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light");
      return () => setStatusBarStyle("auto");
    }, []),
  );

  const fastStyle = useAnimatedStyle(() => ({ transform: [{ translateX: fast.value }] }));
  const slowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: slow.value }] }));
  // Sit the waves just above the summary cards so the crests show instead of hiding behind them.
  const lineY = bandHeight - 128;

  return (
    <View pointerEvents="none" style={[styles.band, { height: bandHeight }]}>
      <LinearGradient colors={["#04404A", "#0E7C86"]} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.layer, { width: width * 2, top: lineY - 26 }, slowStyle]}>
        <Svg width={width * 2} height={44}>
          <Path d={wavePath(width, 22, 14, width / 2.5)} stroke="rgba(255,255,255,0.28)" strokeWidth={2} fill="none" />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.layer, { width: width * 2, top: lineY }, fastStyle]}>
        <Svg width={width * 2} height={44}>
          <Path d={wavePath(width, 22, 16, width / 3.5)} stroke="rgba(24,182,164,0.75)" strokeWidth={2} fill="none" />
        </Svg>
      </Animated.View>
      <Svg width={width} height={26} style={styles.edge}>
        <Path
          d={"M 0 26 L 0 14 Q " + width / 4 + " 2 " + width / 2 + " 14 T " + width + " 14 L " + width + " 26 Z"}
          fill={colors.background}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { position: "absolute", top: 0, left: 0, right: 0, overflow: "hidden" },
  layer: { position: "absolute", left: 0, height: 44 },
  edge: { position: "absolute", left: 0, bottom: 0 },
});
