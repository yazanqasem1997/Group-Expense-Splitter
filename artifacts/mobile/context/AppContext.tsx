import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useToast } from "@/context/ToastContext";
import { processOverdueRecurring } from "@/services/backgroundRecurring";

/** All ISO 4217 currencies are valid — the type is kept broad for extensibility. */
export type Currency = string;

export interface CurrencyInfo {
  code: string;
  label: string;
  flag: string;
  symbol: string;
}

/** Complete list of world currencies — use this for all pickers. */
export const CURRENCY_LIST: CurrencyInfo[] = [
  { code: "AED", label: "UAE Dirham",                      flag: "🇦🇪", symbol: "AED " },
  { code: "AFN", label: "Afghan Afghani",                  flag: "🇦🇫", symbol: "؋ "   },
  { code: "ALL", label: "Albanian Lek",                    flag: "🇦🇱", symbol: "L "   },
  { code: "AMD", label: "Armenian Dram",                   flag: "🇦🇲", symbol: "֏ "   },
  { code: "ANG", label: "Antillean Guilder",               flag: "🇳🇱", symbol: "ƒ "   },
  { code: "AOA", label: "Angolan Kwanza",                  flag: "🇦🇴", symbol: "Kz "  },
  { code: "ARS", label: "Argentine Peso",                  flag: "🇦🇷", symbol: "ARS$" },
  { code: "AUD", label: "Australian Dollar",               flag: "🇦🇺", symbol: "A$"   },
  { code: "AWG", label: "Aruban Florin",                   flag: "🇦🇼", symbol: "ƒ "   },
  { code: "AZN", label: "Azerbaijani Manat",               flag: "🇦🇿", symbol: "₼"    },
  { code: "BAM", label: "Bosnia-Herzegovina Mark",         flag: "🇧🇦", symbol: "KM "  },
  { code: "BBD", label: "Barbadian Dollar",                flag: "🇧🇧", symbol: "Bds$" },
  { code: "BDT", label: "Bangladeshi Taka",                flag: "🇧🇩", symbol: "৳"    },
  { code: "BGN", label: "Bulgarian Lev",                   flag: "🇧🇬", symbol: "лв "  },
  { code: "BHD", label: "Bahraini Dinar",                  flag: "🇧🇭", symbol: "BD "  },
  { code: "BIF", label: "Burundian Franc",                 flag: "🇧🇮", symbol: "Fr "  },
  { code: "BMD", label: "Bermudian Dollar",                flag: "🇧🇲", symbol: "BD$"  },
  { code: "BND", label: "Brunei Dollar",                   flag: "🇧🇳", symbol: "B$"   },
  { code: "BOB", label: "Bolivian Boliviano",              flag: "🇧🇴", symbol: "Bs."  },
  { code: "BRL", label: "Brazilian Real",                  flag: "🇧🇷", symbol: "R$"   },
  { code: "BSD", label: "Bahamian Dollar",                 flag: "🇧🇸", symbol: "B$"   },
  { code: "BTN", label: "Bhutanese Ngultrum",              flag: "🇧🇹", symbol: "Nu."  },
  { code: "BWP", label: "Botswanan Pula",                  flag: "🇧🇼", symbol: "P "   },
  { code: "BYN", label: "Belarusian Ruble",                flag: "🇧🇾", symbol: "Br "  },
  { code: "BZD", label: "Belizean Dollar",                 flag: "🇧🇿", symbol: "BZ$"  },
  { code: "CAD", label: "Canadian Dollar",                 flag: "🇨🇦", symbol: "CA$"  },
  { code: "CDF", label: "Congolese Franc",                 flag: "🇨🇩", symbol: "Fr "  },
  { code: "CHF", label: "Swiss Franc",                     flag: "🇨🇭", symbol: "CHF " },
  { code: "CLP", label: "Chilean Peso",                    flag: "🇨🇱", symbol: "CLP$" },
  { code: "CNY", label: "Chinese Yuan",                    flag: "🇨🇳", symbol: "¥"    },
  { code: "COP", label: "Colombian Peso",                  flag: "🇨🇴", symbol: "COP$" },
  { code: "CRC", label: "Costa Rican Colón",               flag: "🇨🇷", symbol: "₡"    },
  { code: "CUP", label: "Cuban Peso",                      flag: "🇨🇺", symbol: "$MN " },
  { code: "CVE", label: "Cape Verdean Escudo",             flag: "🇨🇻", symbol: "Esc " },
  { code: "CZK", label: "Czech Koruna",                    flag: "🇨🇿", symbol: "Kč "  },
  { code: "DJF", label: "Djiboutian Franc",                flag: "🇩🇯", symbol: "Fr "  },
  { code: "DKK", label: "Danish Krone",                    flag: "🇩🇰", symbol: "kr "  },
  { code: "DOP", label: "Dominican Peso",                  flag: "🇩🇴", symbol: "RD$"  },
  { code: "DZD", label: "Algerian Dinar",                  flag: "🇩🇿", symbol: "دج "  },
  { code: "EGP", label: "Egyptian Pound",                  flag: "🇪🇬", symbol: "E£"   },
  { code: "ERN", label: "Eritrean Nakfa",                  flag: "🇪🇷", symbol: "Nfk " },
  { code: "ETB", label: "Ethiopian Birr",                  flag: "🇪🇹", symbol: "Br "  },
  { code: "EUR", label: "Euro",                            flag: "🇪🇺", symbol: "€"    },
  { code: "FJD", label: "Fijian Dollar",                   flag: "🇫🇯", symbol: "FJ$"  },
  { code: "FKP", label: "Falkland Islands Pound",          flag: "🇫🇰", symbol: "FK£"  },
  { code: "GBP", label: "British Pound",                   flag: "🇬🇧", symbol: "£"    },
  { code: "GEL", label: "Georgian Lari",                   flag: "🇬🇪", symbol: "₾"    },
  { code: "GHS", label: "Ghanaian Cedi",                   flag: "🇬🇭", symbol: "GH₵"  },
  { code: "GIP", label: "Gibraltar Pound",                 flag: "🇬🇮", symbol: "£"    },
  { code: "GMD", label: "Gambian Dalasi",                  flag: "🇬🇲", symbol: "D "   },
  { code: "GNF", label: "Guinean Franc",                   flag: "🇬🇳", symbol: "Fr "  },
  { code: "GTQ", label: "Guatemalan Quetzal",              flag: "🇬🇹", symbol: "Q "   },
  { code: "GYD", label: "Guyanese Dollar",                 flag: "🇬🇾", symbol: "GY$"  },
  { code: "HKD", label: "Hong Kong Dollar",                flag: "🇭🇰", symbol: "HK$"  },
  { code: "HNL", label: "Honduran Lempira",                flag: "🇭🇳", symbol: "L "   },
  { code: "HRK", label: "Croatian Kuna",                   flag: "🇭🇷", symbol: "kn "  },
  { code: "HTG", label: "Haitian Gourde",                  flag: "🇭🇹", symbol: "G "   },
  { code: "HUF", label: "Hungarian Forint",                flag: "🇭🇺", symbol: "Ft "  },
  { code: "IDR", label: "Indonesian Rupiah",               flag: "🇮🇩", symbol: "Rp "  },
  { code: "ILS", label: "Israeli Shekel",                  flag: "🇮🇱", symbol: "₪"    },
  { code: "INR", label: "Indian Rupee",                    flag: "🇮🇳", symbol: "₹"    },
  { code: "IQD", label: "Iraqi Dinar",                     flag: "🇮🇶", symbol: "ع.د " },
  { code: "IRR", label: "Iranian Rial",                    flag: "🇮🇷", symbol: "﷼"    },
  { code: "ISK", label: "Icelandic Króna",                 flag: "🇮🇸", symbol: "kr "  },
  { code: "JMD", label: "Jamaican Dollar",                 flag: "🇯🇲", symbol: "J$"   },
  { code: "JOD", label: "Jordanian Dinar",                 flag: "🇯🇴", symbol: "JD "  },
  { code: "JPY", label: "Japanese Yen",                    flag: "🇯🇵", symbol: "¥"    },
  { code: "KES", label: "Kenyan Shilling",                 flag: "🇰🇪", symbol: "KSh " },
  { code: "KGS", label: "Kyrgyzstani Som",                 flag: "🇰🇬", symbol: "с "   },
  { code: "KHR", label: "Cambodian Riel",                  flag: "🇰🇭", symbol: "៛"    },
  { code: "KMF", label: "Comorian Franc",                  flag: "🇰🇲", symbol: "Fr "  },
  { code: "KRW", label: "South Korean Won",                flag: "🇰🇷", symbol: "₩"    },
  { code: "KWD", label: "Kuwaiti Dinar",                   flag: "🇰🇼", symbol: "KD "  },
  { code: "KYD", label: "Cayman Islands Dollar",           flag: "🇰🇾", symbol: "CI$"  },
  { code: "KZT", label: "Kazakhstani Tenge",               flag: "🇰🇿", symbol: "₸"    },
  { code: "LAK", label: "Laotian Kip",                     flag: "🇱🇦", symbol: "₭"    },
  { code: "LBP", label: "Lebanese Pound",                  flag: "🇱🇧", symbol: "ل.ل " },
  { code: "LKR", label: "Sri Lankan Rupee",                flag: "🇱🇰", symbol: "Rs "  },
  { code: "LRD", label: "Liberian Dollar",                 flag: "🇱🇷", symbol: "L$"   },
  { code: "LSL", label: "Lesotho Loti",                    flag: "🇱🇸", symbol: "M "   },
  { code: "LYD", label: "Libyan Dinar",                    flag: "🇱🇾", symbol: "LD "  },
  { code: "MAD", label: "Moroccan Dirham",                 flag: "🇲🇦", symbol: "MAD " },
  { code: "MDL", label: "Moldovan Leu",                    flag: "🇲🇩", symbol: "L "   },
  { code: "MGA", label: "Malagasy Ariary",                 flag: "🇲🇬", symbol: "Ar "  },
  { code: "MKD", label: "Macedonian Denar",                flag: "🇲🇰", symbol: "ден " },
  { code: "MMK", label: "Myanmar Kyat",                    flag: "🇲🇲", symbol: "K "   },
  { code: "MNT", label: "Mongolian Tugrik",                flag: "🇲🇳", symbol: "₮"    },
  { code: "MOP", label: "Macanese Pataca",                 flag: "🇲🇴", symbol: "P "   },
  { code: "MRU", label: "Mauritanian Ouguiya",             flag: "🇲🇷", symbol: "UM "  },
  { code: "MUR", label: "Mauritian Rupee",                 flag: "🇲🇺", symbol: "Rs "  },
  { code: "MVR", label: "Maldivian Rufiyaa",               flag: "🇲🇻", symbol: "Rf "  },
  { code: "MWK", label: "Malawian Kwacha",                 flag: "🇲🇼", symbol: "MK "  },
  { code: "MXN", label: "Mexican Peso",                    flag: "🇲🇽", symbol: "MX$"  },
  { code: "MYR", label: "Malaysian Ringgit",               flag: "🇲🇾", symbol: "RM "  },
  { code: "MZN", label: "Mozambican Metical",              flag: "🇲🇿", symbol: "MT "  },
  { code: "NAD", label: "Namibian Dollar",                 flag: "🇳🇦", symbol: "N$"   },
  { code: "NGN", label: "Nigerian Naira",                  flag: "🇳🇬", symbol: "₦"    },
  { code: "NIO", label: "Nicaraguan Córdoba",              flag: "🇳🇮", symbol: "C$"   },
  { code: "NOK", label: "Norwegian Krone",                 flag: "🇳🇴", symbol: "kr "  },
  { code: "NPR", label: "Nepali Rupee",                    flag: "🇳🇵", symbol: "Rs "  },
  { code: "NZD", label: "New Zealand Dollar",              flag: "🇳🇿", symbol: "NZ$"  },
  { code: "OMR", label: "Omani Rial",                      flag: "🇴🇲", symbol: "OMR " },
  { code: "PAB", label: "Panamanian Balboa",               flag: "🇵🇦", symbol: "B/."  },
  { code: "PEN", label: "Peruvian Sol",                    flag: "🇵🇪", symbol: "S/."  },
  { code: "PGK", label: "Papua New Guinean Kina",          flag: "🇵🇬", symbol: "K "   },
  { code: "PHP", label: "Philippine Peso",                 flag: "🇵🇭", symbol: "₱"    },
  { code: "PKR", label: "Pakistani Rupee",                 flag: "🇵🇰", symbol: "₨"    },
  { code: "PLN", label: "Polish Zloty",                    flag: "🇵🇱", symbol: "zł "  },
  { code: "PYG", label: "Paraguayan Guaraní",              flag: "🇵🇾", symbol: "₲"    },
  { code: "QAR", label: "Qatari Riyal",                    flag: "🇶🇦", symbol: "QAR " },
  { code: "RON", label: "Romanian Leu",                    flag: "🇷🇴", symbol: "lei " },
  { code: "RSD", label: "Serbian Dinar",                   flag: "🇷🇸", symbol: "RSD " },
  { code: "RUB", label: "Russian Ruble",                   flag: "🇷🇺", symbol: "₽"    },
  { code: "RWF", label: "Rwandan Franc",                   flag: "🇷🇼", symbol: "Fr "  },
  { code: "SAR", label: "Saudi Riyal",                     flag: "🇸🇦", symbol: "SAR " },
  { code: "SBD", label: "Solomon Islands Dollar",          flag: "🇸🇧", symbol: "SI$"  },
  { code: "SCR", label: "Seychellois Rupee",               flag: "🇸🇨", symbol: "Rs "  },
  { code: "SDG", label: "Sudanese Pound",                  flag: "🇸🇩", symbol: "£SD " },
  { code: "SEK", label: "Swedish Krona",                   flag: "🇸🇪", symbol: "kr "  },
  { code: "SGD", label: "Singapore Dollar",                flag: "🇸🇬", symbol: "S$"   },
  { code: "SHP", label: "Saint Helena Pound",              flag: "🇸🇭", symbol: "£"    },
  { code: "SLL", label: "Sierra Leonean Leone",            flag: "🇸🇱", symbol: "Le "  },
  { code: "SOS", label: "Somali Shilling",                 flag: "🇸🇴", symbol: "Sh "  },
  { code: "SRD", label: "Surinamese Dollar",               flag: "🇸🇷", symbol: "Sr$"  },
  { code: "STN", label: "São Tomé Dobra",                  flag: "🇸🇹", symbol: "Db "  },
  { code: "SVC", label: "Salvadoran Colón",                flag: "🇸🇻", symbol: "₡"    },
  { code: "SYP", label: "Syrian Pound",                    flag: "🇸🇾", symbol: "£S "  },
  { code: "SZL", label: "Swazi Lilangeni",                 flag: "🇸🇿", symbol: "L "   },
  { code: "THB", label: "Thai Baht",                       flag: "🇹🇭", symbol: "฿"    },
  { code: "TJS", label: "Tajikistani Somoni",              flag: "🇹🇯", symbol: "SM "  },
  { code: "TMT", label: "Turkmenistani Manat",             flag: "🇹🇲", symbol: "T "   },
  { code: "TND", label: "Tunisian Dinar",                  flag: "🇹🇳", symbol: "DT "  },
  { code: "TOP", label: "Tongan Paʻanga",                  flag: "🇹🇴", symbol: "T$"   },
  { code: "TRY", label: "Turkish Lira",                    flag: "🇹🇷", symbol: "₺"    },
  { code: "TTD", label: "Trinidad & Tobago Dollar",        flag: "🇹🇹", symbol: "TT$"  },
  { code: "TWD", label: "Taiwan Dollar",                   flag: "🇹🇼", symbol: "NT$"  },
  { code: "TZS", label: "Tanzanian Shilling",              flag: "🇹🇿", symbol: "TSh " },
  { code: "UAH", label: "Ukrainian Hryvnia",               flag: "🇺🇦", symbol: "₴"    },
  { code: "UGX", label: "Ugandan Shilling",                flag: "🇺🇬", symbol: "USh " },
  { code: "USD", label: "US Dollar",                       flag: "🇺🇸", symbol: "$"    },
  { code: "UYU", label: "Uruguayan Peso",                  flag: "🇺🇾", symbol: "$U "  },
  { code: "UZS", label: "Uzbekistani Som",                 flag: "🇺🇿", symbol: "сум " },
  { code: "VES", label: "Venezuelan Bolívar",              flag: "🇻🇪", symbol: "Bs.S" },
  { code: "VND", label: "Vietnamese Dong",                 flag: "🇻🇳", symbol: "₫"    },
  { code: "VUV", label: "Vanuatu Vatu",                    flag: "🇻🇺", symbol: "Vt "  },
  { code: "WST", label: "Samoan Tala",                     flag: "🇼🇸", symbol: "T "   },
  { code: "XAF", label: "Central African CFA",             flag: "🌍",  symbol: "CFA " },
  { code: "XCD", label: "East Caribbean Dollar",           flag: "🌎",  symbol: "EC$"  },
  { code: "XOF", label: "West African CFA",                flag: "🌍",  symbol: "CFA " },
  { code: "XPF", label: "CFP Franc",                       flag: "🌏",  symbol: "Fr "  },
  { code: "YER", label: "Yemeni Rial",                     flag: "🇾🇪", symbol: "﷼"    },
  { code: "ZAR", label: "South African Rand",              flag: "🇿🇦", symbol: "R "   },
  { code: "ZMW", label: "Zambian Kwacha",                  flag: "🇿🇲", symbol: "ZK "  },
  { code: "ZWL", label: "Zimbabwean Dollar",               flag: "🇿🇼", symbol: "Z$"   },
];

