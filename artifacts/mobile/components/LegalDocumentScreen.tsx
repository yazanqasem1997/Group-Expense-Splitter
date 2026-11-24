import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Linking } from "react-native";
import { PRODUCT_NAME, SUPPORT_EMAIL } from "@/constants/brand";
import { useTheme } from "@/hooks/useTheme";

export type LegalSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

type LegalDocumentScreenProps = {
  title: string;
  subtitle: string;
  lastUpdated: string;
  sections: LegalSection[];
  relatedDocument?: {
    label: string;
    path: "/legal/terms" | "/legal/privacy";
  };
};

export function LegalDocumentScreen({
  title,
  subtitle,
  lastUpdated,
  sections,
  relatedDocument,
}: LegalDocumentScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const topPad = insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 8, borderBottomColor: colors.border },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: colors.inputBg, opacity: pressed ? 0.65 : 1 },
          ]}
          onPress={() => router.replace("/")}
          accessibilityRole="button"
          accessibilityLabel="Back to home"
          testID="legal-back-button"
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {PRODUCT_NAME} · Legal information
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.documentIntro,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.documentTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.documentSubtitle, { color: colors.textSecondary }]}>
            {subtitle}
          </Text>
          <Text style={[styles.updated, { color: colors.textTertiary }]}>
            Last updated {lastUpdated}
          </Text>
        </View>

        {sections.map(section => (
          <View key={section.heading} style={styles.section}>
            <Text style={[styles.sectionHeading, { color: colors.text }]}>
              {section.heading}
            </Text>
            {section.paragraphs?.map((paragraph, index) => (
              <Text
                key={`${section.heading}-paragraph-${index}`}
                style={[styles.body, { color: colors.textSecondary }]}
              >
                {paragraph}
              </Text>
            ))}
            {section.bullets?.map((bullet, index) => (
              <View key={`${section.heading}-bullet-${index}`} style={styles.bulletRow}>
                <View style={[styles.bullet, { backgroundColor: colors.primary }]} />
                <Text style={[styles.body, styles.bulletText, { color: colors.textSecondary }]}>
                  {bullet}
                </Text>
              </View>
            ))}
          </View>
        ))}

        <View style={[styles.contactCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Feather name="mail" size={18} color={colors.primary} />
          <View style={styles.noticeCopy}>
            <Text style={[styles.contactTitle, { color: colors.text }]}>
              Questions about this document?
            </Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              Contact us at{" "}
              <Text
                style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}
                onPress={() => { void Linking.openURL(`mailto:${SUPPORT_EMAIL}`); }}
                accessibilityRole="link"
              >
                {SUPPORT_EMAIL}
              </Text>
              .
            </Text>
          </View>
        </View>

        {relatedDocument ? (
          <Pressable
            style={({ pressed }) => [
              styles.relatedLink,
              { borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
            ]}
            onPress={() => router.push(relatedDocument.path)}
            accessibilityRole="link"
          >
            <Text style={[styles.relatedLinkText, { color: colors.primary }]}>
              {relatedDocument.label}
            </Text>
            <Feather name="arrow-right" size={17} color={colors.primary} />
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1 },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  headerSubtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  headerSpacer: { width: 38 },
  content: { padding: 16, gap: 16 },
  documentIntro: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 20,
  },
  documentTitle: {
    fontSize: 27,
    lineHeight: 33,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.4,
  },
  documentSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
  },
  updated: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 14 },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
  },
  noticeCopy: { flex: 1, gap: 4 },
  noticeTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  noticeText: { fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular" },
  section: { gap: 8 },
  sectionHeading: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: "Inter_700Bold",
    marginTop: 3,
  },
  body: { fontSize: 14, lineHeight: 21, fontFamily: "Inter_400Regular" },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  bulletText: { flex: 1 },
  contactCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
  },
  contactTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  relatedLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  relatedLinkText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});