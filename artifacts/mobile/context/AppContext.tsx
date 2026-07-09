import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Currency = "USD" | "EUR" | "GBP" | "CAD" | "AUD" | "JPY" | "INR" | "AED";

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: "$", EUR: "€", GBP: "£", CAD: "CA$", AUD: "A$",
  JPY: "¥", INR: "₹", AED: "AED ",
};

export function formatAmount(amount: number, currency: Currency): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency + " ";
  return `${symbol}${amount.toFixed(2)}`;
}

export interface Member {
  id: string;
  name: string;
  email?: string;
  avatarColor: string;
  photo?: string;
  isCurrentUser?: boolean;
  isPending?: boolean;
}

export interface SplitDetail {
  memberId: string;
  amount: number;
  percentage?: number;
  paid?: number;
}

export type SplitType = "equal" | "exact" | "percentage";

export interface Expense {
  id: string;
  groupId: string;
  description: string;
  amount: number;
  currency: Currency;
  paidById: string;
  splitType: SplitType;
  splits: SplitDetail[];
  createdAt: string;
  category: ExpenseCategory;
  notes?: string;
}

export type ExpenseCategory =
  | "food"
  | "transport"
  | "accommodation"
  | "entertainment"
  | "utilities"
  | "shopping"
  | "health"
  | "other";

export interface Settlement {
  id: string;
  groupId: string;
  fromId: string;
  toId: string;
  amount: number;
  currency: Currency;
  createdAt: string;
  note?: string;
}

export interface Group {
  id: string;
  name: string;
  emoji: string;
  memberIds: string[];
  currency: Currency;
  createdAt: string;
  type: "trip" | "home" | "friends" | "couple" | "other";
  isArchived?: boolean;
}

export interface GroupInvitation {
  id: string;
  groupId: string;
  groupName: string;
  groupEmoji: string;
  groupCurrency: Currency;
  groupType: Group["type"];
  inviterUserId: string;
  inviterName: string;
  inviterAvatarColor: string;
  invitedEmail: string;
  invitedName?: string;
  invitedMemberId?: string;
  status: "pending" | "accepted" | "declined";
  createdAt: string;
}

export interface Balance {
  memberId: string;
  amount: number;
}

export interface DebtRelation {
  fromId: string;
  toId: string;
  amount: number;
}