/** Symbol lookup map derived from CURRENCY_LIST — includes all world currencies. */
export const CURRENCY_SYMBOLS: Record<string, string> = Object.fromEntries(
  CURRENCY_LIST.map(c => [c.code, c.symbol])
);

export function formatAmount(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? (currency + " ");
  return `${symbol}${amount.toFixed(2)}`;
}

export interface Member {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatarColor: string;
  photo?: string;
  joinedAt?: string;
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

export interface ExpenseComment {
  id: string;
  memberId: string;
  text: string;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  action: "created" | "updated" | "deleted";
  changedBy: string;
  changedAt: string;
  fieldChanges?: Array<{ field: string; oldValue: string; newValue: string }>;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  memberId: string;
  text: string;
  createdAt: string;
}

export type RecurringFrequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "custom";

export const RECURRING_FREQUENCY_DAYS: Record<RecurringFrequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 90,
  custom: 30,
};

export const RECURRING_FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: "Every week",
  biweekly: "Every 2 weeks",
  monthly: "Every month",
  quarterly: "Every 3 months",
  custom: "Custom",
};

export interface RecurringExpense {
  id: string;
  groupId: string;
  description: string;
  amount: number;
  currency: Currency;
  paidById: string;
  splitType: SplitType;
  splits: SplitDetail[];
  category: string;
  frequency: RecurringFrequency;
  customDays?: number;
  dayOfWeek?: number;          // 0 = Sun … 6 = Sat; weekly/biweekly only
  timeOfDay?: string;          // "HH:MM" local 24h
  endType?: "never" | "count" | "date";
  endCount?: number;           // stop after N firings
  endDate?: string;            // ISO YYYY-MM-DD
  occurrenceCount?: number;    // how many times fired so far
  nextDueAt: string;
  isActive: boolean;
  createdAt: string;
}

