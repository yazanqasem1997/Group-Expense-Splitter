import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { useApp } from "@/context/AppContext";
import { useAccountDrawer } from "@/context/AccountDrawerContext";
import { useTheme } from "@/hooks/useTheme";

/** Small circular avatar button shown in the top-right of every tab header. */
export function AvatarHeaderButton() {
  const { currentUser } = useApp();
  const { openDrawer } = useAccountDrawer();
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={openDrawer}
      hitSlop={8}
      style={styles.btn}
      accessibilityLabel="Open account"
      accessibilityRole="button"
    >
      <View
        style={[
          styles.ring,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
            shadowColor: colors.shadow,
          },
        ]}
      >
        <Avatar
          name={currentUser.name}
          color={currentUser.avatarColor}
          size={38}
          imageUri={currentUser.photo}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { marginLeft: "auto" },
  ring: {
    borderRadius: 22,
    borderWidth: 1.5,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
});