interface AppContextType {
  currentUser: Member;
  members: Member[];
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
  invitations: GroupInvitation[];
  defaultCurrency: Currency;
  setDefaultCurrency: (c: Currency) => void;
  exchangeRates: Record<string, number>;
  ratesUpdated: string | null;
  fetchExchangeRates: () => Promise<void>;
  convertCurrency: (amount: number, from: Currency) => number;
  convertAmount: (amount: number, from: Currency, to: Currency) => number;
  simplifyDebtsEnabled: boolean;
  toggleSimplifyDebts: () => void;
  updateCurrentUser: (updates: Partial<Omit<Member, "id" | "isCurrentUser">>) => void;
  addMember: (member: Omit<Member, "id">) => Member;
  addGroup: (group: Omit<Group, "id" | "createdAt">) => Group;
  updateGroup: (id: string, updates: Partial<Group>) => void;
  deleteGroup: (id: string) => void;
  addExpense: (expense: Omit<Expense, "id" | "createdAt">) => void;
  updateExpense: (id: string, updates: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;
  addSettlement: (settlement: Omit<Settlement, "id" | "createdAt">) => void;
  sendGroupInvite: (groupId: string, email: string, name?: string) => GroupInvitation | null;
  acceptInvitation: (invitationId: string) => void;
  declineInvitation: (invitationId: string) => void;
  getPendingInvitesForCurrentUser: () => GroupInvitation[];
  getGroupPendingInvites: (groupId: string) => GroupInvitation[];
  getGroupBalances: (groupId: string) => DebtRelation[];
  getTotalOwed: () => { youOwe: number; youAreOwed: number; currency: Currency };
  getMemberById: (id: string) => Member | undefined;
  getGroupById: (id: string) => Group | undefined;
  getGroupExpenses: (groupId: string) => Expense[];
  getGroupSettlements: (groupId: string) => Settlement[];
  isLoading: boolean;
}

const STORAGE_KEY = "spliteasy_data_v2";

const DEFAULT_AVATAR_COLORS = [
  "#FF6B35", "#7C3AED", "#0EA5E9", "#F59E0B",
  "#FF3366", "#00C896", "#EC4899", "#10B981",
];

const CURRENT_USER_ID = "user_current";

const defaultCurrentUser: Member = {
  id: CURRENT_USER_ID,
  name: "You",
  avatarColor: "#FF6B35",
  isCurrentUser: true,
};

const defaultMembers: Member[] = [
  defaultCurrentUser,
  { id: "user_2", name: "Alex Chen", email: "alex@example.com", avatarColor: "#7C3AED" },
  { id: "user_3", name: "Sam Rivera", email: "sam@example.com", avatarColor: "#0EA5E9" },
  { id: "user_4", name: "Jordan Lee", email: "jordan@example.com", avatarColor: "#F59E0B" },
];

const defaultGroups: Group[] = [
  {
    id: "group_1",
    name: "Barcelona Trip",
    emoji: "✈️",
    memberIds: ["user_current", "user_2", "user_3"],
    currency: "EUR",
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    type: "trip",
  },
  {
    id: "group_2",
    name: "The Apartment",
    emoji: "🏠",
    memberIds: ["user_current", "user_3", "user_4"],
    currency: "USD",
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    type: "home",
  },
];

const defaultExpenses: Expense[] = [
  {
    id: "exp_1",
    groupId: "group_1",
    description: "Hotel Booking",
    amount: 450,
    currency: "EUR",
    paidById: "user_current",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 150, paid: 450 },
      { memberId: "user_2", amount: 150 },
      { memberId: "user_3", amount: 150 },
    ],
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    category: "accommodation",
  },
  {
    id: "exp_2",
    groupId: "group_1",
    description: "Airport Transfer",
    amount: 60,
    currency: "EUR",
    paidById: "user_2",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 20 },
      { memberId: "user_2", amount: 20, paid: 60 },
      { memberId: "user_3", amount: 20 },
    ],
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    category: "transport",
  },
  {
    id: "exp_3",
    groupId: "group_2",
    description: "Monthly Rent",
    amount: 2400,
    currency: "USD",
    paidById: "user_current",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 800, paid: 2400 },
      { memberId: "user_3", amount: 800 },
      { memberId: "user_4", amount: 800 },
    ],
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    category: "utilities",
  },
  {
    id: "exp_4",
    groupId: "group_2",
    description: "Groceries",
    amount: 127.5,
    currency: "USD",
    paidById: "user_4",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 42.5 },
      { memberId: "user_3", amount: 42.5 },
      { memberId: "user_4", amount: 42.5, paid: 127.5 },
    ],
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    category: "food",
  },
];