export type NudgeTone = "friendly" | "firm" | "urgent";

export interface NudgeCampaign {
  isActive: boolean;
  startDaysAfterEnd: number;  // days after group endDate before first nudge
  frequencyDays: number;      // how often to resend
  maxNudges: number;          // stop after N nudges
  nudgesSent: number;
  tone: NudgeTone;
  lastNudgeAt?: string;
}

export interface AppNotification {
  id: string;
  type: "settlement_reminder" | "recurring_fired";
  groupId?: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  tone?: NudgeTone;
}

/** Compute the next N upcoming dates for a recurring config. */
export function computeNextOccurrences(
  config: {
    frequency: RecurringFrequency;
    customDays?: number;
    dayOfWeek?: number;
    endType?: "never" | "count" | "date";
    endCount?: number;
    endDate?: string;
    occurrenceCount?: number;
    nextDueAt: string;
  },
  n: number
): Date[] {
  const results: Date[] = [];
  const intervalDays =
    config.frequency === "custom" && config.customDays
      ? config.customDays
      : RECURRING_FREQUENCY_DAYS[config.frequency];
  let current = new Date(config.nextDueAt);
  let count = config.occurrenceCount ?? 0;
  while (results.length < n) {
    if (config.endType === "count" && config.endCount !== undefined && count >= config.endCount) break;
    if (config.endType === "date" && config.endDate && current > new Date(config.endDate + "T23:59:59")) break;
    results.push(new Date(current));
    count++;
    current = new Date(current.getTime() + intervalDays * 24 * 60 * 60 * 1000);
    if (
      config.dayOfWeek !== undefined &&
      (config.frequency === "weekly" || config.frequency === "biweekly")
    ) {
      const diff = (config.dayOfWeek - current.getDay() + 7) % 7;
      if (diff > 0) current = new Date(current.getTime() + diff * 24 * 60 * 60 * 1000);
    }
  }
  return results;
}

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
  category: string;
  notes?: string;
  addedBy?: string;
  comments?: ExpenseComment[];
  reactions?: Record<string, string[]>;
  auditLog?: AuditEntry[];
}

export type ExpenseCategory =
  | "food" | "transport" | "accommodation" | "entertainment"
  | "utilities" | "shopping" | "health" | "other";

export type NotifPrefs = {
  expenseAdded: boolean;
  expenseEdited: boolean;
  expenseDeleted: boolean;
  settlement: boolean;
  invite: boolean;
  comment: boolean;
  reaction: boolean;
};

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
  archivedAt?: string;
  /** Group period ended (ended ≠ archived; ended groups may still have unsettled balances) */
  isEnded?: boolean;
  endedAt?: string;
  /** Member IDs with admin powers; creator is added automatically */
  adminIds?: string[];
  reminderDays?: number;
  startDate?: string;
  endDate?: string;
  tripStartReminderDays?: number;
  settleUpReminderDays?: number;
  nudgeCampaign?: NudgeCampaign;
  /** Where reminders are delivered */
  reminderChannel?: "push" | "email" | "both";
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
  customCategories: string[];
  addCustomCategory: (name: string) => void;
  notifPrefs: NotifPrefs;
  updateNotifPref: (key: keyof NotifPrefs, value: boolean) => void;
  updateCurrentUser: (updates: Partial<Omit<Member, "id" | "isCurrentUser">>) => void;
  updateMember: (id: string, updates: Partial<Omit<Member, "id">>) => void;
  removeMember: (id: string) => void;
  addMember: (member: Omit<Member, "id">) => Member;
  addGroup: (group: Omit<Group, "id" | "createdAt">) => Group;
  updateGroup: (id: string, updates: Partial<Group>) => void;
  deleteGroup: (id: string) => void;
  archiveGroup: (id: string) => void;
  unarchiveGroup: (id: string) => void;
  endGroup: (id: string) => void;
  assignAdmin: (groupId: string, memberId: string) => void;
  removeAdmin: (groupId: string, memberId: string) => void;
  addExpense: (expense: Omit<Expense, "id" | "createdAt">) => void;
  updateExpense: (id: string, updates: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;
  addExpenseComment: (expenseId: string, text: string) => void;
  toggleReaction: (expenseId: string, emoji: string) => void;
  addSettlement: (settlement: Omit<Settlement, "id" | "createdAt">) => void;
  addSettlements: (settlements: Omit<Settlement, "id" | "createdAt">[]) => void;
  deleteSettlement: (id: string) => void;
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
  groupMessages: GroupMessage[];
  addGroupMessage: (groupId: string, text: string) => GroupMessage;
  getGroupMessages: (groupId: string) => GroupMessage[];
  recurringExpenses: RecurringExpense[];
  addRecurringExpense: (r: Omit<RecurringExpense, "id" | "createdAt">) => RecurringExpense;
  updateRecurringExpense: (id: string, updates: Partial<RecurringExpense>) => void;
  deleteRecurringExpense: (id: string) => void;
  checkAndAddRecurring: () => number;
  notifications: AppNotification[];
  unreadNotificationCount: number;
  markAllNotificationsRead: () => void;
  dismissNotification: (id: string) => void;
  checkAndSendGroupReminders: () => void;
  isLoading: boolean;
}

export const CURRENT_USER_ID_EXPORT = "user_current";
const STORAGE_KEY = "spliteasy_data_v3";
const MESSAGES_KEY = "@spliteasy_messages";
const RECURRING_KEY = "@spliteasy_recurring";
const NOTIFICATIONS_KEY = "@spliteasy_notifications";

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
  { id: "user_5", name: "Emma Wilson", email: "emma@example.com", avatarColor: "#EC4899" },
  { id: "user_6", name: "Marcus Taylor", email: "marcus@example.com", avatarColor: "#10B981" },
  { id: "user_7", name: "Priya Sharma", email: "priya@example.com", avatarColor: "#8B5CF6" },
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
  {
    id: "group_3",
    name: "Tokyo Vacation",
    emoji: "🗾",
    memberIds: ["user_current", "user_2", "user_4", "user_5"],
    currency: "USD",
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    type: "trip",
  },
  {
    id: "group_4",
    name: "Ski Weekend",
    emoji: "⛷️",
    memberIds: ["user_current", "user_5", "user_6"],
    currency: "USD",
    createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
    type: "trip",
  },
  {
    id: "group_5",
    name: "Office Lunch Club",
    emoji: "🍱",
    memberIds: ["user_current", "user_3", "user_6", "user_7"],
    currency: "USD",
    createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    type: "other",
  },
  {
    id: "group_6",
    name: "Road Trip",
    emoji: "🚗",
    memberIds: ["user_current", "user_2", "user_3", "user_4", "user_5"],
    currency: "USD",
    createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    type: "trip",
  },
  {
    id: "group_7",
    name: "Book Club",
    emoji: "📚",
    memberIds: ["user_current", "user_6", "user_7"],
    currency: "USD",
    createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    type: "other",
  },
  {
    id: "group_8",
    name: "Music Festival",
    emoji: "🎸",
    memberIds: ["user_current", "user_2", "user_5", "user_7"],
    currency: "EUR",
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    type: "trip",
  },
  {
    id: "group_9",
    name: "Gym Squad",
    emoji: "💪",
    memberIds: ["user_current", "user_3", "user_4"],
    currency: "USD",
    createdAt: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString(),
    type: "other",
  },
  {
    id: "group_10",
    name: "Birthday Dinner",
    emoji: "🎂",
    memberIds: ["user_current", "user_2", "user_3", "user_4", "user_5", "user_6"],
    currency: "USD",
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    type: "other",
  },
];

