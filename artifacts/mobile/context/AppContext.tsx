import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Currency = "USD" | "EUR" | "GBP" | "CAD" | "AUD" | "JPY" | "INR";

export interface Member {
  id: string;
  name: string;
  email?: string;
  avatarColor: string;
  isCurrentUser?: boolean;
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
  addMember: (member: Omit<Member, "id">) => Member;
  addGroup: (group: Omit<Group, "id" | "createdAt">) => Group;
  updateGroup: (id: string, updates: Partial<Group>) => void;
  deleteGroup: (id: string) => void;
  addExpense: (expense: Omit<Expense, "id" | "createdAt">) => void;
  updateExpense: (id: string, updates: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;
  addSettlement: (settlement: Omit<Settlement, "id" | "createdAt">) => void;
  getGroupBalances: (groupId: string) => DebtRelation[];
  getTotalOwed: () => { youOwe: number; youAreOwed: number };
  getMemberById: (id: string) => Member | undefined;
  getGroupById: (id: string) => Group | undefined;
  getGroupExpenses: (groupId: string) => Expense[];
  getGroupSettlements: (groupId: string) => Settlement[];
  isLoading: boolean;
}

const STORAGE_KEY = "spliteasy_data";

const DEFAULT_AVATAR_COLORS = [
  "#1A9E8F", "#3B82F6", "#8B5CF6", "#F59E0B",
  "#EC4899", "#10B981", "#F97316", "#6366F1",
];

const CURRENT_USER_ID = "user_current";

const defaultCurrentUser: Member = {
  id: CURRENT_USER_ID,
  name: "You",
  avatarColor: "#1A9E8F",
  isCurrentUser: true,
};

const defaultMembers: Member[] = [
  defaultCurrentUser,
  { id: "user_2", name: "Alex Chen", email: "alex@example.com", avatarColor: "#3B82F6" },
  { id: "user_3", name: "Sam Rivera", email: "sam@example.com", avatarColor: "#8B5CF6" },
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

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [currentUser] = useState<Member>(defaultCurrentUser);
  const [members, setMembers] = useState<Member[]>(defaultMembers);
  const [groups, setGroups] = useState<Group[]>(defaultGroups);
  const [expenses, setExpenses] = useState<Expense[]>(defaultExpenses);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.members) setMembers(data.members);
        if (data.groups) setGroups(data.groups);
        if (data.expenses) setExpenses(data.expenses);
        if (data.settlements) setSettlements(data.settlements);
      }
    } catch (e) {
      // Use defaults
    } finally {
      setIsLoading(false);
    }
  };

  const saveData = useCallback(
    async (
      updatedMembers: Member[],
      updatedGroups: Group[],
      updatedExpenses: Expense[],
      updatedSettlements: Settlement[]
    ) => {
      try {
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            members: updatedMembers,
            groups: updatedGroups,
            expenses: updatedExpenses,
            settlements: updatedSettlements,
          })
        );
      } catch (e) {}
    },
    []
  );

  const genId = () =>
    Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

  const addMember = useCallback(
    (member: Omit<Member, "id">) => {
      const idx = members.filter(m => !m.isCurrentUser).length;
      const newMember: Member = {
        ...member,
        id: genId(),
        avatarColor: DEFAULT_AVATAR_COLORS[idx % DEFAULT_AVATAR_COLORS.length],
      };
      const updated = [...members, newMember];
      setMembers(updated);
      saveData(updated, groups, expenses, settlements);
      return newMember;
    },
    [members, groups, expenses, settlements, saveData]
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
      saveData(members, updated, expenses, settlements);
      return newGroup;
    },
    [members, groups, expenses, settlements, saveData]
  );

  const updateGroup = useCallback(
    (id: string, updates: Partial<Group>) => {
      const updated = groups.map(g => (g.id === id ? { ...g, ...updates } : g));
      setGroups(updated);
      saveData(members, updated, expenses, settlements);
    },
    [members, groups, expenses, settlements, saveData]
  );

  const deleteGroup = useCallback(
    (id: string) => {
      const updatedGroups = groups.filter(g => g.id !== id);
      const updatedExpenses = expenses.filter(e => e.groupId !== id);
      const updatedSettlements = settlements.filter(s => s.groupId !== id);
      setGroups(updatedGroups);
      setExpenses(updatedExpenses);
      setSettlements(updatedSettlements);
      saveData(members, updatedGroups, updatedExpenses, updatedSettlements);
    },
    [members, groups, expenses, settlements, saveData]
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
      saveData(members, groups, updated, settlements);
    },
    [members, groups, expenses, settlements, saveData]
  );

  const updateExpense = useCallback(
    (id: string, updates: Partial<Expense>) => {
      const updated = expenses.map(e => (e.id === id ? { ...e, ...updates } : e));
      setExpenses(updated);
      saveData(members, groups, updated, settlements);
    },
    [members, groups, expenses, settlements, saveData]
  );

  const deleteExpense = useCallback(
    (id: string) => {
      const updated = expenses.filter(e => e.id !== id);
      setExpenses(updated);
      saveData(members, groups, updated, settlements);
    },
    [members, groups, expenses, settlements, saveData]
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
      saveData(members, groups, expenses, updated);
    },
    [members, groups, expenses, settlements, saveData]
  );

  const getGroupBalances = useCallback(
    (groupId: string): DebtRelation[] => {
      const group = groups.find(g => g.id === groupId);
      if (!group) return [];

      const groupExpenses = expenses.filter(e => e.groupId === groupId);
      const groupSettlements = settlements.filter(s => s.groupId === groupId);

      const balances: Record<string, Record<string, number>> = {};

      for (const memberId of group.memberIds) {
        balances[memberId] = {};
        for (const otherId of group.memberIds) {
          if (memberId !== otherId) balances[memberId][otherId] = 0;
        }
      }

      for (const expense of groupExpenses) {
        const payer = expense.paidById;
        for (const split of expense.splits) {
          if (split.memberId !== payer && group.memberIds.includes(split.memberId)) {
            balances[split.memberId][payer] =
              (balances[split.memberId][payer] || 0) + split.amount;
          }
        }
      }

      for (const settlement of groupSettlements) {
        if (
          group.memberIds.includes(settlement.fromId) &&
          group.memberIds.includes(settlement.toId)
        ) {
          balances[settlement.fromId][settlement.toId] = Math.max(
            0,
            (balances[settlement.fromId][settlement.toId] || 0) - settlement.amount
          );
        }
      }

      const debts: DebtRelation[] = [];
      const processed = new Set<string>();

      for (const fromId of group.memberIds) {
        for (const toId of group.memberIds) {
          if (fromId === toId) continue;
          const key = [fromId, toId].sort().join("_");
          if (processed.has(key)) continue;
          processed.add(key);

          const aOwesB = balances[fromId]?.[toId] || 0;
          const bOwesA = balances[toId]?.[fromId] || 0;
          const net = aOwesB - bOwesA;

          if (net > 0.009) {
            debts.push({ fromId, toId, amount: Math.round(net * 100) / 100 });
          } else if (net < -0.009) {
            debts.push({ fromId: toId, toId: fromId, amount: Math.round(-net * 100) / 100 });
          }
        }
      }

      return debts;
    },
    [groups, expenses, settlements]
  );

  const getTotalOwed = useCallback(() => {
    let youOwe = 0;
    let youAreOwed = 0;

    for (const group of groups.filter(g => !g.isArchived)) {
      const debts = getGroupBalances(group.id);
      for (const debt of debts) {
        if (debt.fromId === CURRENT_USER_ID) youOwe += debt.amount;
        if (debt.toId === CURRENT_USER_ID) youAreOwed += debt.amount;
      }
    }

    return { youOwe, youAreOwed };
  }, [groups, getGroupBalances]);

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
        currentUser,
        members,
        groups,
        expenses,
        settlements,
        addMember,
        addGroup,
        updateGroup,
        deleteGroup,
        addExpense,
        updateExpense,
        deleteExpense,
        addSettlement,
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
