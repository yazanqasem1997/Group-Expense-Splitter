import type { ComponentRef } from "react";
import * as Haptics from "expo-haptics";
import React, { useRef, useState } from "react";
import { StyleSheet, Text, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";

import { ALPHABET_INDEX } from "@/utils/alphabet";

type AlphabetIndexProps = {
  available: Set<string>;
  onSelect: (letter: string) => void;
  textColor: string;
  mutedColor: string;
  highlightColor: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Vertical A–Z rail. Tap or drag along it to jump through an alphabetical list.
 * Only the rail itself takes touches, so the list keeps normal scrolling.
 */
export function AlphabetIndex({ available, onSelect, textColor, mutedColor, highlightColor, style }: AlphabetIndexProps) {
  const railRef = useRef<ComponentRef<typeof View>>(null);
  const bounds = useRef({ top: 0, height: 0 });
  const lastLetter = useRef<string | null>(null);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);

  function measure() {
    railRef.current?.measureInWindow((_x, y, _width, height) => {
      bounds.current = { top: y, height };
    });
  }

  function selectAt(event: GestureResponderEvent) {
    const { top, height } = bounds.current;
    if (!height) return;
    const ratio = (event.nativeEvent.pageY - top) / height;
    const index = Math.min(ALPHABET_INDEX.length - 1, Math.max(0, Math.floor(ratio * ALPHABET_INDEX.length)));
    const letter = ALPHABET_INDEX[index];
    if (letter === lastLetter.current) return;
    lastLetter.current = letter;
    setActiveLetter(letter);
    void Haptics.selectionAsync().catch(() => {});
    onSelect(letter);
  }

  function release() {
    lastLetter.current = null;
    setActiveLetter(null);
  }

  return (
    <View
      ref={railRef}
      onLayout={measure}
      style={[styles.rail, style]}
      hitSlop={{ left: 12, right: 6 }}
      accessibilityRole="adjustable"
      accessibilityLabel="Alphabet index"
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => { measure(); selectAt(event); }}
      onResponderMove={selectAt}
      onResponderRelease={release}
      onResponderTerminate={release}
    >
      {ALPHABET_INDEX.map((letter) => {
        const isActive = activeLetter === letter;
        return (
          <View key={letter} style={[styles.letterCell, isActive && { backgroundColor: highlightColor }]}>
            <Text
              style={[
                styles.letter,
                { color: isActive ? "#fff" : available.has(letter) ? textColor : mutedColor },
              ]}
            >
              {letter}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { width: 20, alignItems: "center", paddingVertical: 4 },
  letterCell: { width: 18, height: 15, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  letter: { fontSize: 11, lineHeight: 13, fontFamily: "Inter_600SemiBold" },
});
