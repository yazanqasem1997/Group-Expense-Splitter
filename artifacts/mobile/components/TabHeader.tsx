import type { ComponentRef } from "react";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AvatarHeaderButton } from "@/components/AvatarHeaderButton";
import { useTheme } from "@/hooks/useTheme";

type TabHeaderProps = {
  title: string;
  topInset: number;
  titleFontSize?: number;
  titleAccessory?: React.ReactNode;
  titleColor?: string;
  showAvatar?: boolean;
  children?: React.ReactNode;
};

/**
 * Shared top-of-screen treatment for the main Split Mate surfaces.
 * Keeping the title row and its safe-area spacing here prevents each tab
 * from drifting visually as individual screens evolve.
 */
export function TabHeader({
  title,
  topInset,
  titleFontSize = 26,
  titleAccessory,
  titleColor,
  showAvatar = true,
  children,
}: TabHeaderProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.header, { paddingTop: topInset + 6 }]}>
      <View style={styles.topRow}>
        <Text style={[styles.title, { color: titleColor ?? colors.text, fontSize: titleFontSize, lineHeight: titleFontSize + 6 }]}>
          {title}
        </Text>
        {titleAccessory}
        {showAvatar ? (
          <AvatarHeaderButton />
        ) : (
          <View style={styles.avatarSpacer} />
        )}
      </View>
      {children}
    </View>
  );
}

type TabSearchBarProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  onClear?: () => void;
  inputRef?: React.Ref<ComponentRef<typeof TextInput>>;
  style?: object;
  accessibilityLabel?: string;
};

export function TabSearchBar({
  value,
  onChangeText,
  placeholder,
  onClear,
  inputRef,
  style,
  accessibilityLabel = "Search",
}: TabSearchBarProps) {
  const { colors } = useTheme();
  const isActive = value.trim().length > 0;

  return (
    <View
      style={[
        styles.searchBar,
        {
          backgroundColor: colors.surface,
          borderColor: isActive ? colors.primary : colors.border,
        },
        style,
      ]}
    >
      <Feather
        name="search"
        size={16}
        color={isActive ? colors.primary : colors.textTertiary}
      />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        style={[styles.searchInput, { color: colors.text }]}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="never"
        accessibilityLabel={accessibilityLabel}
      />
      {value ? (
        <Pressable
          onPress={onClear}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Clear ${accessibilityLabel.toLowerCase()}`}
        >
          <Feather name="x-circle" size={17} color={colors.textTertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export const TAB_SEARCH_SORT_ROW = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: 8,
};

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 9,
    overflow: "hidden",
  },
  topRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  avatarSpacer: {
    width: 38,
    height: 38,
    marginLeft: "auto",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 13,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
});