const defaultExpenses: Expense[] = [
  // ── Group 1: Barcelona Trip (EUR) ──────────────────────────────────────
  // You paid €450 hotel → Alex & Sam each owe you €150
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
    reactions: { "👍": ["user_2"], "❤️": ["user_3"] },
    comments: [
      { id: "c1", memberId: "user_2", text: "Great find! Love the location.", createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString() },
    ],
  },
  // Alex paid €60 transfer → you owe Alex €20
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
  // Sam paid €90 tapas → you owe Sam €30
  {
    id: "exp_2b",
    groupId: "group_1",
    description: "Tapas Dinner",
    amount: 90,
    currency: "EUR",
    paidById: "user_3",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 30 },
      { memberId: "user_2", amount: 30 },
      { memberId: "user_3", amount: 30, paid: 90 },
    ],
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    category: "food",
    reactions: { "🍷": ["user_2", "user_current"] },
  },
  // Net group_1: owed €150×2 = €300, owe €20+€30 = €50 → net +€250 owed to you

  // ── Group 2: The Apartment (USD) ───────────────────────────────────────
  // You paid $2400 rent → Sam & Jordan each owe you $800
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
  // Jordan paid $127.50 groceries → you & Sam each owe Jordan $42.50
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
  // Sam paid $90 electricity → you & Jordan each owe Sam $30
  {
    id: "exp_4b",
    groupId: "group_2",
    description: "Electricity Bill",
    amount: 90,
    currency: "USD",
    paidById: "user_3",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 30 },
      { memberId: "user_3", amount: 30, paid: 90 },
      { memberId: "user_4", amount: 30 },
    ],
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    category: "utilities",
  },
  // Net group_2: owed $800+$800=$1600, owe $42.50+$30=$72.50 → net +$1527.50 owed to you

  // ── Group 3: Tokyo Vacation (USD) ──────────────────────────────────────
  // Alex paid $1600 flights → you owe Alex $400
  {
    id: "exp_5",
    groupId: "group_3",
    description: "Round-trip Flights",
    amount: 1600,
    currency: "USD",
    paidById: "user_2",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 400 },
      { memberId: "user_2", amount: 400, paid: 1600 },
      { memberId: "user_4", amount: 400 },
      { memberId: "user_5", amount: 400 },
    ],
    createdAt: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString(),
    category: "transport",
    reactions: { "🙏": ["user_current", "user_4", "user_5"] },
  },
  // You paid $1200 hotel → Alex, Jordan, Emma each owe you $300
  {
    id: "exp_6",
    groupId: "group_3",
    description: "Hotel (4 nights)",
    amount: 1200,
    currency: "USD",
    paidById: "user_current",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 300, paid: 1200 },
      { memberId: "user_2", amount: 300 },
      { memberId: "user_4", amount: 300 },
      { memberId: "user_5", amount: 300 },
    ],
    createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    category: "accommodation",
  },
  // Jordan paid $240 bullet train → you owe Jordan $60
  {
    id: "exp_7",
    groupId: "group_3",
    description: "Bullet Train Pass",
    amount: 240,
    currency: "USD",
    paidById: "user_4",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 60 },
      { memberId: "user_2", amount: 60 },
      { memberId: "user_4", amount: 60, paid: 240 },
      { memberId: "user_5", amount: 60 },
    ],
    createdAt: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString(),
    category: "transport",
  },
  // Emma paid $360 dinner cruise → you owe Emma $90
  {
    id: "exp_8",
    groupId: "group_3",
    description: "Tokyo Dinner Cruise",
    amount: 360,
    currency: "USD",
    paidById: "user_5",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 90 },
      { memberId: "user_2", amount: 90 },
      { memberId: "user_4", amount: 90 },
      { memberId: "user_5", amount: 90, paid: 360 },
    ],
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    category: "food",
  },
  // Net group_3: owed $300×3=$900, owe $400+$60+$90=$550 → net +$350 owed to you

  // ── Group 4: Ski Weekend (USD) — you owe ──────────────────────────────
  // Emma paid $720 cabin → you & Marcus each owe Emma $240
  {
    id: "exp_9",
    groupId: "group_4",
    description: "Cabin Rental",
    amount: 720,
    currency: "USD",
    paidById: "user_5",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 240 },
      { memberId: "user_5", amount: 240, paid: 720 },
      { memberId: "user_6", amount: 240 },
    ],
    createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    category: "accommodation",
    reactions: { "🏔️": ["user_current", "user_6"] },
  },
  // Marcus paid $450 ski passes → you & Emma each owe Marcus $150
  {
    id: "exp_10",
    groupId: "group_4",
    description: "Ski Passes (2 days)",
    amount: 450,
    currency: "USD",
    paidById: "user_6",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 150 },
      { memberId: "user_5", amount: 150 },
      { memberId: "user_6", amount: 150, paid: 450 },
    ],
    createdAt: new Date(Date.now() - 19 * 24 * 60 * 60 * 1000).toISOString(),
    category: "entertainment",
  },
  // You paid $180 groceries → Emma & Marcus each owe you $60
  {
    id: "exp_10b",
    groupId: "group_4",
    description: "Groceries & Meals",
    amount: 180,
    currency: "USD",
    paidById: "user_current",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 60, paid: 180 },
      { memberId: "user_5", amount: 60 },
      { memberId: "user_6", amount: 60 },
    ],
    createdAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
    category: "food",
  },
  // Net group_4: owed $60×2=$120, owe $240+$150=$390 → net -$270 (you owe $270)

  // ── Group 5: Office Lunch Club (USD) ──────────────────────────────────
  // You paid $80 → Sam, Marcus, Priya each owe you $20
  {
    id: "exp_11",
    groupId: "group_5",
    description: "Monday Lunch",
    amount: 80,
    currency: "USD",
    paidById: "user_current",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 20, paid: 80 },
      { memberId: "user_3", amount: 20 },
      { memberId: "user_6", amount: 20 },
      { memberId: "user_7", amount: 20 },
    ],
    createdAt: new Date(Date.now() - 44 * 24 * 60 * 60 * 1000).toISOString(),
    category: "food",
  },
  // Sam paid $100 → you owe Sam $25
  {
    id: "exp_12",
    groupId: "group_5",
    description: "Wednesday Lunch",
    amount: 100,
    currency: "USD",
    paidById: "user_3",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 25 },
      { memberId: "user_3", amount: 25, paid: 100 },
      { memberId: "user_6", amount: 25 },
      { memberId: "user_7", amount: 25 },
    ],
    createdAt: new Date(Date.now() - 43 * 24 * 60 * 60 * 1000).toISOString(),
    category: "food",
  },
  // Marcus paid $88 → you owe Marcus $22
  {
    id: "exp_13",
    groupId: "group_5",
    description: "Friday Lunch",
    amount: 88,
    currency: "USD",
    paidById: "user_6",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 22 },
      { memberId: "user_3", amount: 22 },
      { memberId: "user_6", amount: 22, paid: 88 },
      { memberId: "user_7", amount: 22 },
    ],
    createdAt: new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString(),
    category: "food",
  },
  // You paid $120 team lunch → Sam, Marcus, Priya each owe you $30
  {
    id: "exp_13b",
    groupId: "group_5",
    description: "Team Lunch",
    amount: 120,
    currency: "USD",
    paidById: "user_current",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 30, paid: 120 },
      { memberId: "user_3", amount: 30 },
      { memberId: "user_6", amount: 30 },
      { memberId: "user_7", amount: 30 },
    ],
    createdAt: new Date(Date.now() - 41 * 24 * 60 * 60 * 1000).toISOString(),
    category: "food",
  },
  // Net group_5: owed ($20+$30)×3=$150, owe $25+$22=$47 → net +$103 owed to you

  // ── Group 6: Road Trip (USD) ───────────────────────────────────────────
  // You paid $200 gas → Alex, Sam, Jordan, Emma each owe you $40
  {
    id: "exp_14",
    groupId: "group_6",
    description: "Gas",
    amount: 200,
    currency: "USD",
    paidById: "user_current",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 40, paid: 200 },
      { memberId: "user_2", amount: 40 },
      { memberId: "user_3", amount: 40 },
      { memberId: "user_4", amount: 40 },
      { memberId: "user_5", amount: 40 },
    ],
    createdAt: new Date(Date.now() - 59 * 24 * 60 * 60 * 1000).toISOString(),
    category: "transport",
  },
  // Alex paid $300 hotel → you owe Alex $60
  {
    id: "exp_15",
    groupId: "group_6",
    description: "Hotel Night 1",
    amount: 300,
    currency: "USD",
    paidById: "user_2",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 60 },
      { memberId: "user_2", amount: 60, paid: 300 },
      { memberId: "user_3", amount: 60 },
      { memberId: "user_4", amount: 60 },
      { memberId: "user_5", amount: 60 },
    ],
    createdAt: new Date(Date.now() - 58 * 24 * 60 * 60 * 1000).toISOString(),
    category: "accommodation",
  },
  // Jordan paid $250 hotel → you owe Jordan $50
  {
    id: "exp_16",
    groupId: "group_6",
    description: "Hotel Night 2",
    amount: 250,
    currency: "USD",
    paidById: "user_4",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 50 },
      { memberId: "user_2", amount: 50 },
      { memberId: "user_3", amount: 50 },
      { memberId: "user_4", amount: 50, paid: 250 },
      { memberId: "user_5", amount: 50 },
    ],
    createdAt: new Date(Date.now() - 57 * 24 * 60 * 60 * 1000).toISOString(),
    category: "accommodation",
  },
  // Sam paid $150 food → you owe Sam $30
  {
    id: "exp_17",
    groupId: "group_6",
    description: "Food & Snacks",
    amount: 150,
    currency: "USD",
    paidById: "user_3",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 30 },
      { memberId: "user_2", amount: 30 },
      { memberId: "user_3", amount: 30, paid: 150 },
      { memberId: "user_4", amount: 30 },
      { memberId: "user_5", amount: 30 },
    ],
    createdAt: new Date(Date.now() - 56 * 24 * 60 * 60 * 1000).toISOString(),
    category: "food",
  },
  // Net group_6: owed $40×4=$160, owe $60+$50+$30=$140 → net +$20 owed to you

  // ── Group 7: Book Club (USD) — you owe slightly ────────────────────────
  // Marcus paid $90 books → you & Priya each owe Marcus $30
  {
    id: "exp_18",
    groupId: "group_7",
    description: "Book Bundle",
    amount: 90,
    currency: "USD",
    paidById: "user_6",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 30 },
      { memberId: "user_6", amount: 30, paid: 90 },
      { memberId: "user_7", amount: 30 },
    ],
    createdAt: new Date(Date.now() - 89 * 24 * 60 * 60 * 1000).toISOString(),
    category: "other",
  },
  // You paid $60 venue → Marcus & Priya each owe you $20
  {
    id: "exp_19",
    groupId: "group_7",
    description: "Venue Hire",
    amount: 60,
    currency: "USD",
    paidById: "user_current",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 20, paid: 60 },
      { memberId: "user_6", amount: 20 },
      { memberId: "user_7", amount: 20 },
    ],
    createdAt: new Date(Date.now() - 88 * 24 * 60 * 60 * 1000).toISOString(),
    category: "other",
  },
  // Priya paid $45 snacks → you & Marcus each owe Priya $15
  {
    id: "exp_20",
    groupId: "group_7",
    description: "Snacks & Drinks",
    amount: 45,
    currency: "USD",
    paidById: "user_7",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 15 },
      { memberId: "user_6", amount: 15 },
      { memberId: "user_7", amount: 15, paid: 45 },
    ],
    createdAt: new Date(Date.now() - 87 * 24 * 60 * 60 * 1000).toISOString(),
    category: "food",
  },
  // Net group_7: owed $20×2=$40, owe $30+$15=$45 → net -$5 (you owe $5)

  // ── Group 8: Music Festival (EUR) ─────────────────────────────────────
  // You paid €800 tickets → Alex, Emma, Priya each owe you €200
  {
    id: "exp_21",
    groupId: "group_8",
    description: "Festival Tickets",
    amount: 800,
    currency: "EUR",
    paidById: "user_current",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 200, paid: 800 },
      { memberId: "user_2", amount: 200 },
      { memberId: "user_5", amount: 200 },
      { memberId: "user_7", amount: 200 },
    ],
    createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
    category: "entertainment",
    reactions: { "🎵": ["user_2", "user_5", "user_7"] },
  },
  // Alex paid €240 camping gear → you owe Alex €60
  {
    id: "exp_22",
    groupId: "group_8",
    description: "Camping Gear",
    amount: 240,
    currency: "EUR",
    paidById: "user_2",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 60 },
      { memberId: "user_2", amount: 60, paid: 240 },
      { memberId: "user_5", amount: 60 },
      { memberId: "user_7", amount: 60 },
    ],
    createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    category: "other",
  },
  // Emma paid €160 food → you owe Emma €40
  {
    id: "exp_23",
    groupId: "group_8",
    description: "Food & Drinks",
    amount: 160,
    currency: "EUR",
    paidById: "user_5",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 40 },
      { memberId: "user_2", amount: 40 },
      { memberId: "user_5", amount: 40, paid: 160 },
      { memberId: "user_7", amount: 40 },
    ],
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    category: "food",
  },
  // Net group_8: owed €200×3=€600, owe €60+€40=€100 → net +€500 owed to you

  // ── Group 9: Gym Squad (USD) — you owe ────────────────────────────────
  // Sam paid $150 monthly fee → you & Jordan each owe Sam $50
  {
    id: "exp_24",
    groupId: "group_9",
    description: "Monthly Membership",
    amount: 150,
    currency: "USD",
    paidById: "user_3",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 50 },
      { memberId: "user_3", amount: 50, paid: 150 },
      { memberId: "user_4", amount: 50 },
    ],
    createdAt: new Date(Date.now() - 49 * 24 * 60 * 60 * 1000).toISOString(),
    category: "other",
  },
  // Jordan paid $30 guest pass → you & Sam each owe Jordan $10
  {
    id: "exp_25",
    groupId: "group_9",
    description: "Guest Day Pass",
    amount: 30,
    currency: "USD",
    paidById: "user_4",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 10 },
      { memberId: "user_3", amount: 10 },
      { memberId: "user_4", amount: 10, paid: 30 },
    ],
    createdAt: new Date(Date.now() - 48 * 24 * 60 * 60 * 1000).toISOString(),
    category: "other",
  },
  // You paid $60 protein shakes → Sam & Jordan each owe you $20
  {
    id: "exp_25b",
    groupId: "group_9",
    description: "Protein Shakes",
    amount: 60,
    currency: "USD",
    paidById: "user_current",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 20, paid: 60 },
      { memberId: "user_3", amount: 20 },
      { memberId: "user_4", amount: 20 },
    ],
    createdAt: new Date(Date.now() - 47 * 24 * 60 * 60 * 1000).toISOString(),
    category: "food",
  },
  // Net group_9: owed $20×2=$40, owe $50+$10=$60 → net -$20 (you owe $20)

  // ── Group 10: Birthday Dinner (USD) ───────────────────────────────────
  // You paid $360 dinner → Alex, Sam, Jordan, Emma, Marcus each owe you $60
  {
    id: "exp_26",
    groupId: "group_10",
    description: "Restaurant Dinner",
    amount: 360,
    currency: "USD",
    paidById: "user_current",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 60, paid: 360 },
      { memberId: "user_2", amount: 60 },
      { memberId: "user_3", amount: 60 },
      { memberId: "user_4", amount: 60 },
      { memberId: "user_5", amount: 60 },
      { memberId: "user_6", amount: 60 },
    ],
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    category: "food",
    reactions: { "🎉": ["user_2", "user_3", "user_4", "user_5", "user_6"] },
  },
  // Alex paid $120 cake → you owe Alex $20
  {
    id: "exp_27",
    groupId: "group_10",
    description: "Birthday Cake",
    amount: 120,
    currency: "USD",
    paidById: "user_2",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 20 },
      { memberId: "user_2", amount: 20, paid: 120 },
      { memberId: "user_3", amount: 20 },
      { memberId: "user_4", amount: 20 },
      { memberId: "user_5", amount: 20 },
      { memberId: "user_6", amount: 20 },
    ],
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    category: "food",
  },
  // Emma paid $180 venue → you owe Emma $30
  {
    id: "exp_28",
    groupId: "group_10",
    description: "Private Dining Room",
    amount: 180,
    currency: "USD",
    paidById: "user_5",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 30 },
      { memberId: "user_2", amount: 30 },
      { memberId: "user_3", amount: 30 },
      { memberId: "user_4", amount: 30 },
      { memberId: "user_5", amount: 30, paid: 180 },
      { memberId: "user_6", amount: 30 },
    ],
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    category: "other",
  },
  // Sam paid $60 decorations → you owe Sam $10
  {
    id: "exp_29",
    groupId: "group_10",
    description: "Decorations",
    amount: 60,
    currency: "USD",
    paidById: "user_3",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 10 },
      { memberId: "user_2", amount: 10 },
      { memberId: "user_3", amount: 10, paid: 60 },
      { memberId: "user_4", amount: 10 },
      { memberId: "user_5", amount: 10 },
      { memberId: "user_6", amount: 10 },
    ],
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    category: "other",
  },
  // Net group_10: owed $60×5=$300, owe $20+$30+$10=$60 → net +$240 owed to you
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