const defaultInvitations: GroupInvitation[] = [
  {
    id: "inv_demo_1",
    groupId: "group_invite_paris",
    groupName: "Weekend in Paris",
    groupEmoji: "🗼",
    groupCurrency: "EUR",
    groupType: "trip",
    inviterUserId: "user_2",
    inviterName: "Alex Chen",
    inviterAvatarColor: "#7C3AED",
    invitedEmail: "you@example.com",
    invitedMemberId: CURRENT_USER_ID,
    status: "pending",
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
];

function rawPairwiseDebts(groupExpenses: Expense[], groupSettlements: Settlement[], memberIds: string[]): DebtRelation[] {
  const pairBalance: Record<string, Record<string, number>> = {};

  groupExpenses.forEach(expense => {
    const payer = expense.paidById;
    if (!memberIds.includes(payer)) return;
    expense.splits.forEach(split => {
      if (split.memberId === payer) return;
      if (!memberIds.includes(split.memberId)) return;
      if (!pairBalance[payer]) pairBalance[payer] = {};
      pairBalance[payer][split.memberId] = (pairBalance[payer][split.memberId] ?? 0) + split.amount;
    });
  });

  groupSettlements.forEach(s => {
    if (!memberIds.includes(s.fromId) || !memberIds.includes(s.toId)) return;
    if (pairBalance[s.toId] && pairBalance[s.toId][s.fromId] !== undefined) {
      pairBalance[s.toId][s.fromId] -= s.amount;
    }
  });

  const result: DebtRelation[] = [];
  Object.keys(pairBalance).forEach(creditor => {
    Object.keys(pairBalance[creditor]).forEach(debtor => {
      const amount = pairBalance[creditor][debtor];
      if (amount > 0.005) {
        result.push({ fromId: debtor, toId: creditor, amount: Math.round(amount * 100) / 100 });
      } else if (amount < -0.005) {
        result.push({ fromId: creditor, toId: debtor, amount: Math.round(-amount * 100) / 100 });
      }
    });
  });
  return result;
}

function simplifyDebts(netBalances: Record<string, number>): DebtRelation[] {
  const ids = Object.keys(netBalances);
  const creditors: { id: string; amount: number }[] = [];
  const debtors: { id: string; amount: number }[] = [];

  ids.forEach(id => {
    const balance = netBalances[id];
    if (balance > 0.005) creditors.push({ id, amount: balance });
    else if (balance < -0.005) debtors.push({ id, amount: -balance });
  });

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const result: DebtRelation[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const credit = creditors[ci];
    const debt = debtors[di];
    const payment = Math.min(credit.amount, debt.amount);

    if (payment > 0.005) {
      result.push({
        fromId: debt.id,
        toId: credit.id,
        amount: Math.round(payment * 100) / 100,
      });
    }

    credit.amount -= payment;
    debt.amount -= payment;
    if (credit.amount < 0.005) ci++;
    if (debt.amount < 0.005) di++;
  }

  return result;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const SIMPLIFY_KEY = "@spliteasy_simplify";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<Member>(defaultCurrentUser);
  const [members, setMembers] = useState<Member[]>(defaultMembers);
  const [groups, setGroups] = useState<Group[]>(defaultGroups);
  const [expenses, setExpenses] = useState<Expense[]>(defaultExpenses);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [invitations, setInvitations] = useState<GroupInvitation[]>(defaultInvitations);
  const [isLoading, setIsLoading] = useState(true);
  const [simplifyDebtsEnabled, setSimplifyDebtsEnabled] = useState(true);
  const [defaultCurrency, setDefaultCurrencyState] = useState<Currency>("USD");
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({});
  const [ratesUpdated, setRatesUpdated] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.members) {
          setMembers(data.members);
          const me = (data.members as Member[]).find(m => m.isCurrentUser);
          if (me) setCurrentUser(me);
        }
        if (data.groups) setGroups(data.groups);
        if (data.expenses) setExpenses(data.expenses);
        if (data.settlements) setSettlements(data.settlements);
        if (data.invitations !== undefined) setInvitations(data.invitations);
      }
      const simplifyStored = await AsyncStorage.getItem(SIMPLIFY_KEY);
      if (simplifyStored !== null) setSimplifyDebtsEnabled(simplifyStored === "true");
      const currencyStored = await AsyncStorage.getItem("@spliteasy_defaultCurrency");
      if (currencyStored) setDefaultCurrencyState(currencyStored as Currency);
      const ratesStored = await AsyncStorage.getItem("@spliteasy_rates");
      if (ratesStored) {
        const { rates, updated } = JSON.parse(ratesStored);
        setExchangeRates(rates);
        setRatesUpdated(updated);
        const ageMs = Date.now() - new Date(updated).getTime();
        if (ageMs > 24 * 60 * 60 * 1000) fetchExchangeRates();
      } else {
        fetchExchangeRates();
      }
    } catch (e) {
    } finally {
      setIsLoading(false);
    }
  };

  const fetchExchangeRates = useCallback(async () => {
    try {
      const resp = await fetch("https://api.frankfurter.app/latest?from=USD");
      const data = await resp.json();
      const rates: Record<string, number> = data.rates ?? {};
      const updated = new Date().toISOString();
      setExchangeRates(rates);
      setRatesUpdated(updated);
      await AsyncStorage.setItem("@spliteasy_rates", JSON.stringify({ rates, updated }));
    } catch {}
  }, []);

  const convertAmount = useCallback(
    (amount: number, from: Currency, to: Currency): number => {
      if (from === to) return amount;
      if (Object.keys(exchangeRates).length === 0) return amount;
      const inUSD = from === "USD" ? amount : amount / (exchangeRates[from] ?? 1);
      return to === "USD" ? inUSD : inUSD * (exchangeRates[to] ?? 1);
    },
    [exchangeRates]
  );

  const convertCurrency = useCallback(
    (amount: number, from: Currency): number => {
      if (from === defaultCurrency) return amount;
      if (Object.keys(exchangeRates).length === 0) return amount;
      const inUSD = from === "USD" ? amount : amount / (exchangeRates[from] ?? 1);
      return defaultCurrency === "USD" ? inUSD : inUSD * (exchangeRates[defaultCurrency] ?? 1);
    },
    [exchangeRates, defaultCurrency]
  );

  const setDefaultCurrency = useCallback(async (currency: Currency) => {
    setDefaultCurrencyState(currency);
    await AsyncStorage.setItem("@spliteasy_defaultCurrency", currency);
  }, []);

  const toggleSimplifyDebts = useCallback(() => {
    setSimplifyDebtsEnabled(prev => {
      const next = !prev;
      AsyncStorage.setItem(SIMPLIFY_KEY, String(next));
      return next;
    });
  }, []);

  const saveData = useCallback(
    async (
      updatedMembers: Member[],
      updatedGroups: Group[],
      updatedExpenses: Expense[],
      updatedSettlements: Settlement[],
      updatedInvitations: GroupInvitation[]
    ) => {
      try {
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            members: updatedMembers,
            groups: updatedGroups,
            expenses: updatedExpenses,
            settlements: updatedSettlements,
            invitations: updatedInvitations,
          })
        );
      } catch (e) {}
    },
    []
  );

  const updateCurrentUser = useCallback(
    (updates: Partial<Omit<Member, "id" | "isCurrentUser">>) => {
      const updated: Member = { ...currentUser, ...updates };
      setCurrentUser(updated);
      const updatedMembers = members.map(m => m.isCurrentUser ? updated : m);
      setMembers(updatedMembers);
      saveData(updatedMembers, groups, expenses, settlements, invitations);
    },
    [currentUser, members, groups, expenses, settlements, invitations, saveData]
  );

  const genId = () =>
    Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

  const addMember = useCallback(
    (member: Omit<Member, "id">) => {
      const idx = members.filter(m => !m.isCurrentUser).length;
      const newMember: Member = {
        ...member,
        id: genId(),
        avatarColor: member.avatarColor || DEFAULT_AVATAR_COLORS[idx % DEFAULT_AVATAR_COLORS.length],
      };
      const updated = [...members, newMember];
      setMembers(updated);
      saveData(updated, groups, expenses, settlements, invitations);
      return newMember;
    },
    [members, groups, expenses, settlements, invitations, saveData]
  );

  const addGroup = useCallback(
    (group: Omit<Group, "id" | "createdAt">) => {
      const newGroup: Group = {
        ...group,
        id: genId(),
        createdAt: new Date().toISOString(),
      };
      const updated = [newGroup, ...groups];
      setGroups(updated);
      saveData(members, updated, expenses, settlements, invitations);
      return newGroup;
    },
    [members, groups, expenses, settlements, invitations, saveData]
  );

  const updateGroup = useCallback(
    (id: string, updates: Partial<Group>) => {
      const updated = groups.map(g => (g.id === id ? { ...g, ...updates } : g));
      setGroups(updated);
      saveData(members, updated, expenses, settlements, invitations);
    },
    [members, groups, expenses, settlements, invitations, saveData]
  );

  const deleteGroup = useCallback(
    (id: string) => {
      const updatedGroups = groups.filter(g => g.id !== id);
      const updatedExpenses = expenses.filter(e => e.groupId !== id);
      const updatedSettlements = settlements.filter(s => s.groupId !== id);
      const updatedInvitations = invitations.filter(i => i.groupId !== id);
      setGroups(updatedGroups);
      setExpenses(updatedExpenses);
      setSettlements(updatedSettlements);
      setInvitations(updatedInvitations);
      saveData(members, updatedGroups, updatedExpenses, updatedSettlements, updatedInvitations);
    },
    [members, groups, expenses, settlements, invitations, saveData]
  );

  const addExpense = useCallback(
    (expense: Omit<Expense, "id" | "createdAt">) => {
      const newExpense: Expense = {
        ...expense,
        id: genId(),
        createdAt: new Date().toISOString(),
      };
      const updated = [newExpense, ...expenses];
      setExpenses(updated);
      saveData(members, groups, updated, settlements, invitations);
    },
    [members, groups, expenses, settlements, invitations, saveData]
  );

  const updateExpense = useCallback(
    (id: string, updates: Partial<Expense>) => {
      const updated = expenses.map(e => (e.id === id ? { ...e, ...updates } : e));
      setExpenses(updated);
      saveData(members, groups, updated, settlements, invitations);
    },
    [members, groups, expenses, settlements, invitations, saveData]
  );

  const deleteExpense = useCallback(
    (id: string) => {
      const updated = expenses.filter(e => e.id !== id);
      setExpenses(updated);
      saveData(members, groups, updated, settlements, invitations);
    },
    [members, groups, expenses, settlements, invitations, saveData]
  );

  const addSettlement = useCallback(
    (settlement: Omit<Settlement, "id" | "createdAt">) => {
      const newSettlement: Settlement = {
        ...settlement,
        id: genId(),
        createdAt: new Date().toISOString(),
      };
      const updated = [newSettlement, ...settlements];
      setSettlements(updated);
      saveData(members, groups, expenses, updated, invitations);
    },
    [members, groups, expenses, settlements, invitations, saveData]
  );

  const sendGroupInvite = useCallback(
    (groupId: string, email: string, name?: string): GroupInvitation | null => {
      const group = groups.find(g => g.id === groupId);
      if (!group) return null;

      const existing = invitations.find(
        i => i.groupId === groupId && i.invitedEmail.toLowerCase() === email.toLowerCase() && i.status === "pending"
      );
      if (existing) return existing;

      const newInvite: GroupInvitation = {
        id: genId(),
        groupId,
        groupName: group.name,
        groupEmoji: group.emoji,
        groupCurrency: group.currency,
        groupType: group.type,
        inviterUserId: CURRENT_USER_ID,
        inviterName: "You",
        inviterAvatarColor: currentUser.avatarColor,
        invitedEmail: email,
        invitedName: name || email.split("@")[0],
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      const updated = [...invitations, newInvite];
      setInvitations(updated);
      saveData(members, groups, expenses, settlements, updated);
      return newInvite;
    },
    [members, groups, expenses, settlements, invitations, currentUser, saveData]
  );

  const acceptInvitation = useCallback(
    (invitationId: string) => {
      const invite = invitations.find(i => i.id === invitationId);
      if (!invite) return;

      const newGroup: Group = {
        id: invite.groupId,
        name: invite.groupName,
        emoji: invite.groupEmoji,
        currency: invite.groupCurrency,
        type: invite.groupType,
        memberIds: [invite.inviterUserId, CURRENT_USER_ID],
        createdAt: invite.createdAt,
      };

      const updatedGroups = [newGroup, ...groups];
      const updatedInvitations = invitations.map(i =>
        i.id === invitationId ? { ...i, status: "accepted" as const } : i
      );

      setGroups(updatedGroups);
      setInvitations(updatedInvitations);
      saveData(members, updatedGroups, expenses, settlements, updatedInvitations);
    },
    [members, groups, expenses, settlements, invitations, saveData]
  );

  const declineInvitation = useCallback(
    (invitationId: string) => {
      const updatedInvitations = invitations.filter(i => i.id !== invitationId);
      setInvitations(updatedInvitations);
      saveData(members, groups, expenses, settlements, updatedInvitations);
    },
    [members, groups, expenses, settlements, invitations, saveData]
  );

  const getPendingInvitesForCurrentUser = useCallback(
    () =>
      invitations.filter(
        i => i.invitedMemberId === CURRENT_USER_ID && i.status === "pending"
      ),
    [invitations]
  );

  const getGroupPendingInvites = useCallback(
    (groupId: string) =>
      invitations.filter(
        i => i.groupId === groupId && i.inviterUserId === CURRENT_USER_ID && i.status === "pending"
      ),
    [invitations]
  );

  const getGroupBalances = useCallback(
    (groupId: string): DebtRelation[] => {
      const group = groups.find(g => g.id === groupId);
      if (!group) return [];

      const groupExpenses = expenses.filter(e => e.groupId === groupId);
      const groupSettlements = settlements.filter(s => s.groupId === groupId);

      if (!simplifyDebtsEnabled) {
        return rawPairwiseDebts(groupExpenses, groupSettlements, group.memberIds);
      }

      const netBalances: Record<string, number> = {};
      group.memberIds.forEach(id => { netBalances[id] = 0; });

      groupExpenses.forEach(expense => {
        const payer = expense.paidById;
        if (!(payer in netBalances)) return;
        expense.splits.forEach(split => {
          if (!(split.memberId in netBalances)) return;
          if (split.memberId !== payer) {
            netBalances[payer] = (netBalances[payer] || 0) + split.amount;
            netBalances[split.memberId] = (netBalances[split.memberId] || 0) - split.amount;
          }
        });
      });

      groupSettlements.forEach(settlement => {
        if (!(settlement.fromId in netBalances) || !(settlement.toId in netBalances)) return;
        netBalances[settlement.fromId] = (netBalances[settlement.fromId] || 0) + settlement.amount;
        netBalances[settlement.toId] = (netBalances[settlement.toId] || 0) - settlement.amount;
      });

      return simplifyDebts(netBalances);
    },
    [groups, expenses, settlements, simplifyDebtsEnabled]
  );

  const getTotalOwed = useCallback(() => {
    let youOwe = 0;
    let youAreOwed = 0;

    for (const group of groups.filter(g => !g.isArchived)) {
      const debts = getGroupBalances(group.id);
      for (const debt of debts) {
        const converted = convertCurrency(debt.amount, group.currency);
        if (debt.fromId === CURRENT_USER_ID) youOwe += converted;
        if (debt.toId === CURRENT_USER_ID) youAreOwed += converted;
      }
    }

    return { youOwe, youAreOwed, currency: defaultCurrency };
  }, [groups, getGroupBalances, convertCurrency, defaultCurrency]);

  const getMemberById = useCallback(
    (id: string) => members.find(m => m.id === id),
    [members]
  );

  const getGroupById = useCallback(
    (id: string) => groups.find(g => g.id === id),
    [groups]
  );

  const getGroupExpenses = useCallback(
    (groupId: string) =>
      expenses
        .filter(e => e.groupId === groupId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [expenses]
  );

  const getGroupSettlements = useCallback(
    (groupId: string) =>
      settlements
        .filter(s => s.groupId === groupId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [settlements]
  );

  return (
    <AppContext.Provider
      value={{
        defaultCurrency,
        setDefaultCurrency,
        exchangeRates,
        ratesUpdated,
        fetchExchangeRates,
        convertCurrency,
        convertAmount,
        updateCurrentUser,
        currentUser,
        members,
        groups,
        expenses,
        settlements,
        invitations,
        simplifyDebtsEnabled,
        toggleSimplifyDebts,
        addMember,
        addGroup,
        updateGroup,
        deleteGroup,
        addExpense,
        updateExpense,
        deleteExpense,
        addSettlement,
        sendGroupInvite,
        acceptInvitation,
        declineInvitation,
        getPendingInvitesForCurrentUser,
        getGroupPendingInvites,
        getGroupBalances,
        getTotalOwed,
        getMemberById,
        getGroupById,
        getGroupExpenses,
        getGroupSettlements,
        isLoading,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be inside AppProvider");
  return ctx;
}

export const CURRENT_USER_ID_EXPORT = CURRENT_USER_ID;
