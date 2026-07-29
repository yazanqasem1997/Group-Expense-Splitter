/**
 * CurrencyPickerModal
 * Shared across group/new, account settings, and anywhere else a currency is chosen.
 * - Shows 15 popular currencies as flag-circle chips at the top
 * - "More" expands to a fully searchable list of all world currencies
 */
import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CURRENCY_LIST } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";

const POPULAR_CODES = [
  "USD", "EUR", "GBP", "CAD", "AUD", "JPY",
  "INR", "AED", "CHF", "SGD", "CNY", "BRL",
  "MXN", "HKD", "KRW",
];

const POPULAR = POPULAR_CODES.map(code => CURRENCY_LIST.find(c => c.code === code)!).filter(Boolean);

interface Props {
  visible: boolean;
  onClose: () => void;
  value: string;
  onChange: (code: string) => void;
  title?: string;
}

export function CurrencyPickerModal({ visible, onClose, value, onChange, title = "Select Currency" }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const isSearching = search.trim().length > 0;

  const filteredAll = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return CURRENCY_LIST;
    return CURRENCY_LIST.filter(c =>
      c.code.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)
    );
  }, [search]);

  function pick(code: string) {
    onChange(code);
    setSearch("");
    setShowAll(false);
    onClose();
  }

  function handleClose() {
    setSearch("");
    setShowAll(false);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>
        {/* Handle + Title */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Pressable onPress={handleClose} hitSlop={10}>
            <Feather name="x" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Search bar */}
        <View style={[styles.searchWrap, { backgroundColor: colors.inputBg, borderColor: isSearching ? colors.primary : colors.border }]}>
          <Feather name="search" size={15} color={isSearching ? colors.primary : colors.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search currencies…"
            placeholderTextColor={colors.textTertiary}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>

        {/* Popular currencies grid — shown when not searching AND not expanded */}
        {!isSearching && !showAll && (
          <View style={styles.popularSection}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Popular</Text>
            <View style={styles.popularGrid}>
              {POPULAR.map(c => {
                const active = c.code === value;
                return (
                  <Pressable
                    key={c.code}
                    style={[
                      styles.popularChip,
                      {
                        backgroundColor: active ? colors.primary : colors.background,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => pick(c.code)}
                  >
                    <View style={[styles.flagCircle, { backgroundColor: active ? "rgba(255,255,255,0.2)" : colors.inputBg }]}>
                      <Text style={styles.flagEmoji}>{c.flag}</Text>
                    </View>
                    <Text style={[styles.popularCode, { color: active ? "#fff" : colors.text }]}>{c.code}</Text>
                    {active && (
                      <View style={styles.activeCheck}>
                        <Feather name="check" size={8} color={colors.primary} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* More button */}
            <Pressable
              style={[styles.moreBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
              onPress={() => setShowAll(true)}
            >
              <Feather name="globe" size={14} color={colors.primary} />
              <Text style={[styles.moreBtnText, { color: colors.primary }]}>
                More currencies ({CURRENCY_LIST.length - POPULAR.length} more)
              </Text>
              <Feather name="chevron-down" size={14} color={colors.primary} />
            </Pressable>
          </View>
        )}

        {/* Full list — shown when searching or "More" tapped */}
        {(isSearching || showAll) && (
          <>
            {showAll && !isSearching && (
              <Pressable
                style={[styles.backBtn, { borderBottomColor: colors.border }]}
                onPress={() => setShowAll(false)}
              >
                <Feather name="chevron-left" size={15} color={colors.primary} />
                <Text style={[styles.backBtnText, { color: colors.primary }]}>Back to popular</Text>
              </Pressable>
            )}
            <FlatList
              data={filteredAll}
              keyExtractor={c => c.code}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 380 }}
              renderItem={({ item: c, index }) => {
                const active = c.code === value;
                return (
                  <Pressable
                    style={[
                      styles.listRow,
                      { borderBottomColor: colors.border },
                      active && { backgroundColor: colors.primaryLight },
                    ]}
                    onPress={() => pick(c.code)}
                  >
                    <View style={[styles.flagCircleSmall, { backgroundColor: colors.inputBg }]}>
                      <Text style={styles.flagEmojiSmall}>{c.flag}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.listCode, { color: colors.text }]}>{c.code}</Text>
                      <Text style={[styles.listLabel, { color: colors.textSecondary }]}>{c.label}</Text>
                    </View>
                    <Text style={[styles.listSymbol, { color: colors.textTertiary }]}>{c.symbol.trim()}</Text>
                    {active && <Feather name="check" size={16} color={colors.primary} style={{ marginLeft: 8 }} />}
                  </Pressable>
                );
              }}
            />
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 17, fontFamily: "Inter_700Bold" },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    height: 42, borderRadius: 12, borderWidth: 1,
    marginHorizontal: 16, marginVertical: 12, paddingHorizontal: 12,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  sectionLabel: {
    fontSize: 11, fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase", letterSpacing: 0.7,
    paddingHorizontal: 16, marginBottom: 10,
  },
  popularSection: { paddingBottom: 12 },
  popularGrid: {
    flexDirection: "row", flexWrap: "wrap",
    paddingHorizontal: 12, gap: 8,
  },
  popularChip: {
    alignItems: "center", justifyContent: "center",
    width: 68, paddingVertical: 10, paddingHorizontal: 4,
    borderRadius: 14, borderWidth: 1.5, gap: 4, position: "relative",
  },
  flagCircle: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  flagEmoji: { fontSize: 20 },
  popularCode: { fontSize: 11, fontFamily: "Inter_700Bold" },
  activeCheck: {
    position: "absolute", top: 4, right: 4,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  moreBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginTop: 10, paddingVertical: 11,
    paddingHorizontal: 14, borderRadius: 12, borderWidth: 1,
  },
  moreBtnText: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  backBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  listRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flagCircleSmall: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  flagEmojiSmall: { fontSize: 18 },
  listCode: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  listLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  listSymbol: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
