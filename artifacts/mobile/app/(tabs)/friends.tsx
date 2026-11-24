import HiddenStore from "@react-native-async-storage/async-storage";
import { KeyboardAvoidingView as KAV, Platform as RNPlatform, Share as RNShare } from "react-native";
import type { ComponentRef } from "react";
import { useAuth } from "@clerk/expo";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { TabHeader, TabSearchBar } from "@/components/TabHeader";
import { TideBackdrop } from "@/components/TideBackdrop";
import { WebPullToRefresh } from "@/components/WebPullToRefresh";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Contacts from "expo-contacts/legacy";
import { CameraView, useCameraPermissions } from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { showAlert, useNativeAlertsWhile } from "@/hooks/alertStore";
import { scrollRegistry } from "@/hooks/scrollRegistry";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { formatAmount } from "@/components/AmountText";
import { Avatar } from "@/components/Avatar";
import { AlphabetIndex } from "@/components/AlphabetIndex";
import { EmptyState } from "@/components/EmptyState";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Member, useApp } from "@/context/AppContext";
import { CURRENT_USER_ID_EXPORT } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";
import { timeAgo } from "@/utils/format";
import { summarizeCounterpartyBalances } from "@/utils/balanceMath";
import { api, toUserMessage } from "@/services/apiSync";
import { buildFriendInviteUrl, extractFriendInviteToken } from "@/utils/friendInvite";
import { ALPHABET_INDEX, compareNames, groupByLetter, type LetterGroup } from "@/utils/alphabet";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEMO_RECEIVED_REQUEST_ID = "demo-received-request";

type ContactSuggestion = {
  userId: string;
  name: string;
  email: string;
  avatarColor: string;
  photo?: string;
};

type ContactDirectoryEntry = {
  key: string;
  name: string;
  emails: string[];
  phoneNumbers: string[];
  matches: ContactSuggestion[];
};

type FriendRequestItem = Awaited<ReturnType<typeof api.listFriendRequests>>[number];
type SentFriendItem = {
  key: string;
  name: string;
  request: FriendRequestItem | null;
  member: Member | null;
};

