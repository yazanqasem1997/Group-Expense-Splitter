import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Receipt as ReceiptSession, api, toUserMessage } from "@/services/apiSync";
import { CURRENCY_SYMBOLS, getExpensePaidAmounts, type Currency, type SplitDetail, useApp } from "@/context/AppContext";
import { CurrencyPickerModal } from "@/components/CurrencyPickerModal";
import { showAlert } from "@/hooks/alertStore";
import { useTheme } from "@/hooks/useTheme";
import { formatAmount } from "@/components/AmountText";
import { allocateProportionally, buildReceiptMemberTotals } from "@/utils/receiptArithmetic";

const roundMoney = (value: number) => Math.round(value * 100) / 100;
type ItemDraft = { name: string; amount: string; quantity: string; unitPrice: string };
type ItemUpdateSource = "name" | "amount" | "quantity" | "unitPrice";
type AdjustmentMode = "value" | "percentage";
type PayerSplitType = "equal" | "exact" | "percentage";
type PayerPaymentRow = { memberId: string; amount: number; percentage?: number };

const PAYER_SPLIT_TYPES: { value: PayerSplitType; label: string; description: string }[] = [
  { value: "equal", label: "Equal", description: "Split evenly" },
  { value: "exact", label: "Exact", description: "Set amounts" },
  { value: "percentage", label: "%", description: "By percentage" },
];

const numberOrNull = (value: string, allowNegative = false): number | null => {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && (allowNegative || parsed >= 0) ? roundMoney(parsed) : null;
};

const positiveAdjustment = (value: string): number =>
  Math.max(0, numberOrNull(value) ?? 0);

const adjustmentAmount = (
  value: string,
  mode: AdjustmentMode,
  subtotal: number,
): number => {
  const input = positiveAdjustment(value);
  return mode === "percentage"
    ? roundMoney(subtotal * Math.min(input, 100) / 100)
    : input;
};

const discountAmount = (
  value: string,
  mode: AdjustmentMode,
  subtotal: number,
): number | null => {
  const input = numberOrNull(value);
  if (input == null || input <= 0) return null;
  const amount = mode === "percentage"
    ? -roundMoney(subtotal * Math.min(input, 100) / 100)
    : -roundMoney(input);
  return amount === 0 ? null : amount;
};

const withClaimedMembers = (
  receipt: ReceiptSession,
  itemId: string,
  claimedByMemberKeys: string[],
): ReceiptSession => ({
  ...receipt,
  items: receipt.items.map((item) =>
    item.id === itemId
      ? { ...item, claimedByMemberKeys }
      : item,
  ),
});