const defaultGroupMessages: GroupMessage[] = [
  {
    id: "msg_1",
    groupId: "group_1",
    memberId: "user_2",
    text: "Hey, should we book dinner for tonight?",
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "msg_2",
    groupId: "group_1",
    memberId: "user_current",
    text: "Yes! I found a great tapas place 🍷",
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
];

function rawPairwiseDebts(groupExpenses: Expense[], groupSettlements: Settlement[], memberIds: string[]): DebtRelation[] {
  // net[A][B] = amount A is owed by B (positive = A is creditor vs B)
  const net: Record<string, Record<string, number>> = {};

  function adjust(creditor: string, debtor: string, amount: number) {
    if (!net[creditor]) net[creditor] = {};
    if (!net[debtor]) net[debtor] = {};
    net[creditor][debtor] = (net[creditor][debtor] ?? 0) + amount;
    net[debtor][creditor] = (net[debtor][creditor] ?? 0) - amount;
  }

  groupExpenses.forEach(expense => {
    const payer = expense.paidById;
    if (!memberIds.includes(payer)) return;
    expense.splits.forEach(split => {
      if (split.memberId === payer || !memberIds.includes(split.memberId)) return;
      adjust(payer, split.memberId, split.amount);
    });
  });

  // A settlement where fromId pays toId reduces toId's credit against fromId
  groupSettlements.forEach(s => {
    if (!memberIds.includes(s.fromId) || !memberIds.includes(s.toId)) return;
    adjust(s.toId, s.fromId, -s.amount);
  });

  const result: DebtRelation[] = [];
  const seen = new Set<string>();
  Object.keys(net).forEach(a => {
    Object.keys(net[a]).forEach(b => {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) return;
      seen.add(key);
      const amount = net[a][b]; // positive = a is owed by b
      if (amount > 0.005) {
        result.push({ fromId: b, toId: a, amount: Math.round(amount * 100) / 100 });
      } else if (amount < -0.005) {
        result.push({ fromId: a, toId: b, amount: Math.round(-amount * 100) / 100 });
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
const CUSTOM_CATS_KEY = "@spliteasy_custom_cats";
const NOTIF_KEY = "@spliteasy_notifs";
const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  expenseAdded: true,
  expenseEdited: true,
  expenseDeleted: true,
  settlement: true,
  invite: true,
  comment: true,
  reaction: true,
};

function buildNudgeMessage(
  groupName: string,
  pendingCount: number,
  nudgeNum: number,
  tone: NudgeTone
): { title: string; body: string } {
  const bal = `${pendingCount} balance${pendingCount > 1 ? "s" : ""}`;
  if (tone === "friendly") {
    return {
      title: `👋 Time to settle up — ${groupName}`,
      body: `${bal} in ${groupName} ${pendingCount > 1 ? "are" : "is"} still open. Wrap it up! 💸`,
    };
  }
  if (tone === "urgent") {
    return {
      title: `🚨 Nudge #${nudgeNum}: ${groupName} still open`,
      body: `${bal} ${pendingCount > 1 ? "remain" : "remains"} unsettled in ${groupName}. Time to close the books!`,
    };
  }
  // firm (default)
  return {
    title: `⏰ Reminder #${nudgeNum} — ${groupName}`,
    body: `${bal} in ${groupName} haven't been settled yet. Don't leave your friends waiting.`,
  };
}

const defaultRecurringExpenses: RecurringExpense[] = [
  {
    id: "rec_1",
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
    category: "utilities",
    frequency: "monthly",
    timeOfDay: "09:00",
    endType: "never",
    occurrenceCount: 1,
    nextDueAt: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
    isActive: true,
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "rec_2",
    groupId: "group_2",
    description: "Internet Bill",
    amount: 60,
    currency: "USD",
    paidById: "user_3",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 20 },
      { memberId: "user_3", amount: 20, paid: 60 },
      { memberId: "user_4", amount: 20 },
    ],
    category: "utilities",
    frequency: "monthly",
    timeOfDay: "09:00",
    endType: "never",
    occurrenceCount: 1,
    nextDueAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    isActive: true,
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "rec_3",
    groupId: "group_5",
    description: "Weekly Lunch",
    amount: 80,
    currency: "USD",
    paidById: "user_current",
    splitType: "equal",
    splits: [
      { memberId: "user_current", amount: 20, paid: 80 },
      { memberId: "user_3", amount: 20 },
      { memberId: "user_6", amount: 20 },
      { memberId: "user_7", amount: 20 },
    ],
    category: "food",
    frequency: "weekly",
    dayOfWeek: 1,
    timeOfDay: "12:00",
    endType: "never",
    occurrenceCount: 4,
    nextDueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    isActive: false,
    createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();
  const [currentUser, setCurrentUser] = useState<Member>(defaultCurrentUser);
  const [members, setMembers] = useState<Member[]>(defaultMembers);
  const [groups, setGroups] = useState<Group[]>(defaultGroups);
  const [expenses, setExpenses] = useState<Expense[]>(defaultExpenses);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [invitations, setInvitations] = useState<GroupInvitation[]>(defaultInvitations);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>(defaultGroupMessages);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [simplifyDebtsEnabled, setSimplifyDebtsEnabled] = useState(true);
  const [defaultCurrency, setDefaultCurrencyState] = useState<Currency>("USD");
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({});
  const [ratesUpdated, setRatesUpdated] = useState<string | null>(null);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>(DEFAULT_NOTIF_PREFS);

  // Lock: prevents background task and foreground check from running concurrently.
  const recurringLockRef = useRef(false);

  useEffect(() => {
    loadData();
  }, []);

  const genId = () =>
    Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

  /**
   * Reload only the recurring-related storage slices (expenses, recurring
   * schedule, notifications) into React state. Called after
   * processOverdueRecurring() writes its results to AsyncStorage so that
   * the in-memory state never diverges from the canonical storage copy.
   */
  const reloadRecurringSlices = async () => {
    try {
      const [mainRaw, recurringRaw, notifsRaw] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(RECURRING_KEY),
        AsyncStorage.getItem(NOTIFICATIONS_KEY),
      ]);
      if (mainRaw) {
        const data = JSON.parse(mainRaw);
        if (data.expenses) setExpenses(data.expenses);
      }
      if (recurringRaw) setRecurringExpenses(JSON.parse(recurringRaw));
      if (notifsRaw) setNotifications(JSON.parse(notifsRaw));
    } catch {}
  };

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

      const customCatsStored = await AsyncStorage.getItem(CUSTOM_CATS_KEY);
      if (customCatsStored) setCustomCategories(JSON.parse(customCatsStored));

      const notifStored = await AsyncStorage.getItem(NOTIF_KEY);
      if (notifStored) {
        try { setNotifPrefs({ ...DEFAULT_NOTIF_PREFS, ...JSON.parse(notifStored) }); } catch {}
      }

      const messagesStored = await AsyncStorage.getItem(MESSAGES_KEY);
      if (messagesStored) {
        const msgs = JSON.parse(messagesStored);
        setGroupMessages(msgs.length > 0 ? msgs : defaultGroupMessages);
      }

      const recurringStored = await AsyncStorage.getItem(RECURRING_KEY);
      if (recurringStored) {
        setRecurringExpenses(JSON.parse(recurringStored));
      } else {
        // Seed default recurring expenses for demo
        const seeded = defaultRecurringExpenses;
        setRecurringExpenses(seeded);
        try { await AsyncStorage.setItem(RECURRING_KEY, JSON.stringify(seeded)); } catch {}
      }

      const appNotifsStored = await AsyncStorage.getItem(NOTIFICATIONS_KEY);
      if (appNotifsStored) setNotifications(JSON.parse(appNotifsStored));

      // Cold-launch check: process any recurrences that fired while the app
      // was closed and background fetch was unavailable or not yet scheduled.
      // We run this after the initial state load so storage is fresh.
      if (!recurringLockRef.current) {
        recurringLockRef.current = true;
        try {
          const added = await processOverdueRecurring();
          if (added > 0) await reloadRecurringSlices();
        } finally {
          recurringLockRef.current = false;
        }
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

  const saveMessages = useCallback(async (msgs: GroupMessage[]) => {
    try { await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(msgs)); } catch {}
  }, []);

  const saveRecurring = useCallback(async (items: RecurringExpense[]) => {
    try { await AsyncStorage.setItem(RECURRING_KEY, JSON.stringify(items)); } catch {}
  }, []);

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

  const updateMember = useCallback(
    (id: string, updates: Partial<Omit<Member, "id">>) => {
      const updated = members.map(m => (m.id === id ? { ...m, ...updates } : m));
      setMembers(updated);
      if (id === currentUser.id) setCurrentUser(prev => ({ ...prev, ...updates }));
      saveData(updated, groups, expenses, settlements, invitations);
    },
    [currentUser.id, members, groups, expenses, settlements, invitations, saveData]
  );

  const removeMember = useCallback(
    (id: string) => {
      const updated = members.filter(m => m.id !== id);
      setMembers(updated);
      saveData(updated, groups, expenses, settlements, invitations);
    },
    [members, groups, expenses, settlements, invitations, saveData]
  );

  const addMember = useCallback(
    (member: Omit<Member, "id">) => {
      const idx = members.filter(m => !m.isCurrentUser).length;
      const newMember: Member = {
        ...member,
        id: genId(),
        avatarColor: member.avatarColor || DEFAULT_AVATAR_COLORS[idx % DEFAULT_AVATAR_COLORS.length],
        joinedAt: member.joinedAt ?? new Date().toISOString(),
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
        adminIds: group.adminIds ?? [currentUser.id],
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

  const archiveGroup = useCallback(
    (id: string) => {
      const updated = groups.map(g =>
        g.id === id ? { ...g, isArchived: true, archivedAt: new Date().toISOString() } : g
      );
      setGroups(updated);
      saveData(members, updated, expenses, settlements, invitations);
      showToast("Group archived", "info");
    },
    [members, groups, expenses, settlements, invitations, saveData, showToast]
  );

  const unarchiveGroup = useCallback(
    (id: string) => {
      const updated = groups.map(g =>
        g.id === id ? { ...g, isArchived: false, archivedAt: undefined } : g
      );
      setGroups(updated);
      saveData(members, updated, expenses, settlements, invitations);
      showToast("Group restored", "success");
    },
    [members, groups, expenses, settlements, invitations, saveData, showToast]
  );

  const endGroup = useCallback(
    (id: string) => {
      const updated = groups.map(g =>
        g.id === id ? { ...g, isEnded: true, endedAt: new Date().toISOString() } : g
      );
      setGroups(updated);
      saveData(members, updated, expenses, settlements, invitations);
      showToast("Group period ended", "info");
    },
    [members, groups, expenses, settlements, invitations, saveData, showToast]
  );

  const assignAdmin = useCallback(
    (groupId: string, memberId: string) => {
      const updated = groups.map(g =>
        g.id === groupId
          ? { ...g, adminIds: [...new Set([...(g.adminIds ?? []), memberId])] }
          : g
      );
      setGroups(updated);
      saveData(members, updated, expenses, settlements, invitations);
      showToast("Admin assigned", "success");
    },
    [members, groups, expenses, settlements, invitations, saveData, showToast]
  );

  const removeAdmin = useCallback(
    (groupId: string, memberId: string) => {
      const updated = groups.map(g =>
        g.id === groupId
          ? { ...g, adminIds: (g.adminIds ?? []).filter(id => id !== memberId) }
          : g
      );
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

  const addCustomCategory = useCallback((name: string) => {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) return;
    setCustomCategories(prev => {
      if (prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      AsyncStorage.setItem(CUSTOM_CATS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const updateNotifPref = useCallback((key: keyof NotifPrefs, value: boolean) => {
    setNotifPrefs(prev => {
      const next = { ...prev, [key]: value };
      AsyncStorage.setItem(NOTIF_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const addExpense = useCallback(
    (expense: Omit<Expense, "id" | "createdAt">) => {
      const now = new Date().toISOString();
      const creatorId = expense.addedBy ?? currentUser.id;
      const auditEntry: AuditEntry = {
        id: genId(),
        action: "created",
        changedBy: creatorId,
        changedAt: now,
      };
      const newExpense: Expense = {
        ...expense,
        id: genId(),
        createdAt: now,
        addedBy: creatorId,
        auditLog: [auditEntry],
      };
      const updated = [newExpense, ...expenses];
      setExpenses(updated);
      saveData(members, groups, updated, settlements, invitations);
      if (notifPrefs.expenseAdded) {
        showToast(`"${expense.description}" added to group`, "success");
      }
    },
    [members, groups, expenses, settlements, invitations, saveData, notifPrefs, showToast, currentUser.id]
  );

  const updateExpense = useCallback(
    (id: string, updates: Partial<Expense>) => {
      const prev = expenses.find(e => e.id === id);
      const isRealEdit = !updates.reactions && !updates.comments;
      let updatedExpenses: Expense[];
      if (isRealEdit && prev) {
        const trackedFields: (keyof Expense)[] = ["description", "amount", "paidById", "splitType", "category", "notes"];
        const fieldChanges: AuditEntry["fieldChanges"] = [];
        trackedFields.forEach(field => {
          const oldVal = String(prev[field] ?? "");
          const newVal = updates[field] !== undefined ? String(updates[field] ?? "") : oldVal;
          if (updates[field] !== undefined && oldVal !== newVal) {
            fieldChanges.push({ field, oldValue: oldVal, newValue: newVal });
          }
        });
        const auditEntry: AuditEntry = {
          id: genId(),
          action: "updated",
          changedBy: currentUser.id,
          changedAt: new Date().toISOString(),
          ...(fieldChanges.length > 0 ? { fieldChanges } : {}),
        };
        updatedExpenses = expenses.map(e =>
          e.id === id
            ? { ...e, ...updates, auditLog: [...(e.auditLog ?? []), auditEntry] }
            : e
        );
      } else {
        updatedExpenses = expenses.map(e => (e.id === id ? { ...e, ...updates } : e));
      }
      setExpenses(updatedExpenses);
      saveData(members, groups, updatedExpenses, settlements, invitations);
      if (notifPrefs.expenseEdited && prev && isRealEdit) {
        showToast(`"${prev.description}" was updated`, "info");
      }
    },
    [members, groups, expenses, settlements, invitations, saveData, notifPrefs, showToast, currentUser.id]
  );

  const deleteExpense = useCallback(
    (id: string) => {
      const target = expenses.find(e => e.id === id);
      const updated = expenses.filter(e => e.id !== id);
      setExpenses(updated);
      saveData(members, groups, updated, settlements, invitations);
      if (notifPrefs.expenseDeleted && target) {
        showToast(`"${target.description}" deleted`, "warning");
      }
    },
    [members, groups, expenses, settlements, invitations, saveData, notifPrefs, showToast]
  );

  const addExpenseComment = useCallback(
    (expenseId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const newComment: ExpenseComment = {
        id: genId(),
        memberId: currentUser.id,
        text: trimmed,
        createdAt: new Date().toISOString(),
      };
      const updated = expenses.map(e =>
        e.id === expenseId
          ? { ...e, comments: [...(e.comments ?? []), newComment] }
          : e
      );
      setExpenses(updated);
      saveData(members, groups, updated, settlements, invitations);
      if (notifPrefs.comment) {
        showToast("Comment added", "success");
      }
    },
    [currentUser.id, members, groups, expenses, settlements, invitations, saveData, notifPrefs, showToast]
  );

  const toggleReaction = useCallback(
    (expenseId: string, emoji: string) => {
      let isAdding = false;
      const updated = expenses.map(e => {
        if (e.id !== expenseId) return e;
        const reactions = { ...(e.reactions ?? {}) };
        const existing = reactions[emoji] ?? [];
        if (existing.includes(currentUser.id)) {
          const next = existing.filter(id => id !== currentUser.id);
          if (next.length === 0) delete reactions[emoji];
          else reactions[emoji] = next;
          isAdding = false;
        } else {
          reactions[emoji] = [...existing, currentUser.id];
          isAdding = true;
        }
        return { ...e, reactions };
      });
      setExpenses(updated);
      saveData(members, groups, updated, settlements, invitations);
      if (notifPrefs.reaction && isAdding) {
        showToast(`${emoji} reaction added`, "success");
      }
    },
    [currentUser.id, members, groups, expenses, settlements, invitations, saveData, notifPrefs, showToast]
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
      if (notifPrefs.settlement) {
        showToast("Settlement recorded ✓", "success");
      }
    },
    [members, groups, expenses, settlements, invitations, saveData, notifPrefs, showToast]
  );

  const addSettlements = useCallback(
    (newSettlements: Omit<Settlement, "id" | "createdAt">[]) => {
      if (newSettlements.length === 0) return;
      const now = new Date().toISOString();
      const created: Settlement[] = newSettlements.map(s => ({
        ...s,
        id: genId(),
        createdAt: now,
      }));
      const updated = [...created, ...settlements];
      setSettlements(updated);
      saveData(members, groups, expenses, updated, invitations);
      if (notifPrefs.settlement) {
        showToast(`${created.length} settlement${created.length > 1 ? "s" : ""} recorded ✓`, "success");
      }
    },
    [members, groups, expenses, settlements, invitations, saveData, notifPrefs, showToast]
  );

  const deleteSettlement = useCallback(
    (id: string) => {
      const target = settlements.find(s => s.id === id);
      const updated = settlements.filter(s => s.id !== id);
      setSettlements(updated);
      saveData(members, groups, expenses, updated, invitations);
      if (target) showToast("Settlement removed", "warning");
    },
    [members, groups, expenses, settlements, invitations, saveData, showToast]
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
    () => invitations.filter(i => i.invitedMemberId === CURRENT_USER_ID && i.status === "pending"),
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

  const addGroupMessage = useCallback(
    (groupId: string, text: string): GroupMessage => {
      const msg: GroupMessage = {
        id: genId(),
        groupId,
        memberId: currentUser.id,
        text: text.trim(),
        createdAt: new Date().toISOString(),
      };
      const updated = [...groupMessages, msg];
      setGroupMessages(updated);
      saveMessages(updated);
      return msg;
    },
    [currentUser.id, groupMessages, saveMessages]
  );

  const getGroupMessages = useCallback(
    (groupId: string) => groupMessages.filter(m => m.groupId === groupId),
    [groupMessages]
  );

  const addRecurringExpense = useCallback(
    (r: Omit<RecurringExpense, "id" | "createdAt">): RecurringExpense => {
      const newR: RecurringExpense = { ...r, id: genId(), createdAt: new Date().toISOString() };
      const updated = [...recurringExpenses, newR];
      setRecurringExpenses(updated);
      saveRecurring(updated);
      showToast(`Recurring "${r.description}" set up ✓`, "success");
      return newR;
    },
    [recurringExpenses, saveRecurring, showToast]
  );

  const updateRecurringExpense = useCallback(
    (id: string, updates: Partial<RecurringExpense>) => {
      const updated = recurringExpenses.map(r => r.id === id ? { ...r, ...updates } : r);
      setRecurringExpenses(updated);
      saveRecurring(updated);
    },
    [recurringExpenses, saveRecurring]
  );

  const deleteRecurringExpense = useCallback(
    (id: string) => {
      const updated = recurringExpenses.filter(r => r.id !== id);
      setRecurringExpenses(updated);
      saveRecurring(updated);
    },
    [recurringExpenses, saveRecurring]
  );

  const saveNotifications = useCallback(async (notifs: AppNotification[]) => {
    try { await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifs)); } catch {}
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications(prev => {
      const updated = prev.map(n => ({ ...n, read: true }));
      saveNotifications(updated);
      return updated;
    });
  }, [saveNotifications]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => {
      const updated = prev.filter(n => n.id !== id);
      saveNotifications(updated);
      return updated;
    });
  }, [saveNotifications]);

  const unreadNotificationCount = notifications.filter(n => !n.read).length;

  const checkAndAddRecurring = useCallback((): number => {
    const now = new Date();
    let added = 0;
    let updatedRecurring = [...recurringExpenses];
    let updatedExpenses = [...expenses];

    recurringExpenses.forEach(r => {
      if (!r.isActive) return;
      const due = new Date(r.nextDueAt);
      if (due > now) return;

      // Check end conditions before firing
      const newCount = (r.occurrenceCount ?? 0) + 1;
      if (r.endType === "count" && r.endCount !== undefined && (r.occurrenceCount ?? 0) >= r.endCount) {
        updatedRecurring = updatedRecurring.map(rec => rec.id === r.id ? { ...rec, isActive: false } : rec);
        return;
      }
      if (r.endType === "date" && r.endDate && due > new Date(r.endDate + "T23:59:59")) {
        updatedRecurring = updatedRecurring.map(rec => rec.id === r.id ? { ...rec, isActive: false } : rec);
        return;
      }

      const newExpense: Expense = {
        id: genId(),
        groupId: r.groupId,
        description: r.description,
        amount: r.amount,
        currency: r.currency,
        paidById: r.paidById,
        splitType: r.splitType,
        splits: r.splits,
        category: r.category,
        createdAt: now.toISOString(),
        addedBy: CURRENT_USER_ID,
      };
      updatedExpenses = [newExpense, ...updatedExpenses];

      const intervalDays = r.frequency === "custom" && r.customDays
        ? r.customDays
        : RECURRING_FREQUENCY_DAYS[r.frequency];
      const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
      let nextDue = new Date(r.nextDueAt);
      while (nextDue <= now) nextDue = new Date(nextDue.getTime() + intervalMs);

      // Snap to dayOfWeek if set
      if (r.dayOfWeek !== undefined && (r.frequency === "weekly" || r.frequency === "biweekly")) {
        const diff = (r.dayOfWeek - nextDue.getDay() + 7) % 7;
        if (diff > 0) nextDue = new Date(nextDue.getTime() + diff * 24 * 60 * 60 * 1000);
      }

      // Apply timeOfDay if set
      if (r.timeOfDay) {
        const [h, m] = r.timeOfDay.split(":").map(Number);
        nextDue.setHours(h, m, 0, 0);
      }

      // Deactivate if this was the last allowed occurrence
      const shouldDeactivate =
        (r.endType === "count" && r.endCount !== undefined && newCount >= r.endCount) ||
        (r.endType === "date" && r.endDate && nextDue > new Date(r.endDate + "T23:59:59"));

      updatedRecurring = updatedRecurring.map(rec =>
        rec.id === r.id
          ? { ...rec, nextDueAt: nextDue.toISOString(), occurrenceCount: newCount, isActive: !shouldDeactivate }
          : rec
      );
      added++;
    });

    if (added > 0) {
      setExpenses(updatedExpenses);
      setRecurringExpenses(updatedRecurring);
      saveData(members, groups, updatedExpenses, settlements, invitations);
      saveRecurring(updatedRecurring);
      showToast(`${added} recurring expense${added > 1 ? "s" : ""} added`, "success");
    }

    return added;
  }, [recurringExpenses, expenses, members, groups, settlements, invitations, saveData, saveRecurring, showToast]);

  const checkAndSendGroupReminders = useCallback(() => {
    const now = new Date();
    const newNotifs: AppNotification[] = [];
    let updatedGroups = [...groups];

    groups.forEach(g => {
      const campaign = g.nudgeCampaign;
      if (!campaign?.isActive || !g.endDate) return;
      if (campaign.nudgesSent >= campaign.maxNudges) return;

      const endDate = new Date(g.endDate + "T23:59:59");
      const startNudge = new Date(endDate.getTime() + campaign.startDaysAfterEnd * 24 * 60 * 60 * 1000);
      if (now < startNudge) return;

      const lastNudge = campaign.lastNudgeAt ? new Date(campaign.lastNudgeAt) : null;
      const nextNudge = lastNudge
        ? new Date(lastNudge.getTime() + campaign.frequencyDays * 24 * 60 * 60 * 1000)
        : startNudge;
      if (now < nextNudge) return;

      const debts = getGroupBalances(g.id);
      if (debts.length === 0) {
        // All settled — deactivate campaign
        updatedGroups = updatedGroups.map(gr =>
          gr.id === g.id ? { ...gr, nudgeCampaign: { ...campaign, isActive: false } } : gr
        );
        return;
      }

      const nudgeNum = campaign.nudgesSent + 1;
      const { title, body } = buildNudgeMessage(g.name, debts.length, nudgeNum, campaign.tone);
      newNotifs.push({
        id: genId(),
        type: "settlement_reminder",
        groupId: g.id,
        title,
        body,
        createdAt: now.toISOString(),
        read: false,
        tone: campaign.tone,
      });

      updatedGroups = updatedGroups.map(gr =>
        gr.id === g.id
          ? { ...gr, nudgeCampaign: { ...campaign, nudgesSent: nudgeNum, lastNudgeAt: now.toISOString() } }
          : gr
      );
    });

    if (newNotifs.length > 0) {
      setNotifications(prev => {
        const updated = [...newNotifs, ...prev];
        saveNotifications(updated);
        return updated;
      });
      setGroups(updatedGroups);
      saveData(members, updatedGroups, expenses, settlements, invitations);
      showToast(`${newNotifs.length} settlement nudge${newNotifs.length > 1 ? "s" : ""} sent`, "info");
    }
  }, [groups, members, expenses, settlements, invitations, getGroupBalances, saveData, saveNotifications, showToast]);

  // ── Foreground-resume: storage-based recurring check ───────────────────
  // Runs processOverdueRecurring() (AsyncStorage, no React state) so that
  // results from a prior background-task write are never re-processed by the
  // stale in-memory checkAndAddRecurring(). A lock prevents concurrent runs
  // between background task and foreground resume.
  const showToastRef = useRef(showToast);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      if (prev.match(/inactive|background/) && nextState === "active") {
        if (recurringLockRef.current) return;
        recurringLockRef.current = true;
        try {
          const added = await processOverdueRecurring();
          if (added > 0) {
            await reloadRecurringSlices();
            showToastRef.current(
              `${added} recurring expense${added > 1 ? "s" : ""} added`,
              "success"
            );
          }
        } finally {
          recurringLockRef.current = false;
        }
      }
    });
    return () => sub.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        updateMember,
        currentUser,
        members,
        groups,
        expenses,
        settlements,
        invitations,
        simplifyDebtsEnabled,
        toggleSimplifyDebts,
        customCategories,
        addCustomCategory,
        notifPrefs,
        updateNotifPref,
        addMember,
        removeMember,
        addGroup,
        updateGroup,
        archiveGroup,
        unarchiveGroup,
        endGroup,
        assignAdmin,
        removeAdmin,
        deleteGroup,
        addExpense,
        updateExpense,
        deleteExpense,
        addExpenseComment,
        toggleReaction,
        addSettlement,
        addSettlements,
        deleteSettlement,
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
        groupMessages,
        addGroupMessage,
        getGroupMessages,
        recurringExpenses,
        addRecurringExpense,
        updateRecurringExpense,
        deleteRecurringExpense,
        checkAndAddRecurring,
        notifications,
        unreadNotificationCount,
        markAllNotificationsRead,
        dismissNotification,
        checkAndSendGroupReminders,
        isLoading,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