export default function FriendsScreen() {
  const { colors, isDark, refreshIndicatorColor } = useTheme();
  const { isLoaded: authLoaded, isSignedIn, getToken } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const insets = useSafeAreaInsets();
  const {
    members, currentUser, getGroupBalances, groups, convertCurrency, defaultCurrency,
    addMember, seedDemoFriends, updateMember, removeMember,
    sendAppInvitation,
    checkAndAddRecurring, fetchExchangeRates, isLoading,
  } = useApp();

  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    scrollRegistry.register("friends", () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
    return () => scrollRegistry.unregister("friends");
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const [loadingDemoFriends, setLoadingDemoFriends] = useState(false);
  const [findingContacts, setFindingContacts] = useState(false);
  const [contactDirectory, setContactDirectory] = useState<ContactDirectoryEntry[]>([]);
  const matchedContacts = contactDirectory.filter((contact) => contact.matches.length > 0);
  const otherContacts = contactDirectory.filter((contact) => contact.matches.length === 0);
  // Sections and letters are positioned via onLayout so the A–Z rail can jump to them.
  const layoutYRef = useRef<Record<string, number>>({});
  const [tabsHeight, setTabsHeight] = useState(0);
  const [contactMatchMessage, setContactMatchMessage] = useState("");
  const [friendRequests, setFriendRequests] = useState<FriendRequestItem[]>([]);
  const [friendRequestsError, setFriendRequestsError] = useState("");
  const [workingRequestId, setWorkingRequestId] = useState<string | null>(null);
  const [myFriendQr, setMyFriendQr] = useState<Awaited<ReturnType<typeof api.createFriendQr>> | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [showQrSheet, setShowQrSheet] = useState(false);
  const [qrMode, setQrMode] = useState<"show" | "scan">("show");
  const [qrError, setQrError] = useState("");
  const [scannedQrToken, setScannedQrToken] = useState<string | null>(null);
  const [scannedQrProfile, setScannedQrProfile] = useState<Awaited<ReturnType<typeof api.previewFriendQr>> | null>(null);
  const qrScanLocked = useRef(false);

  const loadFriendRequests = useCallback(async () => {
    try {
      const requests = await api.listFriendRequests();
      setFriendRequests(requests);
      setFriendRequestsError("");
      const knownIds = new Set(members.map((member) => member.userId).filter(Boolean));
      const knownEmails = new Set(members.map((member) => member.email?.trim().toLowerCase()).filter(Boolean));
      for (const request of requests) {
        if (request.status !== "accepted") continue;
        const existingMember = members.find((member) => member.userId === request.otherUser.id);
        if (existingMember && hiddenFriendIds.includes(existingMember.id)) {
          setHiddenFriendIds(prev => { const next = prev.filter(x => x !== existingMember.id); HiddenStore.setItem("hiddenFriendIds:v1", JSON.stringify(next)).catch(() => {}); return next; });
        }
        if (existingMember) {
          const photo = request.otherUser.photo ?? undefined;
          if (existingMember.photo !== photo) {
            updateMember(existingMember.id, { photo });
            break;
          }
          continue;
        }
        if (knownIds.has(request.otherUser.id) || (request.otherUser.email && knownEmails.has(request.otherUser.email.toLowerCase()))) continue;
        addMember({
          name: request.otherUser.name,
          email: request.otherUser.email ?? undefined,
          avatarColor: request.otherUser.avatarColor,
          photo: request.otherUser.photo ?? undefined,
          userId: request.otherUser.id,
          isPending: false,
        });
        knownIds.add(request.otherUser.id);
        if (request.otherUser.email) knownEmails.add(request.otherUser.email.toLowerCase());
        break;
      }
    } catch (error) {
      setFriendRequestsError(toUserMessage(error, "Couldn't load friend requests."));
    }
  }, [addMember, members, updateMember]);

  useEffect(() => {
    if (!authLoaded || !isSignedIn || isLoading) return;
    let cancelled = false;
    void (async () => {
      // Resolve Clerk's session first; the shared API token getter is installed
      // by AppProvider during the same authentication transition.
      try {
        await getToken();
      } catch {
        // The request below will surface a friendly authentication message.
      }
      if (!cancelled) void loadFriendRequests();
    })();
    return () => { cancelled = true; };
  }, [authLoaded, getToken, isLoading, isSignedIn, loadFriendRequests]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    checkAndAddRecurring();
    await fetchExchangeRates().catch(() => {});
    await loadFriendRequests();
    setRefreshing(false);
  }, [checkAndAddRecurring, fetchExchangeRates, loadFriendRequests]);
  const [friendQuery, setFriendQuery] = useState("");

  const handleLoadDemoFriends = useCallback(() => {
    if (loadingDemoFriends) return;
    setLoadingDemoFriends(true);
    const addedCount = seedDemoFriends();
    if (addedCount > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setLoadingDemoFriends(false);
  }, [loadingDemoFriends, seedDemoFriends]);

  // Add-friend form
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [emailError, setEmailError] = useState("");
  const [nameError, setNameError] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);

  // Contact-edit sheet
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPhoto, setEditPhoto] = useState<string | undefined>(undefined);
  const [photoLoading, setPhotoLoading] = useState(false);

  // People you removed stay removed (the list is rebuilt from shared groups on every refresh).
  const [hiddenFriendIds, setHiddenFriendIds] = useState<string[]>([]);
  useEffect(() => {
    HiddenStore.getItem("hiddenFriendIds:v1").then(v => { if (v) setHiddenFriendIds(JSON.parse(v)); }).catch(() => {});
  }, []);
  useNativeAlertsWhile(!!editingMember);
  function hideFriend(id: string) {
    // Registered friends use their user id as the member id, so fall back to it.
    const m = members.find(x => x.id === id);
    const uid = m?.userId ?? (/^[0-9a-f-]{36}$/i.test(id) ? id : undefined);
    if (uid) api.removeFriendRemote(uid).catch(() => {});
    setHiddenFriendIds(prev => {
      const next = Array.from(new Set([...prev, id]));
      HiddenStore.setItem("hiddenFriendIds:v1", JSON.stringify(next)).catch(() => {});
      return next;
    });
  }
  const visibleMembers = members.filter(m => !hiddenFriendIds.includes(m.id));
  const activeFriends = useMemo(
    () => members
      .filter(m => !m.isCurrentUser && !m.isPending && !hiddenFriendIds.includes(m.id))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [members, hiddenFriendIds],
  );
  const pendingFriends = useMemo(
    () => members
      .filter(m => !m.isCurrentUser && m.isPending)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [members],
  );
  const search = friendQuery.trim().toLocaleLowerCase();
  const visibleActiveFriends = useMemo(
    () => activeFriends.filter(member => {
      if (!search) return true;
      return `${member.name} ${member.email ?? ""}`.toLocaleLowerCase().includes(search);
    }),
    [activeFriends, search],
  );
  const visiblePendingFriends = useMemo(
    () => pendingFriends.filter(member => {
      if (!search) return true;
      return `${member.name} ${member.email ?? ""}`.toLocaleLowerCase().includes(search);
    }),
    [pendingFriends, search],
  );
  const [activeListTab, setActiveListTab] = useState<"friends" | "requests" | "contacts">("friends");
  // Development-only sample so the received-request layout can be previewed without a second account.
  const [demoRequestDismissed, setDemoRequestDismissed] = useState(false);
  const demoReceivedRequest = useMemo<FriendRequestItem | null>(() => (
    __DEV__ && !demoRequestDismissed
      ? {
          id: DEMO_RECEIVED_REQUEST_ID,
          direction: "received",
          status: "pending",
          createdAt: new Date().toISOString(),
          otherUser: { id: DEMO_RECEIVED_REQUEST_ID, name: "Sara Demo", email: "Demo request", avatarColor: "#7C5CFC", photo: null },
        }
      : null
  ), [demoRequestDismissed]);
  const byOtherUserName = (a: FriendRequestItem, b: FriendRequestItem) => compareNames(a.otherUser.name, b.otherUser.name);
  const incomingFriendRequests = [
    ...friendRequests.filter((request) => request.direction === "received" && request.status === "pending"),
    ...(demoReceivedRequest ? [demoReceivedRequest] : []),
  ].sort(byOtherUserName);
  const sentFriendRequests = friendRequests
    .filter((request) => request.direction === "sent" && request.status === "pending")
    .sort(byOtherUserName);
  const requestCount = incomingFriendRequests.length + sentFriendRequests.length + pendingFriends.length;
  const matchesRequestSearch = (request: FriendRequestItem) =>
    !search || `${request.otherUser.name} ${request.otherUser.email ?? ""}`.toLocaleLowerCase().includes(search);
  const visibleIncomingRequests = incomingFriendRequests.filter(matchesRequestSearch);
  const visibleSentRequests = sentFriendRequests.filter(matchesRequestSearch);
  const matchesContactSearch = (contact: ContactDirectoryEntry) =>
    !search || [contact.name, ...contact.emails, ...contact.phoneNumbers, ...contact.matches.map((match) => match.name)]
      .join(" ").toLocaleLowerCase().includes(search);
  const contactDisplayName = (contact: ContactDirectoryEntry) => contact.matches[0]?.name ?? contact.name;
  const visibleMatchedContacts = matchedContacts.filter(matchesContactSearch);
  const visibleOtherContacts = otherContacts.filter(matchesContactSearch);
  const friendGroups = groupByLetter(visibleActiveFriends, (member) => member.name);
  const deferredListTab = useDeferredValue(activeListTab);
  const matchedContactGroups = groupByLetter(visibleMatchedContacts, contactDisplayName);
  const [contactLimit, setContactLimit] = useState(60);
  const otherContactGroups = useMemo(() => groupByLetter(visibleOtherContacts.slice(0, contactLimit), contactDisplayName), [visibleOtherContacts.length, contactLimit, friendQuery, contactDirectory]);
  const sentItems: SentFriendItem[] = [
    ...visibleSentRequests.map((request) => ({ key: request.id, name: request.otherUser.name, request, member: null })),
    ...visiblePendingFriends.map((member) => ({ key: member.id, name: member.name, request: null, member })),
  ].sort((a, b) => compareNames(a.name, b.name));
  const incomingRequestGroups = groupByLetter(visibleIncomingRequests, (request) => request.otherUser.name);
  const sentRequestGroups = groupByLetter(sentItems, (item) => item.name);
  const indexedSections: { key: string; groups: LetterGroup<unknown>[] }[] =
    activeListTab === "friends"
      ? [{ key: "friends", groups: friendGroups }]
      : activeListTab === "requests"
        ? [
            { key: "requests-incoming", groups: incomingRequestGroups },
            { key: "requests-sent", groups: sentRequestGroups },
          ]
        : activeListTab === "contacts"
          ? [{ key: "contacts-matched", groups: matchedContactGroups }, { key: "contacts-other", groups: otherContactGroups }]
          : [];
  const availableLetters = new Set(indexedSections.flatMap((section) => section.groups.map((group) => group.letter)));
  const showAlphabetIndex = !search && availableLetters.size > 0 && activeListTab !== "requests";
  const tabTextColor = isDark ? colors.text : "#000000";
  const searchPlaceholder = activeListTab === "contacts"
    ? "Search contacts"
    : activeListTab === "requests" ? "Search requests" : "Search friends by name or email";

  useEffect(() => {
    if (!__DEV__ || isLoading || activeFriends.length > 0) return;
    seedDemoFriends();
  }, [activeFriends.length, isLoading, seedDemoFriends]);

  // Per-friend balance across all groups, converted to the user's currency
  // before adding (groups can use different currencies).
  const friendBalances = useMemo(
    () => summarizeCounterpartyBalances(
      groups.map(group => ({ currency: group.currency, debts: getGroupBalances(group.id) })),
      currentUser.id,
      convertCurrency,
    ),
    [groups, getGroupBalances, currentUser.id, convertCurrency],
  );

  const topPad = insets.top;

  async function handleFindFriendsFromContacts() {
    if (findingContacts) return;
    if (Platform.OS === "web") {
      showAlert("Use the mobile app", "Contact matching is available in the iOS and Android apps.", [{ text: "OK" }]);
      return;
    }
    setFindingContacts(true);
    setContactMatchMessage("");
    let localContacts: ContactDirectoryEntry[] = [];
    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (!permission.granted) {
        if (!permission.canAskAgain) {
          showAlert("Contacts access is off", "Enable Contacts access in device settings to find friends.", [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => { void Linking.openSettings().catch(() => {}); } },
          ]);
        } else {
          setContactMatchMessage("Allow Contacts access to find people you know on Split Mate.");
        }
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
      });
      localContacts = data.flatMap((contact, index) => {
        const emails = Array.from(new Set(
          (contact.emails ?? [])
            .map((address) => address.email?.trim().toLowerCase())
            .filter((email): email is string => !!email && EMAIL_RE.test(email)),
        ));
        const phoneNumbers = Array.from(new Set(
          (contact.phoneNumbers ?? [])
            .map((phone) => phone.number?.trim())
            .filter((phone): phone is string => !!phone),
        ));
        if (emails.length === 0 && phoneNumbers.length === 0) return [];
        const name = contact.name?.trim() || emails[0] || phoneNumbers[0] || "Contact";
        return [{
          key: contact.id || `${name.toLowerCase()}-${emails.join(",")}-${phoneNumbers.join(",")}-${index}`,
          name,
          emails,
          phoneNumbers,
          matches: [],
        }];
      });
      setContactDirectory(localContacts);

      const emails = Array.from(new Set(localContacts.flatMap((contact) => contact.emails)));
      if (localContacts.length === 0) {
        setContactMatchMessage("No contacts with an email address or phone number were found.");
        return;
      }
      if (emails.length === 0) {
        setContactMatchMessage("Your contacts are shown on this device. Email addresses are needed to find existing Split Mate users.");
        return;
      }

      const matchedUsers: Awaited<ReturnType<typeof api.matchContacts>> = [];
      for (let index = 0; index < emails.length; index += 500) {
        matchedUsers.push(...await api.matchContacts(emails.slice(index, index + 500)));
      }
      const usersByEmail = new Map<string, ContactSuggestion>();
      matchedUsers.forEach((user) => {
        if (!user.email) return;
        usersByEmail.set(user.email.trim().toLowerCase(), {
          userId: user.id,
          name: user.name,
          email: user.email,
          avatarColor: user.avatarColor,
          photo: user.photo ?? undefined,
        });
      });
      const directory = localContacts.map((contact) => ({
        ...contact,
        matches: Array.from(new Map(
          contact.emails
            .map((email) => usersByEmail.get(email))
            .filter((match): match is ContactSuggestion => !!match)
            .map((match) => [match.userId, match]),
        ).values()),
      }));
      setContactDirectory(directory);
      const matchedCount = directory.filter((contact) => contact.matches.length > 0).length;
      setContactMatchMessage(
        matchedCount
          ? `${matchedCount} of ${directory.length} contacts use Split Mate. Send a friend request below to add them.`
          : `Showing ${directory.length} contacts on this device. No existing Split Mate accounts matched their email addresses.`,
      );
    } catch (error) {
      setContactDirectory(localContacts);
      setContactMatchMessage(toUserMessage(error, "Couldn't check your contacts. Please try again."));
    } finally {
      setFindingContacts(false);
    }
  }

  async function handleAddContactMatch(match: ContactSuggestion) {
    setWorkingRequestId(match.userId);
    try {
      const request = await api.sendFriendRequest(match.userId);
      setFriendRequests((current) => [request, ...current.filter((item) => item.id !== request.id)]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      showAlert("Request not sent", toUserMessage(error, "Couldn't send the friend request."));
    } finally {
      setWorkingRequestId(null);
    }
  }

  async function handleInviteContactByEmail(contact: ContactDirectoryEntry) {
    const invitedEmail = contact.emails[0];
    if (!invitedEmail) return;
    const existingMember = visibleMembers.find(
      (member) => member.email?.trim().toLowerCase() === invitedEmail,
    );
    if (existingMember) {
      showAlert(
        "Already invited",
        existingMember.isPending ? "An invitation is already pending for this contact." : "This person is already in your friends list.",
        [{ text: "OK" }],
      );
      return;
    }

    const workingId = `contact-invite:${contact.key}`;
    setWorkingRequestId(workingId);
    addMember({ name: contact.name, email: invitedEmail, avatarColor: "", isPending: true });
    const sent = await sendAppInvitation(invitedEmail, contact.name);
    setWorkingRequestId(null);
    if (!sent) {
      showAlert("Invitation email not sent", `The contact was added, but the invitation email to ${invitedEmail} could not be sent.`, [{ text: "OK" }]);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert("Invitation sent", `An invitation email was sent to ${invitedEmail}.`, [{ text: "OK" }]);
  }

  async function handleFriendRequestAction(request: FriendRequestItem, action: "accept" | "decline") {
    if (request.id === DEMO_RECEIVED_REQUEST_ID) {
      // The sample request is local only; never send it to the server or add it as a real friend.
      setDemoRequestDismissed(true);
      Haptics.notificationAsync(action === "accept" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
      return;
    }
    setWorkingRequestId(request.id);
    try {
      const updated = action === "accept"
        ? await api.acceptFriendRequest(request.id)
        : await api.declineFriendRequest(request.id);
      setFriendRequests((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (action === "accept") {
        const friend = request.otherUser;
        if (!members.some((member) => member.userId === friend.id || (friend.email && member.email?.toLowerCase() === friend.email.toLowerCase()))) {
          addMember({
            name: friend.name,
            email: friend.email ?? undefined,
            avatarColor: friend.avatarColor,
            photo: friend.photo ?? undefined,
            userId: friend.id,
            isPending: false,
          });
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch (error) {
      showAlert("Request not updated", toUserMessage(error, "Couldn't update this friend request."));
    } finally {
      setWorkingRequestId(null);
    }
  }

  async function loadMyFriendQr() {
    setQrLoading(true);
    setQrError("");
    try {
      setMyFriendQr(await api.createFriendQr());
    } catch (error) {
      setMyFriendQr(null);
      setQrError(toUserMessage(error, "Couldn't create your friend QR code."));
    } finally {
      setQrLoading(false);
    }
  }

  function resetQrScan() {
    qrScanLocked.current = false;
    setScannedQrToken(null);
    setScannedQrProfile(null);
    setQrError("");
  }

  function openQrSheet() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetQrScan();
    setQrMode("show");
    setShowQrSheet(true);
    const expiresSoon = !myFriendQr || new Date(myFriendQr.expiresAt).getTime() - Date.now() < 60 * 60 * 1000;
    if (expiresSoon) void loadMyFriendQr();
  }

  function closeQrSheet() {
    setShowQrSheet(false);
    resetQrScan();
  }

  async function switchQrMode(mode: "show" | "scan") {
    if (mode === qrMode) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetQrScan();
    setQrMode(mode);
    if (mode === "show" && !myFriendQr) void loadMyFriendQr();
    if (mode === "scan" && Platform.OS !== "web" && !cameraPermission?.granted && cameraPermission?.canAskAgain !== false) {
      await requestCameraPermission();
    }
  }

  async function handleFriendQrScanned(data: string) {
    if (qrScanLocked.current) return;
    qrScanLocked.current = true;
    const token = extractFriendInviteToken(data);
    if (!token) {
      setQrError("That isn't a Split Mate friend QR code.");
      // Pause briefly so the same unrelated code isn't re-read on every frame.
      setTimeout(() => { qrScanLocked.current = false; }, 1500);
      return;
    }
    setQrLoading(true);
    setQrError("");
    try {
      const profile = await api.previewFriendQr(token);
      setScannedQrToken(token);
      setScannedQrProfile(profile);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setQrError(toUserMessage(error, "This QR code is invalid or has expired."));
      setTimeout(() => { qrScanLocked.current = false; }, 1500);
    } finally {
      setQrLoading(false);
    }
  }

  async function sendFriendRequestFromQr() {
    if (!scannedQrToken) return;
    setQrLoading(true);
    setQrError("");
    try {
      const request = await api.sendFriendRequestWithQr(scannedQrToken);
      setFriendRequests((current) => [request, ...current.filter((item) => item.id !== request.id)]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeQrSheet();
      setActiveListTab("requests");
    } catch (error) {
      setQrError(toUserMessage(error, "Couldn't send the friend request."));
    } finally {
      setQrLoading(false);
    }
  }

  // Keep Friends in sync with the slow ambient motion used across the app.
  const backgroundMotion = useSharedValue(0);
  useEffect(() => {
    backgroundMotion.value = withRepeat(
      withTiming(1, { duration: 15000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(backgroundMotion);
  }, [backgroundMotion]);

  const orbPrimaryStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: backgroundMotion.value * 34 },
      { translateY: backgroundMotion.value * 20 },
      { scale: 1 + backgroundMotion.value * 0.06 },
    ],
  }));
  const orbSecondaryStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: backgroundMotion.value * -38 },
      { translateY: backgroundMotion.value * 26 },
      { scale: 1.06 - backgroundMotion.value * 0.05 },
    ],
  }));

  // ── add-friend ─────────────────────────────────────────────────────────────

  async function handleAddFriend() {
    if (sendingInvite) return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail) { setEmailError("Email is required"); return; }
    if (!EMAIL_RE.test(trimmedEmail)) { setEmailError("Enter a valid email address"); return; }
    const trimmedName = name.trim();
    if (!trimmedName) { setNameError("Name is required"); return; }
    setNameError("");
    const alreadyExists = visibleMembers.some(m => m.email?.toLowerCase() === trimmedEmail.toLowerCase());
    if (alreadyExists) { setEmailError("This email is already in your friends list"); return; }
    const derivedName = trimmedName;
    setSendingInvite(true);
    // Already on Split Mate: send a real request that shows up in their app.
    try {
      const request = await api.sendFriendRequestByEmail(trimmedEmail);
      setSendingInvite(false);
      setFriendRequests((current) => [request, ...current.filter((item) => item.id !== request.id)]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert("Friend request sent", `${derivedName} is on Split Mate, so the request went straight to their app.`, [{ text: "OK" }]);
      setEmail(""); setName(""); setEmailError(""); setNameError(""); setShowInviteModal(false);
      return;
    } catch (error) {
      const message = toUserMessage(error, "");
      if (/already friends/i.test(message)) { setSendingInvite(false); setEmailError("You're already friends"); return; }
      if (/already pending/i.test(message)) { setSendingInvite(false); setEmailError("A request is already pending"); return; }
      // Not registered (or offline): fall back to the email invitation below.
    }
    const newMember = addMember({ name: derivedName, email: trimmedEmail, avatarColor: "", isPending: true });
    const sent = await sendAppInvitation(trimmedEmail, derivedName);
    setSendingInvite(false);
    if (!sent) {
      setEmailError("The contact was added, but the invitation email could not be sent");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert("Invitation sent", `An invitation has been sent to ${newMember.email}.`, [{ text: "OK" }]);
    setEmail(""); setName(""); setEmailError(""); setNameError(""); setShowInviteModal(false);
  }

  function handleResend(member: Member) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert(
      "Invite resent",
      `A new invitation has been sent to ${member.email ?? member.name}.`,
      [{ text: "OK" }]
    );
  }

  // ── contact-edit sheet ─────────────────────────────────────────────────────

  function openEditSheet(member: Member) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEditingMember(member);
    setEditName(member.name);
    setEditEmail(member.email ?? "");
    setEditPhone(member.phone ?? "");
    setEditPhoto(member.photo);
  }

  function closeEditSheet() {
    setEditingMember(null);
    setPhotoLoading(false);
  }

  async function pickFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showAlert("Permission needed", "Allow photo library access to set a contact photo.");
      return;
    }
    setPhotoLoading(true);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    setPhotoLoading(false);
    if (!result.canceled) setEditPhoto(result.assets[0].uri);
  }

  async function pickFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      showAlert("Permission needed", "Allow camera access to take a contact photo.");
      return;
    }
    setPhotoLoading(true);
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    setPhotoLoading(false);
    if (!result.canceled) setEditPhoto(result.assets[0].uri);
  }

  function handlePickPhoto() {
    showAlert("Add Photo", "Choose a photo source", [
      { text: "Take Photo", onPress: pickFromCamera },
      { text: "Choose from Library", onPress: pickFromLibrary },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function handleSaveContact() {
    if (!editingMember) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      showAlert("Name required", "Please enter a name for this contact.");
      return;
    }
    const trimmedEmail = editEmail.trim();
    if (!trimmedEmail) {
      showAlert("Email required", "Please enter an email address for this contact.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      showAlert("Check email", "Please enter a valid email address.");
      return;
    }
    updateMember(editingMember.id, {
      name: trimmedName,
      email: trimmedEmail,
      phone: editPhone.trim() || undefined,
      photo: editPhoto,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    closeEditSheet();
  }

  function handleRemovePhoto() {
    setEditPhoto(undefined);
  }

  function handleRemoveInvite() {
    if (!editingMember) return;
    showAlert(
      "Remove invite",
      `Remove the pending invite for ${editingMember.name}? They won't be able to join using this invite.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            hideFriend(editingMember.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            closeEditSheet();
          },
        },
      ]
    );
  }

  function handleRemoveFriend() {
    if (!editingMember) return;

    // Block if the friend has ANY unsettled debt in any shared group, regardless
    // of which counterparty they owe — removing them would orphan those records.
    const sharedGroupsWithBalance = groups.filter(g => {
      if (!g.memberIds.includes(editingMember.id)) return false;
      const debts = getGroupBalances(g.id);
      return debts.some(
        d => d.fromId === editingMember.id || d.toId === editingMember.id
      );
    });
    const hasOutstandingBalance = sharedGroupsWithBalance.length > 0;

    if (hasOutstandingBalance) {
      const gc = sharedGroupsWithBalance.length;
      // Supplementary: show the directional balance with the current user if any.
      const netBalance = friendBalances[editingMember.id] ?? 0;
      const balanceLine =
        Math.abs(netBalance) >= 0.01
          ? `\n\n${netBalance > 0 ? `${editingMember.name} owes you` : `You owe ${editingMember.name}`} ${formatAmount(Math.abs(netBalance), defaultCurrency)}.`
          : "";
      showAlert(
        "Settle up first",
        `${editingMember.name} still has unsettled balances in ${gc} shared group${gc !== 1 ? "s" : ""}.${balanceLine}\n\nPlease settle all balances before removing them.`,
        [{ text: "OK" }]
      );
      return;
    }

    showAlert(
      "Remove friend",
      `Remove ${editingMember.name} from your friends list?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            hideFriend(editingMember.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            closeEditSheet();
          },
        },
      ]
    );
  }

  // ── alphabetical index ─────────────────────────────────────────────────────

  function recordLayoutY(key: string) {
    return (event: { nativeEvent: { layout: { y: number } } }) => {
      layoutYRef.current[key] = event.nativeEvent.layout.y;
    };
  }

  function jumpToLetter(letter: string) {
    const start = ALPHABET_INDEX.indexOf(letter);
    // Jump to the tapped letter, or the nearest following (then preceding) letter that has entries.
    const ordered = [...ALPHABET_INDEX.slice(start), ...ALPHABET_INDEX.slice(0, start).reverse()];
    const target = ordered.find((candidate) => availableLetters.has(candidate));
    if (!target) return;
    const positions = indexedSections
      .filter((section) => section.groups.some((group) => group.letter === target))
      .map((section) => {
        const y = layoutYRef.current;
        const parts = [y[section.key], y[`${section.key}:card`], y[`${section.key}:${target}`]];
        return parts.every((part) => typeof part === "number") ? parts.reduce((sum, part) => sum + part, 0) : null;
      })
      .filter((value): value is number => value !== null);
    if (positions.length === 0) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, Math.min(...positions) - tabsHeight), animated: false });
  }

  function renderLetterGroups<T>(sectionKey: string, groups: LetterGroup<T>[], renderItem: (item: T) => React.ReactNode) {
    return groups.map((group) => (
      <View key={group.letter} onLayout={recordLayoutY(`${sectionKey}:${group.letter}`)}>
        <Text style={[styles.letterHeading, { color: tabTextColor }]}>{group.letter}</Text>
        {group.items.map(renderItem)}
      </View>
    ));
  }

  // ── render helpers ─────────────────────────────────────────────────────────

  function renderActiveFriend(member: Member) {
    const balance = friendBalances[member.id] ?? 0;
    const isSettled = Math.abs(balance) < 0.01;
    const balanceColor = isSettled
      ? colors.border
      : balance > 0 ? colors.success : colors.danger;
    return (
      <Pressable
        key={member.id}
        style={({ pressed }) => [
          styles.friendRow,
          {
            backgroundColor: colors.cardBg,
            borderColor: colors.border,
            shadowColor: colors.shadow,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
        onPress={() => openEditSheet(member)}
      >
        <View style={styles.avatarWrap}>
          <Avatar name={member.name} color={member.avatarColor} size={40} imageUri={member.photo} />
          {member.photo && (
            <View style={[styles.photoIndicator, { backgroundColor: colors.primary, borderColor: colors.cardBg }]} />
          )}
        </View>
        <View style={styles.friendRowBody}>
          <Text style={[styles.friendRowName, { color: colors.text }]} numberOfLines={1}>{member.name}</Text>
          {member.email ? (
            <Text style={[styles.friendRowMeta, { color: colors.textSecondary }]} numberOfLines={1}>{member.email}</Text>
          ) : member.joinedAt ? (
            <Text style={[styles.friendRowMeta, { color: colors.textTertiary }]}>Joined {timeAgo(member.joinedAt)}</Text>
          ) : null}
        </View>
        <Feather name="chevron-right" size={14} color={colors.textTertiary} />
      </Pressable>
    );
  }

  function renderPendingFriend(member: Member) {
    return (
      <Pressable
        key={member.id}
        style={({ pressed }) => [
          styles.friendRow,
          {
            backgroundColor: colors.cardBg,
            borderColor: colors.border,
            shadowColor: colors.shadow,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
        onPress={() => openEditSheet(member)}
      >
        <Avatar name={member.name} color={member.avatarColor} size={40} imageUri={member.photo} />
        <View style={styles.friendRowBody}>
          <View style={styles.friendRowNameRow}>
            <Text style={[styles.friendRowName, { color: colors.text }]} numberOfLines={1}>{member.name}</Text>
            <View style={[styles.pendingBadge, { backgroundColor: colors.accentTint }]}>
              <Text style={[styles.pendingBadgeText, { color: colors.accent }]}>Pending</Text>
            </View>
          </View>
          {member.email ? (
            <Text style={[styles.friendRowMeta, { color: colors.textSecondary }]} numberOfLines={1}>{member.email}</Text>
          ) : null}
        </View>
        <Pressable
          style={[styles.resendBtn, { backgroundColor: colors.primaryLight, borderColor: colors.primary + "35" }]}
          onPress={e => { e.stopPropagation(); handleResend(member); }}
        >
          <Feather name="send" size={13} color={colors.primary} />
          <Text style={[styles.resendText, { color: colors.primary }]}>Resend</Text>
        </Pressable>
      </Pressable>
    );
  }

  function renderIncomingFriendRequest(request: FriendRequestItem) {
    return (
      <View key={request.id} style={[styles.friendRow, { backgroundColor: colors.cardBg, borderColor: colors.border, shadowColor: colors.shadow }]}>
        <View style={styles.avatarWrap}>
          <Avatar name={request.otherUser.name} color={request.otherUser.avatarColor} size={40} imageUri={request.otherUser.photo ?? undefined} />
        </View>
        <View style={styles.friendRowBody}>
          <Text style={[styles.friendRowName, { color: colors.text }]} numberOfLines={1}>{request.otherUser.name}</Text>
          <Text style={[styles.friendRowMeta, { color: colors.textSecondary }]} numberOfLines={1}>{request.otherUser.email ?? "Wants to connect"}</Text>
        </View>
        <Pressable
          onPress={() => void handleFriendRequestAction(request, "accept")}
          disabled={workingRequestId === request.id}
          accessibilityRole="button"
          accessibilityLabel={`Accept ${request.otherUser.name}'s friend request`}
          style={[styles.contactAddButton, { backgroundColor: colors.primaryLight }]}
        >
          <Feather name="check" size={15} color={colors.primary} />
          <Text style={[styles.contactAddText, { color: colors.primary }]}>Accept</Text>
        </Pressable>
        <Pressable
          onPress={() => void handleFriendRequestAction(request, "decline")}
          disabled={workingRequestId === request.id}
          accessibilityRole="button"
          accessibilityLabel={`Decline ${request.otherUser.name}'s friend request`}
          style={[styles.requestDeclineButton, { borderColor: colors.border }]}
        >
          <Feather name="x" size={16} color={colors.textSecondary} />
        </Pressable>
      </View>
    );
  }

  function renderSentFriendItem(item: SentFriendItem) {
    if (item.member) return renderPendingFriend(item.member);
    if (!item.request) return null;
    const request = item.request;
    return (
      <View key={request.id} style={[styles.friendRow, { backgroundColor: colors.cardBg, borderColor: colors.border, shadowColor: colors.shadow }]}> 
        <Avatar name={request.otherUser.name} color={request.otherUser.avatarColor} size={40} imageUri={request.otherUser.photo ?? undefined} />
        <View style={styles.friendRowBody}>
          <Text style={[styles.friendRowName, { color: colors.text }]} numberOfLines={1}>{request.otherUser.name}</Text>
          <Text style={[styles.friendRowMeta, { color: colors.textSecondary }]} numberOfLines={1}>Friend request · waiting for response</Text>
        </View>
      </View>
    );
  }

  function renderDeviceContact(contact: ContactDirectoryEntry) {
    if (contact.matches.length === 0) {
      const existingMember = visibleMembers.find((member) =>
        contact.emails.includes(member.email?.trim().toLowerCase() ?? ""),
      );
      const inviteWorkingId = `contact-invite:${contact.key}`;
      return (
        <View
          key={contact.key}
          style={[styles.friendRow, { backgroundColor: colors.cardBg, borderColor: colors.border, shadowColor: colors.shadow }]}
        >
          <Avatar name={contact.name} color={colors.primaryLight} size={40} />
          <View style={styles.friendRowBody}>
            <Text style={[styles.friendRowName, { color: colors.text }]} numberOfLines={1}>{contact.name}</Text>
            <Text style={[styles.friendRowMeta, { color: colors.textSecondary }]} numberOfLines={1}>
              {contact.emails[0] ?? contact.phoneNumbers[0] ?? "Contact"}
            </Text>
          </View>
          {existingMember ? (
            <Text style={[styles.friendRowMeta, { color: colors.textTertiary }]}>
              {existingMember.isPending ? "Invite pending" : "Already friends"}
            </Text>
          ) : contact.emails[0] ? (
            <Pressable
              onPress={() => void handleInviteContactByEmail(contact)}
              disabled={workingRequestId === inviteWorkingId}
              accessibilityRole="button"
              accessibilityLabel={`Invite ${contact.name} by email`}
              style={[styles.contactAddButton, { backgroundColor: colors.primaryLight, opacity: workingRequestId === inviteWorkingId ? 0.6 : 1 }]}
            >
              {workingRequestId === inviteWorkingId
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Feather name="mail" size={14} color={colors.primary} />}
              <Text style={[styles.contactAddText, { color: colors.primary }]}>Email invite</Text>
            </Pressable>
          ) : (
            <Text style={[styles.friendRowMeta, { color: colors.textTertiary }]}>WhatsApp after launch</Text>
          )}
        </View>
      );
    }

    return contact.matches.map((match) => {
      const existingMember = visibleMembers.find(
        (member) => member.userId === match.userId ||
          member.email?.trim().toLowerCase() === match.email.trim().toLowerCase(),
      );
      const pendingRequest = friendRequests.find(
        (request) => request.otherUser.id === match.userId && request.status === "pending",
      );
      const isFriend = !!existingMember && !existingMember.isPending;
      const isWorking = workingRequestId === match.userId;
      return (
        <View
          key={`${contact.key}:${match.userId}`}
          style={[styles.friendRow, { backgroundColor: colors.cardBg, borderColor: colors.border, shadowColor: colors.shadow }]}
        >
          <Avatar name={contact.name} color={match.avatarColor} size={40} imageUri={match.photo} />
          <View style={styles.friendRowBody}>
            <Text style={[styles.friendRowName, { color: colors.text }]} numberOfLines={1}>{match.name}</Text>
            <Text style={[styles.friendRowMeta, { color: colors.textSecondary }]} numberOfLines={1}>
              {contact.name !== match.name ? `${contact.name} · ${match.email}` : match.email}
            </Text>
          </View>
          {isFriend ? (
            <Text style={[styles.friendRowMeta, { color: colors.textTertiary }]}>Already friends</Text>
          ) : existingMember?.isPending ? (
            <Text style={[styles.friendRowMeta, { color: colors.textTertiary }]}>Invite pending</Text>
          ) : pendingRequest?.direction === "sent" ? (
            <Text style={[styles.friendRowMeta, { color: colors.textTertiary }]}>Request sent</Text>
          ) : pendingRequest?.direction === "received" ? (
            <Pressable
              onPress={() => {
                void loadFriendRequests();
                setActiveListTab("requests");
              }}
              accessibilityRole="button"
              accessibilityLabel={`Review ${contact.name}'s friend request`}
              style={[styles.contactAddButton, { backgroundColor: colors.primaryLight }]}
            >
              <Text style={[styles.contactAddText, { color: colors.primary }]}>Review</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => void handleAddContactMatch(match)}
              disabled={isWorking}
              accessibilityRole="button"
              accessibilityLabel={`Send friend request to ${contact.name}`}
              style={[styles.contactAddButton, { backgroundColor: colors.primaryLight, opacity: isWorking ? 0.6 : 1 }]}
            >
              {isWorking
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Feather name="user-plus" size={14} color={colors.primary} />}
              <Text style={[styles.contactAddText, { color: colors.primary }]}>Add friend</Text>
            </Pressable>
          )}
        </View>
      );
    });
  }

  // ── main render ────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {(
        <View pointerEvents="none" style={styles.backgroundLayer}>
          <Animated.View
            style={[styles.backgroundOrbPrimary, { backgroundColor: colors.primary }, orbPrimaryStyle]}
          />
          <Animated.View
            style={[styles.backgroundOrbSecondary, { backgroundColor: colors.primaryDark }, orbSecondaryStyle]}
          />
        </View>
      )}

      <TideBackdrop />
      <WebPullToRefresh onRefresh={handleRefresh} refreshing={refreshing} />
      <TabHeader titleColor="#FFFFFF" title="Friends" topInset={topPad} titleFontSize={28}>
        <View style={styles.searchRow}>
          <TabSearchBar
            value={friendQuery}
            onChangeText={setFriendQuery}
            placeholder={searchPlaceholder}
            onClear={() => { setFriendQuery(""); Keyboard.dismiss(); }}
            accessibilityLabel="Friends search"
            style={styles.searchFlex}
          />
          <Pressable
            onPress={openQrSheet}
            accessibilityRole="button"
            accessibilityLabel="Add a friend with a QR code"
            style={({ pressed }) => [styles.qrHeaderButton, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialCommunityIcons name="qrcode-scan" size={21} color={tabTextColor} />
          </Pressable>
        </View>
      </TabHeader>

      <View style={styles.listArea}>
      <ScrollView
        ref={scrollRef}
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: 6, paddingBottom: Platform.OS === "web" ? 134 : 100 },
          showAlphabetIndex && styles.listContentWithIndex,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={refreshIndicatorColor}
            colors={[refreshIndicatorColor]}
            progressBackgroundColor={colors.surface}
          />
        }
      >
        <ScrollView
          horizontal
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          style={[
            styles.listTabs,
            {
              width: windowWidth - 32,
              flexShrink: 0,
              marginRight: showAlphabetIndex ? -24 : 0,
            },
          ]}
          contentContainerStyle={{
            flexDirection: "row",
            flexWrap: "nowrap",
            width: windowWidth - 32,
            height: 48,
            gap: 6,
          }}
          onLayout={(event) => setTabsHeight(event.nativeEvent.layout.height + 6)}
        >
          {([
            { key: "friends", label: "Friends", count: activeFriends.length, highlight: false },
            { key: "requests", label: "Requests", count: incomingFriendRequests.length, highlight: incomingFriendRequests.length > 0 },
            { key: "contacts", label: "Contacts", count: matchedContacts.length, highlight: false },
          ] as const).map((tab) => {
            const selected = activeListTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                testID={`${tab.key}-list-tab`}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (tab.key === "requests") void loadFriendRequests();
                  setActiveListTab(tab.key);
                }}
                style={[
                  styles.listTab,
                  {
                    backgroundColor: selected ? colors.primaryLight : colors.surface,
                    borderColor: selected ? colors.primary : colors.border,
                    width: Math.floor((windowWidth - 32 - 12) / 3),
                    flexGrow: 0,
                    flexShrink: 0,
                    flexDirection: "row",
                  },
                ]}
              >
                <Text numberOfLines={1} style={[styles.listTabText, { color: tabTextColor }]}>{tab.label}</Text>
                {tab.count > 0 && (
                  <View style={[styles.listTabCountBadge, { backgroundColor: tab.highlight ? colors.primary : colors.cardBg }]}>
                    <Text style={[styles.listTabCount, { color: tab.highlight ? "#fff" : tabTextColor }]}>{tab.count}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        {activeListTab === "friends" && (
          <>
            {visibleActiveFriends.length > 0 && (
              <View style={styles.section} onLayout={recordLayoutY("friends")}>
                <View style={[styles.listCard, { shadowColor: colors.shadow }]} onLayout={recordLayoutY("friends:card")}>
                  {renderLetterGroups("friends", friendGroups, renderActiveFriend)}
                </View>
              </View>
            )}
            {visibleActiveFriends.length === 0 && (
              <EmptyState
                icon={search ? "search" : "users"}
                title={search ? "No friends found" : "No friends yet"}
                subtitle={search ? `Nothing matched "${friendQuery.trim()}"` : "Scan a QR code, check your contacts, or invite someone by email"}
              />
            )}

            {!search && visibleActiveFriends.length === 0 && __DEV__ && (
              <Pressable
                style={({ pressed }) => [
                  styles.demoFriendsCard,
                  { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed || loadingDemoFriends ? 0.75 : 1 },
                ]}
                onPress={handleLoadDemoFriends}
                disabled={loadingDemoFriends}
              >
                <View style={[styles.demoFriendsIcon, { backgroundColor: colors.primaryLight }]}>
                  {loadingDemoFriends
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <Feather name="users" size={18} color={colors.primary} />}
                </View>
                <View style={styles.demoFriendsCopy}>
                  <Text style={[styles.demoFriendsTitle, { color: colors.text }]}>
                    {loadingDemoFriends ? "Loading sample friends…" : "Load sample friends"}
                  </Text>
                  <Text style={[styles.demoFriendsSubtitle, { color: colors.textSecondary }]}>
                    Add accepted demo friends for testing group invites.
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.textTertiary} />
              </Pressable>
            )}
          </>
        )}

        {activeListTab === "requests" && (
          <>
            {!!friendRequestsError && (
              <Text style={[styles.contactMatchMessage, { color: colors.danger }]}>{friendRequestsError}</Text>
            )}
            {visibleIncomingRequests.length > 0 && (
              <View style={styles.section} onLayout={recordLayoutY("requests-incoming")}>
                <View style={styles.reqHeader}><View style={[styles.reqRule, { backgroundColor: colors.border }]} /><View style={[styles.reqPill, { backgroundColor: colors.cardBg, borderColor: colors.border }]}><Text style={[styles.reqPillText, { color: colors.text }]}>Friend requests · {visibleIncomingRequests.length}</Text></View><View style={[styles.reqRule, { backgroundColor: colors.border }]} /></View>
                <View style={[styles.listCard, { shadowColor: colors.shadow }]} onLayout={recordLayoutY("requests-incoming:card")}>
                  {incomingRequestGroups.flatMap(g => g.items).map(renderIncomingFriendRequest)}
                </View>
              </View>
            )}
            {(visibleSentRequests.length > 0 || visiblePendingFriends.length > 0) && (
              <View style={styles.section} onLayout={recordLayoutY("requests-sent")}>
                <View style={styles.reqHeader}><View style={[styles.reqRule, { backgroundColor: colors.border }]} /><View style={[styles.reqPill, { backgroundColor: colors.cardBg, borderColor: colors.border }]}><Text style={[styles.reqPillText, { color: colors.text }]}>Sent · {sentItems.length}</Text></View><View style={[styles.reqRule, { backgroundColor: colors.border }]} /></View>
                <View style={[styles.listCard, { shadowColor: colors.shadow }]} onLayout={recordLayoutY("requests-sent:card")}>
                  {sentRequestGroups.flatMap(g => g.items).map(renderSentFriendItem)}
                </View>
              </View>
            )}
            {visibleIncomingRequests.length === 0 && visibleSentRequests.length === 0 && visiblePendingFriends.length === 0 && !friendRequestsError && (
              <EmptyState
                icon={search ? "search" : "inbox"}
                title={search ? "No matching requests" : "No requests"}
                subtitle={search ? `Nothing matched "${friendQuery.trim()}"` : "Requests you send or receive will appear here"}
              />
            )}
          </>
        )}

        {deferredListTab === "contacts" && (
          <>
            {contactDirectory.length === 0 ? (
              <View style={[styles.contactIntroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.contactDiscoveryIcon, { backgroundColor: colors.primaryLight }]}>
                  <Feather name="book" size={18} color={colors.primary} />
                </View>
                <Text style={[styles.contactDiscoveryTitle, { color: colors.text }]}>Find friends in your contacts</Text>
                <Text style={[styles.contactDiscoverySubtitle, { color: colors.textSecondary }]}>
                  Your contacts stay on this device. Only email addresses are checked once to find people already on Split Mate.
                </Text>
                {!!contactMatchMessage && (
                  <Text style={[styles.contactDiscoverySubtitle, { color: colors.textSecondary }]}>{contactMatchMessage}</Text>
                )}
                <Pressable
                  onPress={() => void handleFindFriendsFromContacts()}
                  disabled={findingContacts}
                  accessibilityRole="button"
                  accessibilityLabel="Show contacts and find friends on Split Mate"
                  style={[styles.qrPrimaryButton, { backgroundColor: colors.primary, opacity: findingContacts ? 0.7 : 1 }]}
                >
                  {findingContacts
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Feather name="users" size={16} color="#fff" />}
                  <Text style={styles.qrPrimaryButtonText}>{findingContacts ? "Checking contacts…" : "Show my contacts"}</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.contactStatusRow}>
                  <Text style={[styles.contactStatusText, { color: colors.textSecondary }]} numberOfLines={2}>
                    {contactMatchMessage || `${contactDirectory.length} contacts on this device`}
                  </Text>
                  <Pressable
                    onPress={() => void handleFindFriendsFromContacts()}
                    disabled={findingContacts}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Refresh contacts"
                  >
                    {findingContacts
                      ? <ActivityIndicator size="small" color={colors.primary} />
                      : <Feather name="refresh-cw" size={16} color={colors.primary} />}
                  </Pressable>
                </View>
                <View style={{ flexDirection: "row", gap: 10, marginHorizontal: 16, marginTop: 4, marginBottom: 8 }}>
                  {RNPlatform.OS === "ios" && (
                    <Pressable
                      onPress={async () => {
                        try { await (Contacts as unknown as { presentAccessPickerAsync?: () => Promise<unknown> }).presentAccessPickerAsync?.(); } catch { /* full access: nothing to pick */ }
                        void handleFindFriendsFromContacts();
                      }}
                      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}
                      accessibilityRole="button" accessibilityLabel="Choose more contacts"
                    >
                      <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>Choose more contacts</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => { setContactDirectory([]); setContactMatchMessage(""); }}
                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}
                    accessibilityRole="button" accessibilityLabel="Back"
                  >
                    <Text style={{ color: colors.textSecondary, fontWeight: "600", fontSize: 13 }}>Back</Text>
                  </Pressable>
                </View>
                {visibleMatchedContacts.length > 0 && (
                  <View style={styles.section} onLayout={recordLayoutY("contacts-matched")}>
                    <Text style={[styles.contactMatchesHeading, { color: colors.textSecondary }]}>
                      On Split Mate · {visibleMatchedContacts.length}
                    </Text>
                    <View style={[styles.listCard, { shadowColor: colors.shadow }]} onLayout={recordLayoutY("contacts-matched:card")}>
                      {renderLetterGroups("contacts-matched", matchedContactGroups, renderDeviceContact)}
                    </View>
                  </View>
                )}
                {visibleOtherContacts.length > 0 && (
                  <View style={styles.section} onLayout={recordLayoutY("contacts-other")}>
                    <Text style={[styles.contactMatchesHeading, { color: colors.textSecondary }]}>
                      Invite to Split Mate · {visibleOtherContacts.length}
                    </Text>
                    <View style={[styles.listCard, { shadowColor: colors.shadow }]} onLayout={recordLayoutY("contacts-other:card")}>
                      {renderLetterGroups("contacts-other", otherContactGroups, renderDeviceContact)}
                {visibleOtherContacts.length > contactLimit && (
                  <Pressable onPress={() => setContactLimit(l => l + 200)} style={{ paddingVertical: 14, alignItems: "center" }}>
                    <Text style={{ color: colors.primary, fontWeight: "600" }}>Show more contacts</Text>
                  </Pressable>
                )}
              </View>
                  </View>
                )}
                {visibleMatchedContacts.length === 0 && visibleOtherContacts.length === 0 && (
                  <EmptyState icon="search" title="No matching contacts" subtitle={`Nothing matched "${friendQuery.trim()}"`} />
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
      {showAlphabetIndex && (
        <AlphabetIndex
          available={availableLetters}
          onSelect={jumpToLetter}
          textColor={tabTextColor}
          mutedColor={colors.textTertiary}
          highlightColor={colors.primary}
          style={[styles.alphabetRail, { top: tabsHeight + 4, bottom: Platform.OS === "web" ? 134 : 100 }]}
        />
      )}
      </View>

      <Modal visible={showQrSheet} animationType="slide" onRequestClose={closeQrSheet}>
        <View style={[styles.qrScannerPage, { backgroundColor: colors.background, paddingTop: topPad + 8 }]}>
          <View style={styles.qrModalHeader}>
            <Text style={[styles.qrModalTitle, { color: colors.text }]}>Add with QR</Text>
            <Pressable onPress={closeQrSheet} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close QR">
              <Feather name="x" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={[styles.qrSegment, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {([
              { key: "show", label: "My code", icon: "qrcode" },
              { key: "scan", label: "Scan", icon: "qrcode-scan" },
            ] as const).map((option) => {
              const selected = qrMode === option.key;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => { void switchQrMode(option.key); }}
                  style={[styles.qrSegmentOption, selected && { backgroundColor: colors.primary }]}
                >
                  <MaterialCommunityIcons name={option.icon} size={17} color={selected ? "#fff" : colors.textSecondary} />
                  <Text style={[styles.qrSegmentText, { color: selected ? "#fff" : colors.text }]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {qrMode === "show" ? (
            <View style={styles.qrContent}>
              {qrLoading && !myFriendQr ? (
                <ActivityIndicator color={colors.primary} />
              ) : myFriendQr ? (
                <>
                  <View style={styles.qrCodeFrame}>
                    <QRCode value={buildFriendInviteUrl(myFriendQr.token)} size={230} backgroundColor="#FFFFFF" color="#000000" />
                  </View>
                  <Text style={[styles.qrProfileName, { color: colors.text }]}>{currentUser.name}</Text>
                  <Text style={[styles.qrModalHint, { color: colors.textSecondary }]}>
                    Friends can scan this with Split Mate or their phone camera. If they don’t have the app yet, they’ll be shown how to get it first.
                  </Text>
                  <Text style={[styles.qrModalExpiry, { color: colors.textTertiary }]}>
                    Valid until {new Date(myFriendQr.expiresAt).toLocaleString()}
                  </Text>
                  <Pressable
                    onPress={() => { void RNShare.share({ message: `Add me on Split Mate: ${buildFriendInviteUrl(myFriendQr.token)}` }); }}
                    style={({ pressed }) => ({ marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.teal, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 22, opacity: pressed ? 0.85 : 1 })}
                    accessibilityRole="button"
                  >
                    <Feather name="share-2" size={16} color="#fff" />
                    <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>Share my link</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={[styles.qrModalHint, { color: colors.danger }]}>{qrError || "Couldn't create your QR code."}</Text>
                  <Pressable onPress={() => void loadMyFriendQr()} style={[styles.qrPrimaryButton, { backgroundColor: colors.primary }]}>
                    <Text style={styles.qrPrimaryButtonText}>Try again</Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : scannedQrProfile ? (
            <View style={styles.qrContent}>
              <Avatar name={scannedQrProfile.name} color={scannedQrProfile.avatarColor} size={72} imageUri={scannedQrProfile.photo ?? undefined} />
              <Text style={[styles.qrProfileName, { color: colors.text }]}>{scannedQrProfile.name}</Text>
              <Text style={[styles.qrModalHint, { color: colors.textSecondary }]}>
                Send a friend request? They’ll join your friends list after they accept.
              </Text>
              {!!qrError && <Text style={[styles.qrModalHint, { color: colors.danger }]}>{qrError}</Text>}
              <Pressable
                onPress={() => void sendFriendRequestFromQr()}
                disabled={qrLoading}
                style={[styles.qrPrimaryButton, { backgroundColor: colors.primary, opacity: qrLoading ? 0.65 : 1 }]}
              >
                {qrLoading ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="user-plus" size={16} color="#fff" />}
                <Text style={styles.qrPrimaryButtonText}>{qrLoading ? "Sending…" : "Send request"}</Text>
              </Pressable>
              <Pressable onPress={resetQrScan} hitSlop={8} accessibilityRole="button">
                <Text style={[styles.qrSecondaryText, { color: colors.primary }]}>Scan a different code</Text>
              </Pressable>
            </View>
          ) : Platform.OS === "web" ? (
            <View style={styles.qrContent}>
              <Feather name="smartphone" size={28} color={colors.textTertiary} />
              <Text style={[styles.qrModalHint, { color: colors.textSecondary }]}>Scanning is available in the iOS and Android apps.</Text>
            </View>
          ) : !cameraPermission?.granted ? (
            <View style={styles.qrContent}>
              <Feather name="camera-off" size={28} color={colors.textTertiary} />
              <Text style={[styles.qrModalHint, { color: colors.textSecondary }]}>
                Allow camera access to scan a friend’s Split Mate QR code.
              </Text>
              <Pressable
                onPress={() => {
                  if (cameraPermission && !cameraPermission.canAskAgain) {
                    void Linking.openSettings().catch(() => {});
                  } else {
                    void requestCameraPermission();
                  }
                }}
                style={[styles.qrPrimaryButton, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.qrPrimaryButtonText}>
                  {cameraPermission && !cameraPermission.canAskAgain ? "Open Settings" : "Allow camera"}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.qrScanArea}>
              <View style={styles.qrCamera}>
                <CameraView
                  style={styles.qrCameraFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={qrLoading ? undefined : ({ data }) => { void handleFriendQrScanned(data); }}
                />
                {qrLoading && (
                  <View style={styles.qrScanBusy}>
                    <ActivityIndicator color="#fff" />
                  </View>
                )}
              </View>
              <Text style={[styles.qrModalHint, { color: qrError ? colors.danger : colors.textSecondary }]}>
                {qrError || "Point your camera at a friend’s Split Mate QR code."}
              </Text>
            </View>
          )}
        </View>
      </Modal>

      {/* ── FAB ────────────────────────────────────────────────────────────── */}
      <Pressable
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowInviteModal(true); }}
        style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 90, shadowColor: colors.primary }]}
       accessibilityRole="button" accessibilityLabel="Add friend">
        <Feather name="user-plus" color="#fff" size={22} />
      </Pressable>

      {/* ── Invite popup ───────────────────────────────────────────────────── */}
      <Modal visible={showInviteModal} transparent animationType="fade" onRequestClose={() => { setShowInviteModal(false); setEmail(""); setName(""); setEmailError(""); setNameError(""); }}>
        <KAV behavior={RNPlatform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable
          style={styles.inviteOverlay}
          onPress={() => { Keyboard.dismiss(); setShowInviteModal(false); setEmail(""); setName(""); setEmailError(""); setNameError(""); }}
        >
          <Pressable
            style={[
              styles.inviteCard,
              {
                backgroundColor: isDark ? "#232731" : "#FFFFFF",
                shadowColor: isDark ? "#000" : colors.shadow,
              },
            ]}
            onPress={e => e.stopPropagation()}
          >
            <Text style={[styles.inviteTitle, { color: isDark ? "#F2F4F7" : "#17191F" }]}>Invite a friend</Text>
            <Text style={[styles.inviteSub, { color: isDark ? "#B8C0CC" : "#667085" }]}>
              They'll appear in your friends list right away.
            </Text>

            <View>
              <View
                style={[
                  styles.inputWrap,
                  {
                    backgroundColor: isDark ? "#101216" : "#F8F9FA",
                    borderColor: emailError ? colors.danger : isDark ? "#454D5A" : "#E4E7EC",
                  },
                ]}
              >
                <Feather name="mail" size={16} color={emailError ? colors.danger : isDark ? "#7C8494" : "#98A2B3"} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: isDark ? "#F2F4F7" : "#17191F" }]}
                  placeholder="Email address *"
                  placeholderTextColor={isDark ? "#7C8494" : "#98A2B3"}
                  value={email}
                  onChangeText={t => { setEmail(t); setEmailError(""); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
              </View>
              {emailError ? <Text style={[styles.errorText, { color: colors.danger }]}>{emailError}</Text> : null}
            </View>

            <View>
              <View style={[styles.inputWrap, {
                backgroundColor: isDark ? "#101216" : "#F8F9FA",
                borderColor: nameError ? colors.danger : isDark ? "#454D5A" : "#E4E7EC",
              }]}>
                <Feather name="user" size={16} color={nameError ? colors.danger : isDark ? "#7C8494" : "#98A2B3"} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: isDark ? "#F2F4F7" : "#17191F" }]}
                  placeholder="Name *"
                  placeholderTextColor={isDark ? "#7C8494" : "#98A2B3"}
                  value={name}
                  onChangeText={value => { setName(value); setNameError(""); }}
                  autoCapitalize="words"
                  returnKeyType="send"
                  onSubmitEditing={handleAddFriend}
                />
              </View>
              {nameError ? <Text style={[styles.errorText, { color: colors.danger }]}>{nameError}</Text> : null}
            </View>

            <View style={styles.formButtons}>
              <Pressable
                style={[styles.formBtn, styles.formBtnSecondary, { borderColor: isDark ? "#454D5A" : "#E4E7EC" }]}
                onPress={() => { setShowInviteModal(false); setEmail(""); setName(""); setEmailError(""); setNameError(""); }}
              >
                <Text style={[styles.formBtnText, { color: isDark ? "#B8C0CC" : "#667085" }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.formBtn, { backgroundColor: colors.primary, opacity: sendingInvite ? 0.7 : 1 }]}
                onPress={handleAddFriend}
                disabled={sendingInvite}
              >
                <Feather name="user-plus" size={15} color="#fff" />
                <Text style={[styles.formBtnText, { color: "#fff" }]}>
                  {sendingInvite ? "Sending…" : "Send Invite"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KAV>
      </Modal>

      {/* ── Contact edit sheet ─────────────────────────────────────────────── */}
      <Modal
        visible={editingMember !== null}
        transparent
        animationType="slide"
        onRequestClose={closeEditSheet}
      >
        <Pressable style={styles.sheetOverlay} onPress={closeEditSheet}>
          <Pressable
            style={[styles.editSheet, { backgroundColor: colors.surface }]}
            onPress={e => e.stopPropagation()}
          >
            {/* Handle */}
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Edit Contact</Text>
              <Pressable onPress={closeEditSheet} accessibilityRole="button" accessibilityLabel="Close">
                <Feather name="x" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetBody}
              keyboardShouldPersistTaps="handled"
            >
              {/* Avatar picker */}
              <View style={styles.avatarPickerRow}>
                <Pressable style={styles.avatarPickerBtn} onPress={handlePickPhoto} disabled={photoLoading}>
                  {photoLoading ? (
                    <View style={[styles.avatarPickerCircle, { backgroundColor: colors.border }]}>
                      <ActivityIndicator color={colors.primary} />
                    </View>
                  ) : (
                    <View style={styles.avatarPickerCircle}>
                      <Avatar
                        name={editName || editingMember?.name || "?"}
                        color={editingMember?.avatarColor ?? "#ccc"}
                        size={72}
                        imageUri={editPhoto}
                      />
                      <View style={[styles.cameraOverlay, { backgroundColor: colors.primary }]}>
                        <Feather name="camera" size={13} color="#fff" />
                      </View>
                    </View>
                  )}
                </Pressable>
                <View style={styles.avatarPickerLabels}>
                  <Text style={[styles.avatarPickerTitle, { color: colors.text }]}>Profile photo</Text>
                  <Text style={[styles.avatarPickerSub, { color: colors.textSecondary }]}>
                    Tap avatar to pick from library
                  </Text>
                  {editPhoto ? (
                    <Pressable onPress={handleRemovePhoto}>
                      <Text style={[styles.removePhotoText, { color: colors.danger }]}>Remove photo</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {/* Name */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Name *</Text>
                <View style={[styles.fieldInput, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Feather name="user" size={16} color={colors.textTertiary} />
                  <TextInput
                    style={[styles.fieldText, { color: colors.text }]}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Full name"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="words"
                  />
                </View>
              </View>

              {/* Email */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Email *</Text>
                <View style={[styles.fieldInput, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Feather name="mail" size={16} color={colors.textTertiary} />
                  <TextInput
                    style={[styles.fieldText, { color: colors.text }]}
                    value={editEmail}
                    onChangeText={setEditEmail}
                    placeholder="Email address"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              {/* Phone */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Phone</Text>
                <View style={[styles.fieldInput, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Feather name="phone" size={16} color={colors.textTertiary} />
                  <TextInput
                    style={[styles.fieldText, { color: colors.text }]}
                    value={editPhone}
                    onChangeText={setEditPhone}
                    placeholder="+1 234 567 8900"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

            </ScrollView>

            {/* Remove invite (pending only) */}
            {editingMember?.isPending ? (
              <Pressable
                style={[styles.removeInviteBtn, { borderColor: colors.danger }]}
                onPress={handleRemoveInvite}
              >
                <Feather name="user-x" size={15} color={colors.danger} />
                <Text style={[styles.removeInviteBtnText, { color: colors.danger }]}>Remove invite</Text>
              </Pressable>
            ) : null}

            {/* Remove friend (active only) */}
            {editingMember && !editingMember.isPending ? (() => {
              const blocked = groups.some(
                g =>
                  g.memberIds.includes(editingMember.id) &&
                  getGroupBalances(g.id).some(
                    d => d.fromId === editingMember.id || d.toId === editingMember.id
                  )
              );
              const btnColor = blocked ? colors.textTertiary : colors.danger;
              return (
                <Pressable
                  style={[styles.removeInviteBtn, { borderColor: btnColor }]}
                  onPress={handleRemoveFriend}
                >
                  <Feather name={blocked ? "alert-circle" : "user-x"} size={15} color={btnColor} />
                  <Text style={[styles.removeInviteBtnText, { color: btnColor }]}>
                    {blocked ? "Settle up first" : "Remove friend"}
                  </Text>
                </Pressable>
              );
            })() : null}

            {/* Actions */}
            <View style={styles.sheetActions}>
              <Pressable
                style={[styles.sheetBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={closeEditSheet}
              >
                <Text style={[styles.sheetBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.sheetBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={handleSaveContact}
              >
                <Feather name="check" size={16} color="#fff" />
                <Text style={[styles.sheetBtnText, { color: "#fff" }]}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backgroundLayer: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
  backgroundOrbPrimary: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 180,
    top: -170,
    right: -135,
    opacity: 0.16,
  },
  backgroundOrbSecondary: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    top: 300,
    left: -175,
    opacity: 0.11,
  },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: { padding: 16, gap: 0 },
  listContentWithIndex: { paddingRight: 40 },
  listArea: { flex: 1 },
  alphabetRail: { position: "absolute", right: 4, justifyContent: "center" },
  reqHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, marginBottom: 8 },
  reqRule: { flex: 1, height: StyleSheet.hairlineWidth },
  reqPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  reqPillText: { fontSize: 10.5, fontFamily: "Inter_700Bold", letterSpacing: 0.5, textTransform: "uppercase" },
  letterHeading: { fontSize: 13, fontFamily: "Inter_700Bold", marginTop: 8, marginBottom: 2, marginLeft: 4 },
  addForm: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  addFormTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  addFormSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 4 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 8,
  },
  inputIcon: {},
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  errorText: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4, marginLeft: 4 },
  formButtons: { flexDirection: "row", gap: 10, marginTop: 4 },
  formBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  formBtnSecondary: { borderWidth: 1, backgroundColor: "transparent" },
  formBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  demoFriendsCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginTop: 8, padding: 14, borderRadius: 16, borderWidth: 1,
  },
  contactIntroCard: { alignItems: "center", gap: 10, padding: 20, borderRadius: 18, borderWidth: 1, marginBottom: 16 },
  contactDiscoveryIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  contactDiscoveryTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  contactDiscoverySubtitle: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular", textAlign: "center" },
  contactStatusRow: {
    marginTop: 28, flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 4, marginBottom: 12 },
  contactStatusText: { flex: 1, fontSize: 12, lineHeight: 16 },
  contactMatchMessage: { fontSize: 12, lineHeight: 16, marginHorizontal: 4, marginBottom: 12 },
  contactMatchesHeading: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchFlex: { flex: 1 },
  qrHeaderButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  qrSegment: { flexDirection: "row", padding: 4, borderRadius: 14, borderWidth: 1, gap: 4 },
  qrSegmentOption: { flex: 1, minHeight: 40, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  qrSegmentText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  qrContent: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingBottom: 40 },
  qrCodeFrame: { padding: 16, borderRadius: 20, backgroundColor: "#FFFFFF" },
  qrScanArea: { flex: 1, gap: 14 },
  qrScanBusy: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 20 },
  qrSecondaryText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  qrModalHeader: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  qrModalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  qrModalHint: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  qrModalExpiry: { fontSize: 11, textAlign: "center" },
  qrScannerPage: { flex: 1, paddingHorizontal: 20, paddingBottom: 24, gap: 14 },
  qrCamera: { flex: 1, borderRadius: 20, overflow: "hidden", backgroundColor: "#000" },
  qrCameraFill: { flex: 1 },
  qrProfileRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  qrProfileName: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  qrPrimaryButton: { width: "100%", minHeight: 46, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  qrPrimaryButtonText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  contactAddButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 12 },
  contactAddText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  demoFriendsIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  demoFriendsCopy: { flex: 1, gap: 3 },
  demoFriendsTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  demoFriendsSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  section: { marginBottom: 24 },
  listTabs: {
    width: "100%",
    height: 48,
    marginBottom: 16,
  },
  listTab: {
    minWidth: 0,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 6,
    borderRadius: 11,
    borderWidth: 1,
  },
  listTabText: { flexShrink: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  listTabCountBadge: { minWidth: 21, height: 21, paddingHorizontal: 4, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  listTabCount: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  requestDeclineButton: { width: 34, height: 34, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  // Individual floating friend rows
  listCard: {
    width: "100%",
  },
  friendRow: {
    flexDirection: "row", alignItems: "center",
    marginVertical: 3,
    paddingHorizontal: 16, paddingVertical: 13, gap: 12, position: "relative",
    borderRadius: 18, borderWidth: 1,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  avatarWrap: { position: "relative" },
  photoIndicator: {
    position: "absolute", bottom: 0, right: 0,
    width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: "#fff",
  },
  friendRowBody: { flex: 1, minWidth: 0, gap: 2 },
  friendRowNameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  friendRowName: { fontSize: 15, fontFamily: "Inter_500Medium" },
  friendRowMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  friendRowBalance: { fontSize: 14, fontFamily: "Inter_700Bold", fontVariant: ["tabular-nums"] },
  pendingBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  pendingBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  resendBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1,
  },
  resendText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // FAB
  fab: {
    position: "absolute", right: 20, width: 56, height: 56,
    borderRadius: 28, justifyContent: "center", alignItems: "center",
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },

  // Invite popup
  inviteOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center", alignItems: "center",
    paddingTop: 24, paddingHorizontal: 24, paddingBottom: 64,
  },
  inviteCard: {
    width: "100%", borderRadius: 20, padding: 22, gap: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 24, elevation: 10,
  },
  inviteTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  inviteSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: -6 },

  // Sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  editSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingTop: 12,
    maxHeight: "90%",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  sheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  sheetBody: { gap: 16, paddingBottom: 8 },
  avatarPickerRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatarPickerBtn: {},
  avatarPickerCircle: { position: "relative" },
  cameraOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  avatarPickerLabels: { flex: 1, gap: 4 },
  avatarPickerTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  avatarPickerSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  removePhotoText: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 4 },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6 },
  fieldInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  fieldText: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  joinedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  joinedText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  removeInviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  removeInviteBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  sheetActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  sheetBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    borderWidth: 1,
  },
  sheetBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