export default function ReceiptReviewScreen() {
  const { id, groupId: routeGroupId } = useLocalSearchParams<{ id: string; groupId?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    members,
    expenses,
    getGroupById,
    getMemberKeyForGroup,
    addExpense,
  } = useApp();
  const [receipt, setReceipt] = useState<ReceiptSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [merchant, setMerchant] = useState("");
  const [totalText, setTotalText] = useState("");
  const [payerIds, setPayerIds] = useState<string[]>([currentUser.id]);
  const [payerSplitType, setPayerSplitType] = useState<PayerSplitType>("equal");
  const [payerExactAmounts, setPayerExactAmounts] = useState<Record<string, string>>({});
  const [payerPercentages, setPayerPercentages] = useState<Record<string, string>>({});
  const [itemDrafts, setItemDrafts] = useState<Record<string, ItemDraft>>({});
  const [discountMode, setDiscountMode] = useState<AdjustmentMode>("value");
  const [discountText, setDiscountText] = useState("");
  const [tipMode, setTipMode] = useState<AdjustmentMode>("value");
  const [tipText, setTipText] = useState("");
  const [taxMode, setTaxMode] = useState<AdjustmentMode>("value");
  const [taxText, setTaxText] = useState("");
  const adjustmentsInitializedRef = useRef(false);
  const payerInitializedRef = useRef(false);
  const claimVersionsRef = useRef<Record<string, number>>({});
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [currencyPickerVisible, setCurrencyPickerVisible] = useState(false);
  const [retaking, setRetaking] = useState(false);

  const groupId = receipt?.groupId ?? routeGroupId ?? "";
  const group = getGroupById(groupId);
  const receiptCurrency = (receipt?.currency ?? group?.currency ?? "USD") as Currency;
  const groupMembers = useMemo(() => {
    if (!group) return members;
    const memberIds = new Set(group.memberIds);
    return members.filter((member) => memberIds.has(member.id));
  }, [group?.memberIds, members]);
  const orderedGroupMembers = useMemo(() => {
    const currentMember = groupMembers.find((member) => member.isCurrentUser);
    return currentMember
      ? [currentMember, ...groupMembers.filter((member) => member.id !== currentMember.id)]
      : groupMembers;
  }, [groupMembers]);
  const receiptTotal = useMemo(
    () => numberOrNull(totalText) ?? receipt?.total ?? 0,
    [receipt?.total, totalText],
  );
  const selectedPayers = useMemo(
    () => orderedGroupMembers.filter((member) => payerIds.includes(member.id)),
    [orderedGroupMembers, payerIds],
  );
  const payerPaymentRows = useMemo<PayerPaymentRow[]>(() => {
    if (selectedPayers.length === 0) return [];
    if (payerSplitType === "equal") {
      const share = receiptTotal / selectedPayers.length;
      let allocated = 0;
      return selectedPayers.map((member, index) => {
        const amount = index === selectedPayers.length - 1
          ? roundMoney(receiptTotal - allocated)
          : roundMoney(share);
        allocated = roundMoney(allocated + amount);
        return { memberId: member.id, amount };
      });
    }
    if (payerSplitType === "exact") {
      return selectedPayers.map((member) => ({
        memberId: member.id,
        amount: numberOrNull(payerExactAmounts[member.id] ?? "") ?? 0,
      }));
    }
    let allocated = 0;
    return selectedPayers.map((member, index) => {
      const percentage = numberOrNull(payerPercentages[member.id] ?? "") ?? 0;
      const amount = index === selectedPayers.length - 1
        ? roundMoney(receiptTotal - allocated)
        : roundMoney(receiptTotal * percentage / 100);
      allocated = roundMoney(allocated + amount);
      return { memberId: member.id, amount, percentage };
    });
  }, [
    payerExactAmounts,
    payerPercentages,
    payerSplitType,
    receiptTotal,
    selectedPayers,
  ]);
  const payerPaymentTotal = useMemo(
    () => roundMoney(payerPaymentRows.reduce((sum, row) => sum + row.amount, 0)),
    [payerPaymentRows],
  );
  const payerPercentageTotal = useMemo(
    () => roundMoney(payerPaymentRows.reduce((sum, row) => sum + (row.percentage ?? 0), 0)),
    [payerPaymentRows],
  );
  const payerSplitValid = payerIds.length > 0 && (
    payerSplitType === "equal"
      ? true
      : payerSplitType === "exact"
        ? Math.abs(payerPaymentTotal - receiptTotal) <= 0.01
        : Math.abs(payerPercentageTotal - 100) <= 0.1
  );
  const payerRemaining = useMemo(() => {
    if (payerSplitType === "percentage") {
      return roundMoney(100 - payerPercentageTotal);
    }
    return roundMoney(receiptTotal - payerPaymentTotal);
  }, [payerPaymentTotal, payerPercentageTotal, payerSplitType, receiptTotal]);

  const applyReceipt = useCallback((next: ReceiptSession) => {
    setReceipt(next);
    setMerchant(next.merchant ?? "");
    setTotalText(next.total == null ? "" : String(next.total));
    if (!adjustmentsInitializedRef.current) {
      setTipText(next.tip == null ? "" : String(next.tip));
      {
        // VAT already inside the item prices: don't add it on top when splitting.
        const itemsSum = (next.items ?? []).reduce((s: number, it: { amount?: number | null }) => s + (it.amount ?? 0), 0);
        const tol = next.total != null ? Math.max(0.05, Math.abs(next.total) * 0.005) : 0;
        const vatInside = next.tax != null && next.tax > 0 && next.total != null
          && Math.abs(itemsSum - next.total) <= tol
          && Math.abs(itemsSum + next.tax - next.total) > tol;
        setTaxText(next.tax == null || vatInside ? "" : String(next.tax));
      }
      adjustmentsInitializedRef.current = true;
    }
    setItemDrafts(
      Object.fromEntries(
        next.items.map((item) => [
          item.id,
          {
            name: item.name,
            amount: item.amount == null ? "" : String(item.amount),
            quantity: item.quantity == null ? "" : String(item.quantity),
            unitPrice: item.unitPrice == null ? "" : String(item.unitPrice),
          },
        ]),
      ),
    );
  }, []);

  const lastTapRef = useRef(0);
  const [adjustField, setAdjustField] = useState<null | "discount" | "tip" | "tax">(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const loadReceipt = useCallback(async () => {
    if (!id) return;
    try {
      const next = await api.getReceipt(id);
      applyReceipt(next);
    } catch (error) {
      showAlert("Receipt unavailable", toUserMessage(error, "This receipt could not be loaded."), [
        { text: "Go back", onPress: () => router.back() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [applyReceipt, id]);

  useEffect(() => {
    void loadReceipt();
    const interval = setInterval(() => { if (Date.now() - lastTapRef.current > 5000) void loadReceipt(); }, 4000);
    return () => clearInterval(interval);
  }, [loadReceipt]);

  useEffect(() => {
    if (!receipt || payerInitializedRef.current) return;
    const linkedExpense = expenses.find((expense) => expense.receiptId === receipt.id);
    if (!linkedExpense) {
      payerInitializedRef.current = true;
      return;
    }
    const paidAmounts = getExpensePaidAmounts(linkedExpense);
    const savedPayerIds = Object.keys(paidAmounts).filter((memberId) =>
      groupMembers.some((member) => member.id === memberId),
    );
    if (savedPayerIds.length > 0) {
      setPayerIds(savedPayerIds);
      setPayerSplitType("exact");
      setPayerExactAmounts(
        Object.fromEntries(
          savedPayerIds.map((memberId) => [memberId, String(paidAmounts[memberId])]),
        ),
      );
    }
    payerInitializedRef.current = true;
  }, [expenses, groupMembers, receipt]);

  const memberForKey = useCallback(
    (memberKey: string) =>
      groupMembers.find((member) => getMemberKeyForGroup(member.id, groupId) === memberKey),
    [getMemberKeyForGroup, groupId, groupMembers],
  );

  const positiveItemSubtotal = useMemo(() => {
    if (!receipt) return 0;
    return receipt.items.reduce((sum, item) => {
      const amount = numberOrNull(itemDrafts[item.id]?.amount ?? (item.amount == null ? "" : String(item.amount)), true);
      return amount != null && amount > 0 ? roundMoney(sum + amount) : sum;
    }, 0);
  }, [itemDrafts, receipt]);

  const manualDiscountAmount = useMemo(() => {
    return discountAmount(discountText, discountMode, positiveItemSubtotal);
  }, [discountMode, discountText, positiveItemSubtotal]);

  const tipAmount = adjustmentAmount(tipText, tipMode, positiveItemSubtotal);
  const taxAmount = adjustmentAmount(taxText, taxMode, positiveItemSubtotal);

  const updateReceiptAdjustment = useCallback(
    async (field: "tax" | "tip", text: string, mode: AdjustmentMode) => {
      if (!receipt) return;
      const input = numberOrNull(text);
      if (text.trim() && input == null) {
        showAlert(`Review ${field === "tax" ? "VAT" : "tip"}`, "Enter a valid amount before leaving this field.", [
          { text: "OK" },
        ]);
        return;
      }
      const value = input == null ? null : adjustmentAmount(text, mode, positiveItemSubtotal);
      try {
        const next = await api.updateReceipt(
          receipt.id,
          field === "tax" ? { tax: value } : { tip: value },
        );
        setReceipt(next);
      } catch (error) {
        showAlert(`Couldn't save ${field === "tax" ? "VAT" : "tip"}`, toUserMessage(error));
      }
    },
    [positiveItemSubtotal, receipt],
  );

  const updateMerchant = useCallback(async () => {
    if (!receipt) return;
    const value = merchant.trim() || null;
    try {
      const next = await api.updateReceipt(receipt.id, { merchant: value });
      setReceipt(next);
    } catch (error) {
      showAlert("Couldn't save merchant", toUserMessage(error));
    }
  }, [merchant, receipt]);

  const updateReceiptCurrency = useCallback(
    async (currency: Currency) => {
      if (!receipt || currency === receipt.currency) return;
      try {
        const next = await api.updateReceipt(receipt.id, { currency });
        setReceipt(next);
      } catch (error) {
        showAlert("Couldn't save currency", toUserMessage(error));
      }
    },
    [receipt],
  );

  const updateItem = useCallback(
    async (itemId: string, source: ItemUpdateSource) => {
      if (!receipt) return;
      const draft = itemDrafts[itemId];
      if (!draft) return;
      const amount = numberOrNull(draft.amount, true);
      const quantity = numberOrNull(draft.quantity);
      const unitPrice = numberOrNull(draft.unitPrice, true);
      const calculatedAmount = source !== "amount" && quantity != null && unitPrice != null
        ? roundMoney(quantity * unitPrice)
        : amount;
      if (!draft.name.trim()) return;
      try {
        const next = await api.updateReceiptItem(receipt.id, itemId, {
          name: draft.name.trim(),
          amount: calculatedAmount,
          quantity,
          unitPrice,
        });
        const nextDraft = {
          ...draft,
          amount: calculatedAmount == null ? draft.amount : String(calculatedAmount),
        };
        setItemDrafts((previous) => ({ ...previous, [itemId]: nextDraft }));
        setReceipt(next);
      } catch (error) {
        showAlert("Couldn't save line item", toUserMessage(error));
      }
    },
    [itemDrafts, receipt],
  );

  const pickReplacement = useCallback(
    async (camera: boolean) => {
      if (!receipt || retaking) return;
      setRetaking(true);
      try {
        const permission = camera
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== "granted") {
          showAlert(
            camera ? "Camera access needed" : "Photo access needed",
            camera ? "Allow camera access to retake the receipt." : "Allow photo access to choose a receipt image.",
            [{ text: "OK" }],
          );
          return;
        }
        const result = camera
          ? await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.5 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.5 });
        const asset = result.canceled ? null : result.assets[0];
        if (!asset) return;
        const next = await api.createReceiptFromImage(
          groupId,
          asset.uri,
          asset.mimeType ?? "image/jpeg",
        );
        router.replace({ pathname: "/receipt/[id]", params: { id: next.id, groupId } });
      } catch (error) {
        showAlert("Receipt retake failed", toUserMessage(error, "We couldn't read that receipt."), [
          { text: "OK" },
        ]);
      } finally {
        setRetaking(false);
      }
    },
    [groupId, receipt, retaking],
  );

  const requestReplacement = useCallback(() => {
    showAlert("Replace receipt photo", "Choose how to capture the new receipt image.", [
      { text: "Take photo", onPress: () => void pickReplacement(true) },
      { text: "Choose from library", onPress: () => void pickReplacement(false) },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [pickReplacement]);

  const toggleClaim = useCallback(
    async (itemId: string, memberKey?: string) => {
      if (!receipt) return;
      const effectiveMemberKey = memberKey ?? getMemberKeyForGroup(currentUser.id, groupId);
      const item = receipt.items.find((candidate) => candidate.id === itemId);
      if (!item || !effectiveMemberKey) return;
      const previousClaimedByMemberKeys = item.claimedByMemberKeys;
      const nextClaimedByMemberKeys = previousClaimedByMemberKeys.includes(effectiveMemberKey)
        ? previousClaimedByMemberKeys.filter((key) => key !== effectiveMemberKey)
        : [...previousClaimedByMemberKeys, effectiveMemberKey];
      const version = (claimVersionsRef.current[itemId] ?? 0) + 1;
      claimVersionsRef.current[itemId] = version;
      lastTapRef.current = Date.now();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setReceipt((current) =>
        current
          ? withClaimedMembers(current, itemId, nextClaimedByMemberKeys)
          : current,
      );
      try {
        const next = await api.toggleReceiptClaim(receipt.id, itemId, effectiveMemberKey);
        if (claimVersionsRef.current[itemId] === version) {
          const serverItem = next.items.find((candidate) => candidate.id === itemId);
          if (serverItem) {
            setReceipt((current) =>
              current
                ? withClaimedMembers(current, itemId, serverItem.claimedByMemberKeys)
                : next,
            );
          }
        }
      } catch (error) {
        if (claimVersionsRef.current[itemId] === version) {
          setReceipt((current) =>
            current
              ? withClaimedMembers(current, itemId, previousClaimedByMemberKeys)
              : current,
          );
        }
        showAlert("Couldn't update claim", toUserMessage(error));
      }
    },
    [currentUser.id, getMemberKeyForGroup, groupId, receipt],
  );

  const toggleAllClaims = useCallback(
    async (itemId: string) => {
      if (!receipt || groupMembers.length === 0) return;
      const item = receipt.items.find((candidate) => candidate.id === itemId);
      if (!item) return;

       const memberKeys = orderedGroupMembers.map((member) => getMemberKeyForGroup(member.id, groupId));
      const allSelected = memberKeys.every((memberKey) =>
        item.claimedByMemberKeys.includes(memberKey),
      );
      const targetKeys = allSelected
        ? memberKeys
        : memberKeys.filter((memberKey) => !item.claimedByMemberKeys.includes(memberKey));
      const previousClaimedByMemberKeys = item.claimedByMemberKeys;
      const nextClaimedByMemberKeys = allSelected ? [] : memberKeys;
      const version = (claimVersionsRef.current[itemId] ?? 0) + 1;
      claimVersionsRef.current[itemId] = version;

      lastTapRef.current = Date.now();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setReceipt((current) =>
        current
          ? withClaimedMembers(current, itemId, nextClaimedByMemberKeys)
          : current,
      );
      try {
        const next = await targetKeys.reduce(
          async (currentReceipt, memberKey) => {
            const current = await currentReceipt;
            return api.toggleReceiptClaim(current.id, itemId, memberKey);
          },
          Promise.resolve(receipt),
        );
        if (claimVersionsRef.current[itemId] === version) {
          const serverItem = next.items.find((candidate) => candidate.id === itemId);
          if (serverItem) {
            setReceipt((current) =>
              current
                ? withClaimedMembers(current, itemId, serverItem.claimedByMemberKeys)
                : next,
            );
          }
        }
      } catch (error) {
        if (claimVersionsRef.current[itemId] === version) {
          setReceipt((current) =>
            current
              ? withClaimedMembers(current, itemId, previousClaimedByMemberKeys)
              : current,
          );
        }
        showAlert("Couldn't update claims", toUserMessage(error));
      }
    },
    [getMemberKeyForGroup, groupId, orderedGroupMembers, receipt],
  );

  const totalsPreview = useMemo(() => {
    if (!receipt) return [];
    const totals: Record<string, number> = {};
    receipt.items.forEach((item) => {
       const amount = numberOrNull(itemDrafts[item.id]?.amount ?? (item.amount == null ? "" : String(item.amount)), true);
      const claimCount = item.claimedByMemberKeys.length;
      if (claimCount === 0 || amount == null) return;
      const each = amount / claimCount;
      item.claimedByMemberKeys.forEach((memberKey) => {
        totals[memberKey] = roundMoney((totals[memberKey] ?? 0) + each);
      });
    });
    allocateProportionally(totals, manualDiscountAmount ?? 0);
    allocateProportionally(totals, taxAmount);
    allocateProportionally(totals, tipAmount);
    return Object.entries(totals)
      .map(([memberKey, amount]) => ({ memberKey, amount, member: memberForKey(memberKey) }))
      .sort((a, b) => b.amount - a.amount);
  }, [itemDrafts, manualDiscountAmount, memberForKey, receipt, taxAmount, tipAmount]);

  const reviewStatus = useMemo(() => {
    if (!receipt) return { label: "Insufficient information", color: colors.warning, difference: null as number | null };
    const amounts = receipt.items.map((item) =>
       numberOrNull(itemDrafts[item.id]?.amount ?? (item.amount == null ? "" : String(item.amount)), true),
    );
    if (amounts.some((amount) => amount == null) || amounts.length === 0) {
      return { label: "Insufficient information", color: colors.warning, difference: null };
    }
    const knownAmounts = amounts.filter((amount): amount is number => amount != null);
    const itemTotal = roundMoney(
      knownAmounts.reduce((sum, amount) => sum + amount, 0)
      + (manualDiscountAmount ?? 0)
      + taxAmount
      + tipAmount,
    );
    const total = numberOrNull(totalText) ?? receipt.total;
    if (total == null) return { label: "Insufficient information", color: colors.warning, difference: null };
    const difference = roundMoney(total - itemTotal);
    return Math.abs(difference) <= 0.01
      ? { label: "Balanced", color: colors.success, difference }
      : { label: "Mismatch — review amounts", color: colors.danger, difference };
  }, [colors.danger, colors.success, colors.warning, itemDrafts, manualDiscountAmount, receipt, taxAmount, tipAmount, totalText]);

  const saveExpense = useCallback(() => {
    if (!receipt || !group) return;
    if (payerIds.length === 0) {
      showAlert("Choose who paid", "Select at least one person who paid this receipt.", [{ text: "OK" }]);
      return;
    }
    if (!payerSplitValid) {
      showAlert(
        "Payment split doesn't balance",
        payerSplitType === "exact"
          ? "The payment amounts must add up to the receipt total."
          : "The payment percentages must add up to 100%.",
        [{ text: "OK" }],
      );
      return;
    }
    const missingClaims = receipt.items.some((item) => item.claimedByMemberKeys.length === 0);
    if (missingClaims) {
      showAlert("Claim every item first", "Each line item needs at least one person before the expense can be saved.", [
        { text: "OK" },
      ]);
      return;
    }
     if (discountText.trim() && numberOrNull(discountText) == null) {
       showAlert("Review discount", "Enter a valid discount value or percentage before saving.", [{ text: "OK" }]);
       return;
     }
      if (taxText.trim() && numberOrNull(taxText) == null) {
        showAlert("Review VAT", "Enter a valid VAT amount before saving.", [{ text: "OK" }]);
        return;
      }
      if (tipText.trim() && numberOrNull(tipText) == null) {
        showAlert("Review tip", "Enter a valid tip amount before saving.", [{ text: "OK" }]);
        return;
      }
     const unresolved = receipt.items.filter((item) => numberOrNull(itemDrafts[item.id]?.amount ?? "", true) == null);
    if (unresolved.length > 0) {
      showAlert(
        "Review missing prices",
        `${unresolved.length} line ${unresolved.length === 1 ? "item has" : "items have"} no readable amount. Enter each amount before saving the expense.`,
        [{ text: "OK" }],
      );
      return;
    }
     const itemAmounts = receipt.items.map((item) => {
       const amount = numberOrNull(itemDrafts[item.id]?.amount ?? "", true) ?? 0;
       return { item, amount };
     });
     const discountTotal = manualDiscountAmount ?? 0;
      const taxTotal = taxAmount;
      const tipTotal = tipAmount;
      const editedTotal = Number(totalText.replace(",", "."));
      const total = Number.isFinite(editedTotal) && editedTotal > 0
        ? roundMoney(editedTotal)
        : roundMoney(
          receipt.total
          ?? itemAmounts.reduce((sum, item) => sum + item.amount, 0) + discountTotal + taxTotal + tipTotal,
        );
      const memberTotals = buildReceiptMemberTotals({
        items: itemAmounts.map(({ item, amount }) => ({
          id: item.id,
          amount,
          claimedByMemberKeys: item.claimedByMemberKeys,
        })),
        total,
        discount: discountTotal,
        tax: taxTotal,
        tip: tipTotal,
      });
    const payerId = payerIds[0];
    const paidByMemberId = new Map(payerPaymentRows.map((row) => [row.memberId, row.amount]));
    const splitRows: SplitDetail[] = Object.entries(memberTotals)
      .flatMap(([memberKey, amount]) => {
        const member = memberForKey(memberKey);
         return member && (Math.abs(amount) > 0.0005 || paidByMemberId.has(member.id))
           ? [{
             memberId: member.id,
             amount,
             paid: paidByMemberId.get(member.id),
           }]
          : [];
      })
      ;
    payerPaymentRows.forEach((row) => {
      if (!splitRows.some((split) => split.memberId === row.memberId)) {
        splitRows.push({ memberId: row.memberId, amount: 0, paid: row.amount });
      }
    });
    // Each scanned line has a category; mixed receipts keep a per-category breakdown.
    const receiptCategory = (receipt as { category?: string | null }).category || "other";
    const breakdownTotals: Record<string, number> = {};
    receipt.items.forEach((item) => {
      const draft = itemDrafts[item.id];
      const lineAmount = draft ? parseFloat(draft.amount) : item.amount ?? 0;
      const lineCategory = (item as { category?: string | null }).category || receiptCategory;
      if (Number.isFinite(lineAmount) && lineAmount > 0) {
        breakdownTotals[lineCategory] = (breakdownTotals[lineCategory] ?? 0) + lineAmount;
      }
    });
    const breakdownEntries = Object.entries(breakdownTotals).sort((a, b) => b[1] - a[1]);
    const expenseCategory = breakdownEntries[0]?.[0] ?? receiptCategory;
    const categoryBreakdown = breakdownEntries.length > 1
      ? Object.fromEntries(breakdownEntries.map(([key, value]) => [key, Math.round(value * 100) / 100]))
      : undefined;
    setSaving(true);
    addExpense({
      groupId,
      description: merchant.trim() || "Receipt",
      amount: total,
      currency: receipt.currency ?? group.currency,
      paidById: payerId,
      splitType: "exact",
      splits: splitRows,
      category: expenseCategory,
      ...(categoryBreakdown ? { categoryBreakdown } : {}),
      receiptId: receipt.id,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }, [
    addExpense,
    group,
    groupId,
    itemDrafts,
    memberForKey,
    merchant,
    payerIds,
    payerPaymentRows,
    payerSplitType,
    payerSplitValid,
    receipt,
    taxAmount,
    taxText,
    taxMode,
    tipAmount,
    tipText,
    tipMode,
    totalText,
  ]);

  if (loading || !receipt) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Reading receipt…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.headerBg }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Review receipt</Text>
        <Pressable
          onPress={requestReplacement}
          disabled={retaking}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Retake receipt photo"
        >
          {retaking ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Feather name="camera" size={22} color={colors.text} />
          )}
        </Pressable>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 112 }}
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={() => setImageViewerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Open receipt photo"
          >
            <Image source={{ uri: receipt.imageUrl }} style={styles.receiptImage} resizeMode="cover" />
          </Pressable>

          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Receipt details</Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Description</Text>
            <TextInput
              value={merchant}
              onChangeText={setMerchant}
              onEndEditing={() => void updateMerchant()}
               placeholder="Merchant or expense description"
              placeholderTextColor={colors.textTertiary}
              style={[
                styles.textInput,
                {
                  color: colors.text,
                  backgroundColor: colors.inputBg,
                  borderColor: colors.inputBorder,
                  boxShadow: "none",
                },
              ]}
            />
            <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 16 }]}>Total</Text>
            <View style={styles.totalInputRow}>
              <Pressable
                onPress={() => setCurrencyPickerVisible(true)}
                style={[
                  styles.receiptCurrencyPicker,
                  { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Choose receipt currency"
              >
                <Text style={[styles.receiptCurrencyText, { color: colors.text }]}>
                  {CURRENCY_SYMBOLS[receiptCurrency] ?? receiptCurrency}
                </Text>
                <Feather name="chevron-down" size={15} color={colors.textSecondary} />
              </Pressable>
              <TextInput
                value={totalText}
                onChangeText={setTotalText}
                onEndEditing={() => {
                  const value = Number(totalText.replace(",", "."));
                  if (Number.isFinite(value) && value >= 0) {
                    void api.updateReceipt(receipt.id, { total: roundMoney(value) }).then(setReceipt);
                  }
                }}
                keyboardType="decimal-pad"
                placeholder="Total"
                placeholderTextColor={colors.textTertiary}
                style={[
                  styles.textInput,
                  styles.totalInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.inputBg,
                    borderColor: colors.inputBorder,
                    boxShadow: "none",
                  },
                ]}
              />
            </View>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Paid by</Text>
          <ScrollView
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.paidByRow}
          >
            {orderedGroupMembers.map((member) => (
              <Pressable
                key={member.id}
                onPress={() => {
                  lastTapRef.current = Date.now();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPayerIds((previous) =>
                    previous.includes(member.id)
                      ? previous.filter((id) => id !== member.id)
                      : [...previous, member.id],
                  );
                }}
                style={[
                  styles.paidByChip,
                  {
                    backgroundColor: payerIds.includes(member.id) ? colors.primaryLight : colors.surface,
                    borderColor: payerIds.includes(member.id) ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[styles.paidByLabel, { color: payerIds.includes(member.id) ? colors.primary : colors.text }]}>
                  {member.isCurrentUser ? "You" : member.name.split(" ")[0]}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={[styles.paidByHint, { color: colors.textTertiary }]}>
            Tap who paid.
          </Text>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Payment split</Text>
          <View style={[styles.payerSplitCard, { backgroundColor: colors.surface }]}>
            <View style={[styles.payerSplitTypeRow, { borderColor: colors.border }]}>
              {PAYER_SPLIT_TYPES.map((split) => (
                <Pressable
                  key={split.value}
                  onPress={() => setPayerSplitType(split.value)}
                  style={[
                    styles.payerSplitTypeButton,
                    payerSplitType === split.value && { backgroundColor: colors.primaryLight },
                  ]}
                >
                  <Text style={[styles.payerSplitTypeLabel, { color: payerSplitType === split.value ? colors.primary : colors.text }]}>
                    {split.label}
                  </Text>
                  <Text style={[styles.payerSplitTypeDescription, { color: payerSplitType === split.value ? colors.primary : colors.textSecondary }]}>
                    {split.description}
                  </Text>
                </Pressable>
              ))}
            </View>
            {payerPaymentRows.length === 0 ? (
              <Text style={[styles.payerEmptyText, { color: colors.textSecondary }]}>
                Select at least one payer above.
              </Text>
            ) : (
              <View style={styles.payerRows}>
                {payerPaymentRows.map((row) => {
                  const member = orderedGroupMembers.find((candidate) => candidate.id === row.memberId);
                  return (
                    <View key={row.memberId} style={styles.payerRow}>
                      <Text style={[styles.payerName, { color: colors.text }]}>
                        {member?.isCurrentUser ? "You" : member?.name.split(" ")[0] ?? "Member"}
                      </Text>
                      {payerSplitType === "equal" ? (
                        <Text style={[styles.payerCalculatedAmount, { color: colors.textSecondary }]}>
                          {formatAmount(row.amount, receipt.currency ?? group?.currency ?? "USD")}
                        </Text>
                      ) : payerSplitType === "exact" ? (
                        <TextInput
                          value={payerExactAmounts[row.memberId] ?? ""}
                          onChangeText={(value) => setPayerExactAmounts((previous) => ({ ...previous, [row.memberId]: value }))}
                          keyboardType="decimal-pad"
                          placeholder="Amount"
                          placeholderTextColor={colors.textTertiary}
                          style={[styles.payerAmountInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
                        />
                      ) : (
                        <View style={styles.payerPercentageInput}>
                          <TextInput
                            value={payerPercentages[row.memberId] ?? ""}
                            onChangeText={(value) => setPayerPercentages((previous) => ({ ...previous, [row.memberId]: value }))}
                            keyboardType="decimal-pad"
                            placeholder="%"
                            placeholderTextColor={colors.textTertiary}
                            style={[styles.payerAmountInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
                          />
                          <Text style={[styles.payerPercentageAmount, { color: colors.textSecondary }]}>
                            {formatAmount(row.amount, receipt.currency ?? group?.currency ?? "USD")}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
            {payerPaymentRows.length > 0 ? (
              <View
                style={[
                  styles.payerValidationRow,
                  {
                    backgroundColor: payerSplitValid ? colors.successLight : colors.dangerLight,
                    borderColor: payerSplitValid ? colors.success : colors.danger,
                  },
                ]}
              >
                <Feather
                  name={payerSplitValid ? "check-circle" : "alert-circle"}
                  size={16}
                  color={payerSplitValid ? colors.success : colors.danger}
                />
                <Text style={[styles.payerValidationText, { color: payerSplitValid ? colors.success : colors.danger }]}>
                  {payerSplitValid
                    ? `Splits add up to ${formatAmount(receiptTotal, receipt.currency ?? group?.currency ?? "USD")} ✓`
                    : payerSplitType === "percentage"
                      ? payerRemaining > 0
                        ? `${payerRemaining.toFixed(1)}% remaining to assign`
                        : `${Math.abs(payerRemaining).toFixed(1)}% over the total`
                      : payerRemaining > 0
                        ? `${formatAmount(payerRemaining, receipt.currency ?? group?.currency ?? "USD")} remaining to assign`
                        : `${formatAmount(Math.abs(payerRemaining), receipt.currency ?? group?.currency ?? "USD")} over the total`}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.sectionHeadingRow}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Line items</Text>
            <Text style={[styles.sectionHint, { color: colors.textTertiary }]}>Tap a line to edit · tap who had it</Text>
          </View>
           <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {receipt.items.map((item, itemIndex) => {
              const draft = itemDrafts[item.id] ?? {
                name: item.name,
                amount: item.amount == null ? "" : String(item.amount),
                quantity: item.quantity == null ? "" : String(item.quantity),
                unitPrice: item.unitPrice == null ? "" : String(item.unitPrice),
              };
              return (
                    <View
                      key={item.id}
                      style={[
                        styles.itemRow,
                        { backgroundColor: colors.background, borderColor: colors.border },
                      ]}
                    >
                   {item.uncertain ? (
                     <View style={styles.itemHeading}>
                       <Text style={[styles.uncertainLabel, { color: colors.warning }]}>Check OCR</Text>
                     </View>
                   ) : null}
                  <View style={styles.itemHeaderRow}>
                    <Pressable
                    onPress={() => setEditingItemId(id => (id === item.id ? null : item.id))}
                    style={{ flex: 1, minWidth: 0 }}
                    accessibilityRole="button"
                    accessibilityLabel="Edit item"
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <Text style={{ flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.text }} numberOfLines={1}>
                        {draft.name || `Item ${itemIndex + 1}`}
                      </Text>
                      <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.text, fontVariant: ["tabular-nums"] }}>
                        {draft.amount || "0.00"}
                      </Text>
                    </View>
                    {Number(draft.quantity) > 1 ? (
                      <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                        {draft.quantity} × {draft.unitPrice || (Number(draft.amount) / Number(draft.quantity)).toFixed(2)}
                      </Text>
                    ) : null}
                  </Pressable>
                    <Pressable
                      onPress={() => {
                        showAlert("Delete this item?", "The item and its claims will be removed from this receipt.", [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: () =>
                              void api.deleteReceiptItem(receipt.id, item.id).then(applyReceipt).catch((error) => {
                                showAlert("Couldn't delete item", toUserMessage(error));
                              }),
                          },
                        ]);
                      }}
                      hitSlop={8}
                      style={styles.deleteButton}
                      accessibilityLabel="Delete item"
                    >
                      <Feather name="trash-2" size={17} color={colors.danger} />
                    </Pressable>
                  </View>
                  <View style={[styles.itemFieldGrid, editingItemId === item.id ? null : { display: "none" }]}>
                     <View style={styles.itemNameField}>
                       <Text style={[styles.itemFieldLabel, { color: colors.textSecondary }]}>Item</Text>
                       <TextInput
                         value={draft.name}
                         onChangeText={(name) => setItemDrafts((prev) => ({ ...prev, [item.id]: { ...draft, name } }))}
                          onEndEditing={() => void updateItem(item.id, "name")}
                          style={[
                            styles.itemName,
                            {
                              color: colors.text,
                              backgroundColor: colors.inputBg,
                              borderColor: colors.inputBorder,
                            },
                          ]}
                         placeholder="Item"
                         placeholderTextColor={colors.textTertiary}
                       />
                     </View>
                     <View style={styles.itemPriceField}>
                       <Text style={[styles.itemFieldLabel, { color: colors.textSecondary }]}>Total price</Text>
                       <TextInput
                         value={draft.amount}
                         onChangeText={(amount) => setItemDrafts((prev) => ({ ...prev, [item.id]: { ...draft, amount } }))}
                        onEndEditing={() => void updateItem(item.id, "amount")}
                         keyboardType="decimal-pad"
                         style={[
                           styles.itemAmount,
                           {
                             color: colors.textSecondary,
                             backgroundColor: colors.inputBg,
                             borderColor: colors.inputBorder,
                           },
                         ]}
                       />
                     </View>
                  </View>
                   <View style={[styles.itemDetailGrid, editingItemId === item.id ? null : { display: "none" }]}>
                     <View style={styles.itemQuantityField}>
                       <Text style={[styles.itemFieldLabel, { color: colors.textSecondary }]}>Quantity</Text>
                       <TextInput
                         value={draft.quantity}
                         onChangeText={(quantity) => setItemDrafts((prev) => ({ ...prev, [item.id]: { ...draft, quantity } }))}
                         onEndEditing={() => void updateItem(item.id, "quantity")}
                         keyboardType="decimal-pad"
                         placeholder="0"
                         placeholderTextColor={colors.textTertiary}
                         style={[styles.smallItemInput, { color: colors.textSecondary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                       />
                     </View>
                     <View style={styles.itemUnitPriceField}>
                       <Text style={[styles.itemFieldLabel, { color: colors.textSecondary }]}>Unit price</Text>
                       <TextInput
                         value={draft.unitPrice}
                         onChangeText={(unitPrice) => setItemDrafts((prev) => ({ ...prev, [item.id]: { ...draft, unitPrice } }))}
                         onEndEditing={() => void updateItem(item.id, "unitPrice")}
                         keyboardType="decimal-pad"
                         placeholder="0.00"
                         placeholderTextColor={colors.textTertiary}
                         style={[styles.smallItemInput, { color: colors.textSecondary, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                       />
                     </View>
                  </View>
                  <View style={styles.memberPicker}>
                     {(() => {
                        const memberKeys = orderedGroupMembers.map((member) => getMemberKeyForGroup(member.id, groupId));
                       const allSelected = memberKeys.length > 0 &&
                         memberKeys.every((memberKey) => item.claimedByMemberKeys.includes(memberKey));
                       return (
                         <Pressable
                           onPress={() => void toggleAllClaims(item.id)}
                           accessibilityRole="button"
                           accessibilityLabel={allSelected ? "Clear all item claims" : "Claim item for everyone"}
                           accessibilityState={{ selected: allSelected }}
                           style={[
                             styles.memberChip,
                             styles.allMemberChip,
                             {
                               borderColor: allSelected ? colors.primary : colors.border,
                               backgroundColor: allSelected ? colors.primary : "transparent",
                             },
                           ]}
                         >
                           <Text style={[styles.memberChipText, { color: allSelected ? "#fff" : colors.textSecondary }]}>
                             All
                           </Text>
                         </Pressable>
                       );
                     })()}
                     {orderedGroupMembers.map((member) => {
                      const memberKey = getMemberKeyForGroup(member.id, groupId);
                      const selected = item.claimedByMemberKeys.includes(memberKey);
                      return (
                        <Pressable
                          key={memberKey}
                          onPress={() => void toggleClaim(item.id, memberKey)}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          style={[
                            styles.memberChip,
                            {
                              borderColor: selected ? colors.primary : colors.border,
                              backgroundColor: selected ? colors.primary : "transparent",
                            },
                          ]}
                        >
                          <Text style={[styles.memberChipText, { color: selected ? "#fff" : colors.textSecondary }]}>
                           {member.isCurrentUser ? "You" : (member.name.split(" ")[0] || member.name)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
            <View style={styles.itemActions}>
              <Pressable
                style={[styles.addItemButton, { borderColor: colors.border }]}
                onPress={() =>
                  void api.addReceiptItem(receipt.id, { name: "New item", amount: null }).then(applyReceipt).catch((error) => {
                    showAlert("Couldn't add item", toUserMessage(error));
                  })
                }
              >
                <Feather name="plus" size={16} color={colors.primary} />
                <Text style={[styles.addItemText, { color: colors.primary }]}>Add item</Text>
              </Pressable>
            </View>
           </View>

          {(() => {
            const cur = receipt.currency ?? group?.currency ?? "USD";
            const cells = [
              { key: "discount" as const, label: "Discount", amount: manualDiscountAmount ?? 0, color: colors.danger },
              { key: "tip" as const, label: "Tip", amount: tipAmount, color: colors.text },
              { key: "tax" as const, label: "VAT", amount: taxAmount, color: colors.text },
            ];
            const field = adjustField;
            const adj = field === "discount"
              ? { mode: discountMode, setMode: setDiscountMode, text: discountText, setText: setDiscountText, save: null as null | (() => void) }
              : field === "tip"
                ? { mode: tipMode, setMode: setTipMode, text: tipText, setText: setTipText, save: () => void updateReceiptAdjustment("tip", tipText, tipMode) }
                : field === "tax"
                  ? { mode: taxMode, setMode: setTaxMode, text: taxText, setText: setTaxText, save: () => void updateReceiptAdjustment("tax", taxText, taxMode) }
                  : null;
            return (
              <View style={[styles.card, { backgroundColor: colors.surface, paddingVertical: 10, marginBottom: 12 }]}>
                <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 0, marginBottom: 8 }]}>Tax, tip & discounts</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {cells.map((cell) => (
                    <Pressable
                      key={cell.key}
                      onPress={() => setAdjustField((prev) => (prev === cell.key ? null : cell.key))}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${cell.label}`}
                      style={{
                        flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 12, borderWidth: 1,
                        borderColor: field === cell.key ? colors.primary : colors.border,
                      }}
                    >
                      <Text style={{ fontSize: 11, color: colors.textSecondary }}>{cell.label}</Text>
                      <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: cell.amount > 0 ? cell.color : colors.textTertiary, fontVariant: ["tabular-nums"] }}>
                        {cell.amount > 0 ? `${cell.key === "discount" ? "−" : ""}${formatAmount(cell.amount, cur)}` : "—"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {adj ? (
                  <View style={styles.discountInputRow}>
                    <View style={[styles.discountMode, { borderColor: colors.border }]}>
                      {(["value", "percentage"] as const).map((mode) => (
                        <Pressable
                          key={mode}
                          onPress={() => adj.setMode(mode)}
                          style={[styles.discountModeButton, { backgroundColor: adj.mode === mode ? colors.primary : "transparent" }]}
                        >
                          <Text style={[styles.discountModeText, { color: adj.mode === mode ? "#fff" : colors.textSecondary }]}>
                            {mode === "value" ? "Amount" : "%"}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <TextInput
                      value={adj.text}
                      onChangeText={adj.setText}
                      onEndEditing={adj.save ?? undefined}
                      keyboardType="decimal-pad"
                      placeholder={adj.mode === "percentage" ? "Percent" : "Amount"}
                      placeholderTextColor={colors.textTertiary}
                      autoFocus
                      style={[styles.discountInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
                    />
                  </View>
                ) : null}
              </View>
            );
          })()}

          <View style={[styles.reconciliationCard, { backgroundColor: colors.surface, borderColor: reviewStatus.color }]}>
            <View style={styles.reconciliationHeading}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 0, marginBottom: 0 }]}>Arithmetic check</Text>
              <Text style={[styles.statusLabel, { color: reviewStatus.color }]}>{reviewStatus.label}</Text>
            </View>
            {reviewStatus.difference != null ? (
              <Text style={[styles.reconciliationText, { color: colors.textSecondary }]}>
                Difference: {formatAmount(Math.abs(reviewStatus.difference), receipt.currency ?? group?.currency ?? "USD")}
              </Text>
            ) : (
              <Text style={[styles.reconciliationText, { color: colors.textSecondary }]}>
                Missing values stay blank until you confirm them.
              </Text>
            )}
            {receipt.reconciliationWarnings.map((warning) => (
              <Text key={warning} style={[styles.reconciliationText, { color: colors.warning }]}>• {warning}</Text>
            ))}
          </View>

          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Running totals</Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {totalsPreview.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Claim items to see each person’s share.</Text>
            ) : (
              totalsPreview.map(({ memberKey, amount, member }, totalIndex) => (
                <View
                  key={memberKey}
                  style={[
                    styles.totalRow,
                    totalIndex > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
                  ]}
                >
                  <Text style={[styles.totalName, { color: colors.text }]}>{member?.isCurrentUser ? "You" : member?.name ?? "Member"}</Text>
                  <Text style={[styles.totalAmount, { color: colors.primary }]}>
                    {formatAmount(amount, receipt.currency ?? group?.currency ?? "USD")}
                  </Text>
                </View>
              ))
            )}
             <Text style={[styles.taxNote, { color: colors.textTertiary }]}>
               Discount, tip, and VAT are allocated proportionally when the expense is saved.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal
        visible={imageViewerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setImageViewerVisible(false)}
      >
        <View style={styles.imageModalBackdrop}>
          <Pressable
            onPress={() => setImageViewerVisible(false)}
            style={styles.imageModalClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close receipt photo"
          >
            <Feather name="x" size={26} color="#fff" />
          </Pressable>
          <Image source={{ uri: receipt.imageUrl }} style={styles.fullReceiptImage} resizeMode="contain" />
        </View>
      </Modal>
      <CurrencyPickerModal
        visible={currencyPickerVisible}
        value={receiptCurrency}
        onChange={(currency) => void updateReceiptCurrency(currency as Currency)}
        onClose={() => setCurrencyPickerVisible(false)}
        title="Receipt currency"
      />
      <View style={[styles.bottomBar, { backgroundColor: colors.background, paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={[styles.saveButton, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
          onPress={saveExpense}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save expense</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 12, fontSize: 14 },
  header: { minHeight: 64, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  receiptImage: { width: "100%", height: 210, borderRadius: 18, backgroundColor: "#ddd", marginBottom: 20 },
  imageModalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.94)", alignItems: "center", justifyContent: "center", padding: 16 },
  imageModalClose: { position: "absolute", top: 54, right: 20, zIndex: 1 },
  fullReceiptImage: { width: "100%", height: "82%" },
  sectionLabel: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginTop: 8 },
  sectionHeadingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  sectionHint: { fontSize: 12, marginBottom: 8 },
  card: { borderRadius: 18, padding: 16, marginBottom: 18 },
  fieldLabel: { fontSize: 12, fontWeight: "600", marginBottom: 8 },
  textInput: { fontSize: 17, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, shadowColor: "transparent", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  totalInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  receiptCurrencyPicker: { minWidth: 78, height: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 8, borderWidth: 1, paddingHorizontal: 8 },
  receiptCurrencyText: { fontSize: 17, fontWeight: "600" },
  totalInput: { flex: 1 },
  paidByRow: { gap: 8, paddingBottom: 6 },
  paidByChip: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 8 },
  paidByLabel: { fontSize: 13, fontWeight: "700" },
  paidByHint: { fontSize: 12, lineHeight: 17, marginBottom: 14 },
  payerSplitCard: { borderRadius: 18, padding: 14, marginBottom: 18 },
  payerSplitTypeRow: { flexDirection: "row", borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, overflow: "hidden" },
  payerSplitTypeButton: { flex: 1, alignItems: "center", paddingHorizontal: 6, paddingVertical: 8 },
  payerSplitTypeLabel: { fontSize: 13, fontWeight: "700" },
  payerSplitTypeDescription: { fontSize: 10, marginTop: 2 },
  payerRows: { gap: 8, marginTop: 14 },
  payerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  payerName: { flex: 1, fontSize: 14, fontWeight: "600" },
  payerCalculatedAmount: { fontSize: 14, fontWeight: "700" },
  payerAmountInput: { width: 108, minHeight: 36, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, paddingHorizontal: 10, fontSize: 14, textAlign: "right" },
  payerPercentageInput: { flexDirection: "row", alignItems: "center", gap: 10 },
  payerPercentageAmount: { width: 80, fontSize: 12, textAlign: "right" },
  payerValidationRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 12 },
  payerValidationText: { flex: 1, fontSize: 12, lineHeight: 17 },
  payerEmptyText: { fontSize: 13, marginTop: 12 },
  itemRow: { paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderRadius: 16, marginBottom: 8 },
  itemHeading: { marginBottom: 5 },
  itemNumber: { fontSize: 12, fontWeight: "700" },
  uncertainLabel: { flex: 1, fontSize: 11, fontWeight: "700" },
  deleteButton: { padding: 4, marginLeft: 4 },
  itemHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  itemFieldGrid: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  itemNameField: { flex: 1 },
  itemPriceField: { width: 74 },
  itemFieldLabel: { fontSize: 11, fontWeight: "600", marginBottom: 4 },
  itemDetailGrid: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 10 },
  itemQuantityField: { flex: 1 },
  itemUnitPriceField: { width: 74 },
  itemName: { flex: 1, minHeight: 34, fontSize: 14, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  itemAmount: { width: 74, minHeight: 34, fontSize: 14, textAlign: "left", paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  smallItemInput: { width: 74, minHeight: 34, borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5, fontSize: 14 },
  itemWarning: { fontSize: 11, lineHeight: 15, marginTop: 4 },
  memberPicker: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 5, marginTop: 4 },
  memberChip: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  allMemberChip: { minWidth: 34, alignItems: "center" },
  memberChipText: { fontSize: 11, fontWeight: "700" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 9 },
  totalName: { fontSize: 15, fontWeight: "600" },
  totalAmount: { fontSize: 15, fontWeight: "700" },
  taxNote: { fontSize: 12, lineHeight: 17, marginTop: 12 },
  emptyText: { fontSize: 14, lineHeight: 20 },
  itemActions: { paddingTop: 12 },
  addItemButton: { minHeight: 40, borderWidth: 1, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  addItemText: { fontSize: 14, fontWeight: "700" },
  adjustmentCard: { borderRadius: 18, padding: 16, marginBottom: 18 },
  discountRow: { paddingVertical: 8 },
  discountHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  discountTitle: { fontSize: 15, fontWeight: "700" },
  discountHint: { fontSize: 12, marginTop: 3 },
  discountAmount: { fontSize: 15, fontWeight: "700" },
  discountInputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  discountMode: { flexDirection: "row", borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, overflow: "hidden" },
  discountModeButton: { minWidth: 46, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, paddingVertical: 7 },
  discountModeText: { fontSize: 12, fontWeight: "700" },
  discountInput: { flex: 1, minHeight: 36, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, paddingHorizontal: 10, fontSize: 14 },
  receiptAdjustmentRows: { marginTop: 16, gap: 10 },
  receiptAdjustmentRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  receiptAdjustmentCopy: { flex: 1 },
  adjustmentInput: { width: 100, minHeight: 36, borderWidth: StyleSheet.hairlineWidth, borderRadius: 9, paddingHorizontal: 10, fontSize: 14, textAlign: "right" },
  reconciliationCard: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 18 },
  reconciliationHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusLabel: { fontSize: 13, fontWeight: "700" },
  reconciliationText: { fontSize: 12, lineHeight: 17, marginTop: 8 },
  bottomBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10 },
  saveButton: { minHeight: 54, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});