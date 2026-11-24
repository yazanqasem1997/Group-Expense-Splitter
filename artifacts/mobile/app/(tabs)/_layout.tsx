import { IntroGuide } from "@/components/IntroGuide";
import { onPush } from "@/utils/pushEvents";
import { unseenGroupIds, useGroupSeen } from "@/utils/groupSeen";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React, { useRef } from "react";
import { Dimensions, Platform, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { scrollRegistry } from "@/hooks/scrollRegistry";
import { useApp, AppNotification } from "@/context/AppContext";
import { AccountDrawerProvider } from "@/context/AccountDrawerContext";
import { AccountDrawer } from "@/components/AccountDrawer";
import { api } from "@/services/apiSync";
import { PURCHASES_LIVE } from "@/constants/brand";

const TAB_HEIGHT = 68;
const PILL_RADIUS = 26;
const SIDE_MARGIN = 18;

// Tabs that are actually visible in the bar (exclude hidden routing-only tabs)
const VISIBLE_TABS = ["activity", "index", "friends", ...(PURCHASES_LIVE ? ["plans"] : [])];

function UnreadDot() {
  return (
    <View
      style={{
        position: "absolute",
        top: -5,
        right: -6,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: "#E5353F",
        borderWidth: 1.5,
        borderColor: "#fff",
      }}
    />
  );
}

/** Soft pill highlight behind the focused tab icon */
function ActivePill({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.primary + "18",
        borderRadius: 13,
        paddingHorizontal: 13,
        paddingVertical: 6,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </View>
  );
}

// ─── Custom floating tab bar ───────────────────────────────────────────────────

type NavRoute = { key: string; name: string };
type FloatingTabBarProps = {
  state: { index: number; routes: NavRoute[] };
  descriptors: Record<string, { options: any }>;
  /** Expo Router 58 passes navigateToTab + emitter; older versions passed navigation. */
  navigateToTab?: (routeKey: string) => void;
  emitter?: { emit: (event: any) => any };
  navigation?: any;
  hasUnread: boolean;
  isDark: boolean;
};

function FloatingTabBar({
  state,
  descriptors,
  navigateToTab,
  emitter,
  navigation,
  hasUnread,
  isDark,
}: FloatingTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  const floatingBottom = isWeb
    ? 10
    : Math.max(insets.bottom - 4, 2);

  // Build ordered list of visible routes for swipe navigation
  const visibleRoutes = state.routes.filter(r => VISIBLE_TABS.includes(r.name));

  // Keep always-fresh refs so the PanResponder closure (created once) never
  // captures a stale state or visibleRoutes value.
  const stateRef = useRef(state);
  stateRef.current = state;
  const visibleRef = useRef(visibleRoutes);
  visibleRef.current = visibleRoutes;

  const navRef = useRef({ navigateToTab, navigation });
  navRef.current = { navigateToTab, navigation };
  const goTo = (route: NavRoute) => {
    const nav = navRef.current;
    if (nav.navigateToTab) nav.navigateToTab(route.key);
    else nav.navigation?.navigate(route.name);
  };

  const panResponder = useRef(
    PanResponder.create({
      // Claim the gesture after a small horizontal movement — low threshold
      // so sliding feels instant, but vertical scrolling is not blocked.
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 6 && Math.abs(gs.dy) < 30,
      // ← Real-time: switch to whichever tab zone the finger is currently over
      onPanResponderMove: (evt) => {
        const routes = visibleRef.current;
        const screenW = Dimensions.get("window").width;
        const barW = screenW - 2 * SIDE_MARGIN;
        const tabW = barW / routes.length;
        const relX = evt.nativeEvent.pageX - SIDE_MARGIN;
        const idx = Math.max(0, Math.min(Math.floor(relX / tabW), routes.length - 1));
        const target = routes[idx];
        const cur = stateRef.current;
        if (target && target.name !== cur.routes[cur.index].name) {
          goTo(target);
        }
      },
    })
  ).current;

  return (
    <View
      style={{
        position: "absolute",
        left: SIDE_MARGIN,
        right: SIDE_MARGIN,
        bottom: floatingBottom,
        height: TAB_HEIGHT,
        borderRadius: PILL_RADIUS,
         borderWidth: 1,
         borderColor: colors.tabBarBorder,
        // Shadow iOS
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: isDark ? 0.4 : 0.13,
        shadowRadius: 18,
        // Shadow Android
        elevation: 12,
        flexDirection: "row",
      }}
      {...panResponder.panHandlers}
    >
      {/* White/dark pill background — overflow:hidden clips to pill shape
          without touching the outer shadow or the Pressable touch targets */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: PILL_RADIUS,
            backgroundColor: colors.tabBar,
            overflow: "hidden",
          },
        ]}
      />

      {/* Tab items */}
      {state.routes.map((route, index) => {
        if (!VISIBLE_TABS.includes(route.name)) return null;
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const label = (options.title ?? route.name) as string;
        const tintColor = route.name === "plans" ? "#F5A524" : isFocused
          ? colors.primary
          : isDark
          ? "rgba(255,255,255,0.45)"
          : "rgba(0,0,0,0.38)";

        const onPress = () => {
          const event = (emitter ?? navigation)?.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          }) ?? { defaultPrevented: false };
          if (!isFocused && !event.defaultPrevented) {
            goTo(route);
          } else if (isFocused) {
            scrollRegistry.trigger(route.name);
          }
        };

        const icon = options.tabBarIcon?.({ focused: isFocused, color: tintColor, size: 24 });

        return (
          <Pressable
            key={route.key}
            style={{
              flex: 1,
              height: TAB_HEIGHT,
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
            }}
            onPress={onPress}
            accessible
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={label}
          >
            {icon}
            <Text
              style={{
                fontSize: 10,
                fontFamily: "Inter_500Medium",
                color: tintColor,
              }}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

function ClassicTabLayout() {
  const { colors, isDark } = useTheme();
  const { notifications, hasNewActivity, retrySync, isLoading } = useApp();
  const isIOS = Platform.OS === "ios";
  const hasUnread = hasNewActivity || notifications.some((n: AppNotification) => !n.read);
  const { expenses: dotExpenses, settlements: dotSettlements, currentUser: dotMe } = useApp();
  const groupSeen = useGroupSeen();
  const hasNewOneOff = notifications.some((n: AppNotification) => !n.read && String(n.type).startsWith("direct_payment"));
  const hasNewGroup = notifications.some((n: AppNotification) => !n.read && (n.type === "member_added" || n.type === "group_message"))
    || unseenGroupIds(groupSeen, dotExpenses, dotSettlements, dotMe.id).size > 0;
  // Friend requests waiting for this user put a red dot on the Friends tab.
  const [pendingRequests, setPendingRequests] = React.useState(0);
  const loadPendingRequests = React.useCallback(() => {
    api.listFriendRequests()
      .then(list => setPendingRequests(list.filter(r => r.direction === "received" && r.status === "pending").length))
      .catch(() => {});
  }, []);
  React.useEffect(() => {
    loadPendingRequests();
    const timer = setInterval(loadPendingRequests, 300000);
    const offPush = onPush(d => { if (d.type === "friend_request") loadPendingRequests(); });
    return () => { clearInterval(timer); offPush(); };
  }, [loadPendingRequests]);

  return (
    <AccountDrawerProvider>
      <AccountDrawer />
      <>
      <Tabs
      tabBar={(props) => (
        <FloatingTabBar {...props} hasUnread={hasUnread} isDark={isDark} />
      )}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.38)",
      }}
    >
      <Tabs.Screen
        name="activity"
        options={{
          title: "Activity",
          tabBarIcon: ({ color, focused }) => {
            const icon = <Feather name="activity" size={22} color={color as string} />;
            return (
              <View>
                {focused ? <ActivePill>{icon}</ActivePill> : icon}
                {hasUnread && <UnreadDot />}
              </View>
            );
          },
        }}
        listeners={({ navigation }) => ({
          focus: () => {
            scrollRegistry.trigger("activity");
          },
          tabPress: () => {
            if (navigation.isFocused()) scrollRegistry.trigger("activity");
          },
        })}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: "One-Offs",
          tabBarIcon: ({ color, focused }) => {
            const icon = isIOS ? (
              <SymbolView name="target" tintColor={color} size={22} />
            ) : (
              <Feather name="target" size={22} color={color as string} />
            );
            return (
              <View>
                {focused ? <ActivePill>{icon}</ActivePill> : icon}
                {hasNewOneOff && <UnreadDot />}
              </View>
            );
          },
        }}
        listeners={({ navigation }) => ({
          focus: () => {
            scrollRegistry.trigger("analytics");
          },
          tabPress: () => {
            if (navigation.isFocused()) scrollRegistry.trigger("analytics");
          },
        })}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Groups",
          tabBarIcon: ({ color, focused }) => {
            const icon = isIOS ? (
              <SymbolView name="house" tintColor={color} size={24} />
            ) : (
              <Feather name="home" size={22} color={color as string} />
            );
            return (
              <View>
                {focused ? <ActivePill>{icon}</ActivePill> : icon}
                {hasNewGroup && <UnreadDot />}
              </View>
            );
          },
        }}
        listeners={({ navigation }) => ({
          focus: () => {
            scrollRegistry.trigger("index");
            if (!isLoading) void retrySync();
          },
          tabPress: () => {
            if (navigation.isFocused()) scrollRegistry.trigger("index");
          },
        })}
      />
      {/* recurring stays in (tabs) for routing but is hidden — redirects to /recurring */}
      <Tabs.Screen
        name="recurring"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: "Friends",
          tabBarIcon: ({ color, focused }) => {
            const icon = isIOS ? (
              <SymbolView name="person.2" tintColor={color} size={24} />
            ) : (
              <Feather name="users" size={22} color={color as string} />
            );
            return (
              <View>
                {focused ? <ActivePill>{icon}</ActivePill> : icon}
                
                {pendingRequests > 0 && <UnreadDot />}
              </View>
            );
          },
        }}
        listeners={({ navigation }) => ({
          focus: () => {
            scrollRegistry.trigger("friends");
            loadPendingRequests();
          },
          tabPress: () => {
            if (navigation.isFocused()) scrollRegistry.trigger("friends");
          },
        })}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: "Plus",
          href: PURCHASES_LIVE ? undefined : null,
          tabBarIcon: ({ color }) => <Ionicons name="star" size={22} color="#F5A524" />,
        }}
      />
      <Tabs.Screen name="account" options={{ href: null }} />
    </Tabs>
      <IntroGuide />
    </>
    </AccountDrawerProvider>
  );
}

export default function TabLayout() {
  return <ClassicTabLayout />;
}

const styles = StyleSheet.create({});
