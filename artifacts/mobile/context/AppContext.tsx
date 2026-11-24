import { onPush } from "@/utils/pushEvents";
import { AppState as DPAppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@clerk/expo";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";

// InteractionManager is deprecated in React Native 0.88; a zero-delay timeout does the same job here.
const runAfterInteractions = (task: () => void) => {
  const id = setTimeout(task, 0);
  return { cancel: () => clearTimeout(id) };
};
import * as Notifications from "expo-notifications";
import { useToast } from "@/context/ToastContext";
import { useSoundEffects } from "@/context/SoundEffectsContext";
import {
  api,
  fetchBootstrap,
  importLocalSnapshot,
  newIdempotencyKey,
  toUserMessage,
  type LegacySnapshot,
  recordApiCalls,
  replayApiCall,
  type RecordedOp,
} from "@/services/apiSync";
import {
  defineBackgroundRecurringTask,
  registerBackgroundRecurring,
  unregisterBackgroundRecurring,
} from "@/services/backgroundRecurring";
import {
  dateOnlyInTimeZone,
  nextRecurringInstant,
} from "@/utils/recurring";
import { computeGroupDebts, summarizeMemberGroupBalances } from "@/utils/balanceMath";

// Register the background task handler at module load time so the OS can
// invoke it even when the app is suspended. This must run before first render.
defineBackgroundRecurringTask();

/** All ISO 4217 currencies are valid — the type is kept broad for extensibility. */
import { convertWithRates, sanitizeRates, withFallback } from "@/utils/fx";
import { maybeAskForReview } from "@/utils/reviewPrompt";
import { expenseIdAlias } from "@/utils/expenseAlias";

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
  /** Linked user account id (undefined for guest/placeholder members). */
  userId?: string;
}

export interface SplitDetail {
  memberId: string;
  amount: number;
  percentage?: number;
  paid?: number;
}

export type SplitType = "equal" | "exact" | "percentage" | "shares";

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
  creationSnapshot?: {
    amount: number;
    currency: Currency;
    paidById: string;
    splitType: SplitType;
    splits: SplitDetail[];
  };
}

export interface GroupMessage {
  failed?: boolean;
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
  intervalMonths?: number;
  intervalWeeks?: number;
  intervalDays?: number;
  dayOfWeek?: number;          // 0 = Sun … 6 = Sat; weekly/biweekly only
  timeOfDay?: string;          // "HH:MM" local 24h
  timeZone?: string;           // IANA timezone of the schedule creator
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
  type:
    | "settlement_reminder"
    | "recurring_fired"
    | "expense_added"
    | "expense_edited"
    | "expense_deleted"
    | "settlement_recorded"
    | "settlement_deleted"
    | "member_added"
    | "group_deleted"
    | "group_message"
    | "member_removed"
    | "group_updated"
    | "simplify_debts_changed"
    | "group_archived"
    | "group_ended"
    | "comment_added"
    | "recurring_added"
    | "recurring_updated"
    | "recurring_deleted"
    | "direct_payment_added"
    | "direct_payment_edited"
    | "direct_payment_deleted";
  groupId?: string;
  expenseId?: string;
  settlementId?: string;
  paymentId?: string;
  /** Snapshot of a one-off payment at the moment it was deleted, so the
   *  "one-off removed" notification can still be opened to see what it was. */
  deletedPayment?: DirectPayment;
  /** Snapshots keep deleted activity useful after the source row is removed. */
  deletedExpense?: Expense;
  deletedSettlement?: Settlement;
  deletedById?: string;
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
    intervalMonths?: number;
    intervalWeeks?: number;
    intervalDays?: number;
    dayOfWeek?: number;
    endType?: "never" | "count" | "date";
    endCount?: number;
    endDate?: string;
    occurrenceCount?: number;
    nextDueAt: string;
    timeZone?: string;
  },
  n: number
): Date[] {
  const results: Date[] = [];
  let current = new Date(config.nextDueAt);
  let count = config.occurrenceCount ?? 0;
  while (results.length < n) {
    if (config.endType === "count" && config.endCount !== undefined && count >= config.endCount) break;
    if (
      config.endType === "date" &&
      config.endDate &&
      dateOnlyInTimeZone(current, config.timeZone) > config.endDate
    ) break;
    results.push(new Date(current));
    count++;
    current = new Date(
      nextRecurringInstant(
        current.toISOString(),
        config.frequency,
        config.frequency === "custom" ? config.customDays : undefined,
        config.timeZone,
        {
          months: config.intervalMonths,
          weeks: config.intervalWeeks,
          days: config.intervalDays,
        },
      ),
    );
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
  /** ID of the RecurringExpense that auto-generated this expense, if any. */
  sourceRecurringId?: string;
  /** ID of the receipt session that produced this expense, if any. */
  receiptId?: string;
  /** ISO YYYY-MM-DD calendar date when this expense was paid. */
  paymentDate?: string | null;
  /** Rate locked on the day it happened: units of fxRateCurrency (the group currency) per 1 unit of currency. */
  fxRate?: number | null;
  fxRateCurrency?: string | null;
  /** Receipts with mixed lines: amount per itemisation category. */
  categoryBreakdown?: Record<string, number> | null;
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
  friendRequest: boolean;
    chat: boolean;
  reminders: boolean;
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
  /** Rate locked on the day it happened: units of fxRateCurrency (the group currency) per 1 unit of currency. */
  fxRate?: number | null;
  fxRateCurrency?: string | null;
}

function settlementSoundKey(settlement: Pick<Settlement, "groupId" | "fromId" | "toId" | "amount" | "currency">): string {
  return [
    settlement.groupId,
    settlement.fromId,
    settlement.toId,
    settlement.amount.toFixed(2),
    settlement.currency,
  ].join(":");
}

/** A direct one-off payment between two people, independent of any group. */
/** The whole one-off bill, stored on each person-to-person row it created. */
export interface OneOffBill {
  billId: string;
  total: number;
  paidById: string;
  splitType: SplitType;
  participants: string[];
  /** Each person's share of the total (member id -> amount). */
  shares: Record<string, number>;
  /** What was typed in the form, so editing shows exactly the same thing. */
  inputs?: { exact?: Record<string, string>; pct?: Record<string, string>; shares?: Record<string, string> };
}

export interface DirectPayment {
  billId?: string;
  bill?: OneOffBill;
  id: string;
  fromId: string;  // member who paid
  toId: string;    // member who received
  amount: number;
  currency: Currency;
  /** Required payment reason, mirroring a group expense description. */
  reason: string;
  /** Optional comments entered with the payment. */
  comments?: string;
  /** Legacy field retained only while stored payment data is migrated. */
  note?: string;
  /** Category key from BUILTIN_CATEGORY_CONFIG, e.g. "food", "transport". Defaults to "other". */
  category?: string;
  createdAt: string;
  updatedAt?: string;
  /** Change history, mirroring Expense.auditLog. */
  auditLog?: AuditEntry[];
  /** True for auto-generated settlement records. Absent/false for regular expenses. */
  isSettlement?: boolean;
}

const DIRECT_PAYMENTS_STORAGE_KEY = "@spliteasy_direct_payments";

/**
 * Persisting a full one-off history requires JSON serialization on the JS
 * thread. Defer that work until the current interaction has finished so the
 * edit sheet can close and the keyboard/touch system can respond immediately.
 */
function persistDirectPayments(payments: DirectPayment[]) {
  runAfterInteractions(() => {
    AsyncStorage.setItem(DIRECT_PAYMENTS_STORAGE_KEY, JSON.stringify(payments)).catch(() => {});
  });
}

export interface Group {
  id: string;
  name: string;
  emoji: string;
  memberIds: string[];
  currency: Currency;
  simplifyDebtsEnabled?: boolean;
  createdAt: string;
  type: "trip" | "home" | "friends" | "couple" | "other";
  isArchived?: boolean;
  archivedAt?: string;
  /** Group period ended; ended groups may still have unsettled balances. */
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
  customItemizations?: UserDefinedItemization[];
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
  /** Server-issued acceptance token (present for invitations synced from the API). */
  token?: string;
}

export type UserDefinedItemization = {
  id: string;
  searchTerm: string;
  category: string;
};

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
  refreshFromServer: () => Promise<boolean>;
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
  toggleSimplifyDebts: (groupId: string) => void;
  customCategories: string[];
  addCustomCategory: (name: string) => void;
  notifPrefs: NotifPrefs;
  updateNotifPref: (key: keyof NotifPrefs, value: boolean) => void;
  updateCurrentUser: (updates: Partial<Omit<Member, "id" | "isCurrentUser">>) => void;
  updateMember: (id: string, updates: Partial<Omit<Member, "id">>) => void;
  removeMember: (id: string) => void;
  leaveGroupMember: (groupId: string, memberId: string) => void;
  addMember: (member: Omit<Member, "id">) => Member;
  seedDemoFriends: () => number;
  addGroup: (group: Omit<Group, "id" | "createdAt">) => Group;
  addGroupAsync: (group: Omit<Group, "id" | "createdAt">) => Promise<Group>;
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
  sendAppInvitation: (email: string, name: string) => Promise<boolean>;
  acceptInvitation: (invitationId: string) => void;
  declineInvitation: (invitationId: string) => void;
  getPendingInvitesForCurrentUser: () => GroupInvitation[];
  getGroupPendingInvites: (groupId: string) => GroupInvitation[];
  getGroupBalances: (groupId: string) => DebtRelation[];
  getTotalOwed: () => { youOwe: number; youAreOwed: number; currency: Currency };
  getMemberById: (id: string) => Member | undefined;
  getMemberKeyForGroup: (memberId: string, groupId: string) => string;
  getGroupById: (id: string) => Group | undefined;
  getGroupExpenses: (groupId: string) => Expense[];
  getGroupSettlements: (groupId: string) => Settlement[];
  directPayments: DirectPayment[];
  addDirectPayment: (payment: Omit<DirectPayment, "id" | "createdAt">) => void;
  seedDirectPayments: (count: number) => void;
  updateDirectPayment: (id: string, updates: Partial<Omit<DirectPayment, "id" | "createdAt">>) => void;
  deleteDirectPayment: (id: string, quiet?: boolean) => void;
  groupMessages: GroupMessage[];
  addGroupMessage: (groupId: string, text: string) => GroupMessage;
  getGroupMessages: (groupId: string) => GroupMessage[];
  /** memberId -> ISO timestamp (or null) of the last message that member has read, per group. */
  groupMessageReads: Record<string, Record<string, string | null>>;
  /** Fetch messages + read cursors for a group from the server and merge them in (for cross-device chat + read receipts). */
  syncGroupMessages: (groupId: string) => Promise<void>;
  /** Mark all of the current user's messages as read-up-to-now in this group. */
  markGroupMessagesRead: (groupId: string) => Promise<void>;
  recurringExpenses: RecurringExpense[];
  addRecurringExpense: (r: Omit<RecurringExpense, "id" | "createdAt">) => RecurringExpense;
  updateRecurringExpense: (id: string, updates: Partial<RecurringExpense>) => void;
  deleteRecurringExpense: (id: string) => void;
  checkAndAddRecurring: () => number;
  hasNewActivity: boolean;
  clearNewActivity: () => void;
  notifications: AppNotification[];
  unreadNotificationCount: number;
  sendGroupReminder: (
    groupId: string,
    recipientMemberId: string,
    amount: number,
    currency: string,
  ) => Promise<void>;
  markAllNotificationsRead: (silent?: boolean) => void;
  markNotificationRead: (id: string) => void;
  markNotificationUnread: (id: string) => void;
  dismissNotification: (id: string) => void;
  dismissAllNotifications: () => void;
  checkAndSendGroupReminders: () => void;
  isLoading: boolean;
  /** 'ok' = last sync succeeded; 'error' = last mutation couldn't reach the server */
  syncStatus: 'ok' | 'error';
  /** True while the device cannot reach the server at all. */
  isOffline: boolean;
  /** Clear the sync-error banner (e.g. user dismissed it). */
  clearSyncError: () => void;
  /** Re-attempt a bootstrap refresh so the banner resolves if connectivity returned. */
  retrySync: () => Promise<boolean>;
}

export const CURRENT_USER_ID_EXPORT = "user_current";
const STORAGE_KEY = "spliteasy_data_v3";
const MESSAGES_KEY = "@spliteasy_messages";
const RECURRING_KEY = "@spliteasy_recurring";
const NOTIFICATIONS_KEY = "@spliteasy_notifications";
/** Persistent set of notification IDs the user has explicitly dismissed. */
const DISMISSED_IDS_KEY = "@spliteasy_dismissed_notif_ids";
/**
 * Offline cache of the last server bootstrap snapshot. AsyncStorage is used
 * only as a cache/offline read — the production API is the source of truth.
 */
const SERVER_CACHE_KEY = "@spliteasy_server_cache_v1";
/** Marks that the legacy v3 local snapshot was already migrated via POST /api/imports. */
const MIGRATION_DONE_KEY = "@spliteasy_migrated_v3_to_server";

const DEFAULT_AVATAR_COLORS = [
  "#FF6B35", "#7C3AED", "#0EA5E9", "#F59E0B",
  "#FF3366", "#00C896", "#EC4899", "#0D9488",
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
  { id: "user_6", name: "Marcus Taylor", email: "marcus@example.com", avatarColor: "#0D9488" },
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

/** Ids of the seeded demo groups shipped with the app. */
const DEMO_GROUP_IDS = new Set([
  "group_1", "group_2", "group_3", "group_4", "group_5",
  "group_6", "group_7", "group_8", "group_9", "group_10",
]);

/**
 * Heuristic that distinguishes a user's real stored data from the seeded demo
 * defaults. We only migrate snapshots that contain at least one group the user
 * created (i.e. a group id outside the known demo set). This guarantees the
 * demo defaults are never auto-imported to the server.
 */
function isRealUserSnapshot(snapshot: LegacySnapshot): boolean {
  const groups = snapshot.groups ?? [];
  if (groups.length === 0) return false;
  return groups.some(g => !DEMO_GROUP_IDS.has(g.id));
}

export function getExpensePaidAmounts(expense: Expense): Record<string, number> {
  const explicitPaid = expense.splits
    .filter((split) => split.paid != null && split.paid > 0)
    .reduce<Record<string, number>>((amounts, split) => {
      amounts[split.memberId] = (amounts[split.memberId] ?? 0) + (split.paid ?? 0);
      return amounts;
    }, {});
  return Object.keys(explicitPaid).length > 0
    ? explicitPaid
    : { [expense.paidById]: expense.amount };
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const CUSTOM_CATS_KEY = "@spliteasy_custom_cats";
const NOTIF_KEY = "@spliteasy_notifs";
const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  expenseAdded: true,
  expenseEdited: false,
  expenseDeleted: false,
  settlement: true,
  invite: true,
  comment: false,
  reaction: false,
  friendRequest: true,
    chat: true,
  reminders: true,
};

function isExpenseParticipant(expense: Expense, memberId: string): boolean {
  return (
    expense.paidById === memberId ||
    expense.addedBy === memberId ||
    expense.splits.some(split => split.memberId === memberId)
  );
}

function isSettlementParticipant(settlement: Settlement, memberId: string): boolean {
  return settlement.fromId === memberId || settlement.toId === memberId;
}

function buildLegacyNudgeMessage(
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
  const { playSettled, playAdded, playRemoved } = useSoundEffects();
  const { isSignedIn, getToken } = useAuth();

  // Install the bearer-token getter before any of this provider's later
  // effects can start an authenticated bootstrap request. Keeping this next
  // to the bootstrap lifecycle avoids a native Expo Go startup race where the
  // API request can otherwise run before AuthBridge's effect has executed.
  useEffect(() => {
    setAuthTokenGetter(() => (isSignedIn ? getToken() : null));
    return () => setAuthTokenGetter(null);
  }, [isSignedIn, getToken]);

  // Server is the source of truth. State starts empty and is hydrated from the
  // offline cache (fast, may be stale) and then from GET /api/me/bootstrap.
  const [currentUser, setCurrentUser] = useState<Member>(defaultCurrentUser);
  const [members, setMembers] = useState<Member[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [directPayments, setDirectPayments] = useState<DirectPayment[]>([]);
  const directPaymentsRef = useRef<DirectPayment[]>([]);
  directPaymentsRef.current = directPayments;
  const [invitations, setInvitations] = useState<GroupInvitation[]>([]);
  const [groupMessages, setGroupMessages] = useState<GroupMessage[]>([]);
  const [groupMessageReads, setGroupMessageReads] = useState<Record<string, Record<string, string | null>>>({});
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [hasNewActivity, setHasNewActivity] = useState(false);
  /**
   * Reverse-lookup from stable app Member.id + groupId → server memberKey.
   * Required to build correct API payloads for financially mutating calls.
   */
  const [memberKeyMap, setMemberKeyMap] = useState<Record<string, Record<string, string>>>({});
  /** Server userId of the authenticated user (from the /me bootstrap). */
  const [serverUserId, setServerUserId] = useState<string | null>(null);

  // Latest state mirror so mutation rollbacks / cache writes read fresh values
  // without re-subscribing effects to every slice.
  const stateRef = useRef({ members, groups, expenses, settlements, invitations, recurringExpenses, notifications, groupMessages, memberKeyMap });
  stateRef.current = { members, groups, expenses, settlements, invitations, recurringExpenses, notifications, groupMessages, memberKeyMap };

  // The backend never creates a notifications-table row for OTHER members'
  // actions (only the acting device's own pushNotif fires locally), so an
  // expense/settlement someone else adds would otherwise sync in via
  // bootstrap with no unread notification to drive the Activity tab dot.
  // Track whether the very first bootstrap has landed so that cold start
  // doesn't flag the user's entire existing history as "new".
  const hasBootstrappedRef = useRef(false);

  /**
   * Resolve the server memberKey for a given app-side Member.id within a group.
   * Falls back to the memberId itself (correct for guest/placeholder members
   * whose id IS already the memberKey).
   */
  const getMemberKeyForGroup = useCallback(
    (memberId: string, groupId: string): string =>
      stateRef.current.memberKeyMap[memberId]?.[groupId] ?? memberId,
    [],
  );

  // Push a notification to the persistent inbox. Uses AsyncStorage directly so it
  // can be called from any mutation without depending on the saveNotifications callback.
  const pushNotif = useCallback((notif: Omit<AppNotification, "id" | "createdAt" | "read">) => {
    const entry: AppNotification = { ...notif, id: genId(), createdAt: new Date().toISOString(), read: false };
    setNotifications(prev => {
      const updated = [entry, ...prev];
      AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }, []);

  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'ok' | 'error'>('ok');
  const [isOffline, setIsOffline] = useState(false);
  const [defaultCurrency, setDefaultCurrencyState] = useState<Currency>("USD");
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({});
  const [ratesUpdated, setRatesUpdated] = useState<string | null>(null);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>(DEFAULT_NOTIF_PREFS);

  // Lock: prevents background task and foreground check from running concurrently.
  const recurringLockRef = useRef(false);

  /**
   * Ref-backed set of permanently dismissed notification IDs. Using a ref lets
   * applyBootstrap (a sync useCallback) read the current dismissed set without
   * needing it in its dependency array.
   */
  const dismissedNotifIdsRef = useRef<Set<string>>(new Set());

  /**
   * Merge server-sourced notifications with whatever is already in state.
   * Rules:
   *  - Server entries are included unless the user dismissed them.
   *  - Local-only entries (e.g. settlement reminders never sent to the server)
   *    are kept as long as they haven't been dismissed.
   *  - For IDs present in both lists the local `read` state wins (may be more
   *    up-to-date than the server).
   *  - Result is sorted newest-first.
   */
  const mergeNotifications = useCallback(
    (incoming: AppNotification[], current: AppNotification[]): AppNotification[] => {
      const dismissed = dismissedNotifIdsRef.current;
      const currentById = new Map(current.map(n => [n.id, n]));
      const result: AppNotification[] = [];

      // Include server/cache entries, preserving local read state.
      for (const n of incoming) {
        if (dismissed.has(n.id)) continue;
        const local = currentById.get(n.id);
        result.push(local ? { ...n, read: local.read } : n);
      }

      // Append local-only entries (settlement reminders, etc.) not in the incoming list.
      const incomingIds = new Set(incoming.map(n => n.id));
      for (const n of current) {
        if (dismissed.has(n.id)) continue;
        if (!incomingIds.has(n.id)) result.push(n);
      }

      // Newest first.
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return result;
    },
    []
  );

  const genId = () =>
    Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

  // Applies a mapped server bootstrap to state and updates the offline cache.
  const applyBootstrap = useCallback((mapped: Awaited<ReturnType<typeof fetchBootstrap>>) => {
    setCurrentUser(mapped.currentUser);
    setMembers(mapped.members);
    setGroups(mapped.groups);
    // The server bootstrap does not carry auditLog (edit history is built and
    // stored client-side), so a wholesale replace would wipe the trail on the
    // refresh that follows every successful edit. Merge the local log back in.
    const localExpenseById = new Map(stateRef.current.expenses.map(e => [e.id, e] as const));
    const mergedExpenses = mapped.expenses.map(se => {
      const local = localExpenseById.get(se.id);
      return local?.auditLog?.length && !se.auditLog?.length
        ? { ...se, auditLog: local.auditLog }
        : se;
    });
    // Flag the Activity tab as having something new whenever a group expense
    // or settlement shows up that this device didn't already know about —
    // e.g. added by another member on another device. Skipped on the very
    // first bootstrap so existing history isn't flagged as new on cold start.
    if (hasBootstrappedRef.current) {
      const localSettlements = stateRef.current.settlements;
      const localSettlementIds = new Set(localSettlements.map(s => s.id));
      const localSettlementKeys = new Set(localSettlements.map(settlementSoundKey));
      const syncedSettlements = mapped.settlements.filter(s => !localSettlementIds.has(s.id));
      const newRemoteSettlements = syncedSettlements.filter(
        settlement => !localSettlementKeys.has(settlementSoundKey(settlement)),
      );
      const hasNewFromSync =
        mapped.expenses.some(e => !localExpenseById.has(e.id)) ||
        mapped.settlements.some(s => !localSettlementIds.has(s.id));
      if (hasNewFromSync) setHasNewActivity(true);
      if (newRemoteSettlements.length > 0) playSettled();
    } else {
      hasBootstrappedRef.current = true;
    }
    setExpenses(mergedExpenses);
    setSettlements(mapped.settlements.filter(s => !pendingSettlementDeletes.current.has(s.id)));
    setInvitations(mapped.invitations);
    setRecurringExpenses(mapped.recurringExpenses);
    // Merge server notifications with local state: keep local-only nudge entries
    // and preserve per-entry read state, while filtering out dismissed IDs.
    setNotifications(prev => {
      const merged = mergeNotifications(mapped.notifications, prev);
      AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(merged)).catch(() => {});
      return merged;
    });
    setMemberKeyMap(mapped.memberKeyMap);
    setServerUserId(mapped.currentUserId);
    if (mapped.notifPrefs) setNotifPrefs(mapped.notifPrefs);
    setDefaultCurrencyState(prev => prev || (mapped.defaultCurrency as Currency));
    // Group messages are not part of the bootstrap payload; they remain managed
    // by the local MESSAGES_KEY cache, so we don't overwrite them here.
    AsyncStorage.setItem(SERVER_CACHE_KEY, JSON.stringify({ ...mapped, expenses: mergedExpenses, groupMessages: undefined })).catch(() => {});
  }, [mergeNotifications, playSettled]);

  /**
   * Refresh authoritative state from GET /api/me/bootstrap. Used after a
   * successful mutation (refresh-on-success) and on foreground resume.
   */
  const refreshFromServer = useCallback(async (): Promise<boolean> => {
    try {
      const mapped = await fetchBootstrap();
      applyBootstrap(mapped);
      // Successfully reached the server — clear any offline flag.
      setIsOffline(false);
      setSyncStatus('ok');
      return true;
    } catch (error) {
      const status =
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        typeof error.status === "number"
          ? error.status
          : null;

      // Authentication failures mean the server was reachable; do not present
      // them as a device connectivity problem or add a layout-shifting
      // offline banner over the app.
      if (status === 401 || status === 403) {
        setIsOffline(false);
        setSyncStatus("ok");
        return false;
      }

      // Network / transient failure — keep whatever cached state we already have.
      setIsOffline(true);
      return false;
    }
  }, [applyBootstrap]);

  // ── Local-only preferences (AsyncStorage cache is fine as source here) ──
  const loadLocalPrefs = useCallback(async () => {
    try {
      const currencyStored = await AsyncStorage.getItem("@spliteasy_defaultCurrency");
      if (currencyStored) setDefaultCurrencyState(currencyStored as Currency);

      // v2 key intentionally different from v1 ("@spliteasy_rates") so old
      // Frankfurter-sourced caches (which lack KWD and other non-ECB currencies)
      // are ignored and a fresh fetch from open.er-api.com happens automatically.
      const ratesStored = await AsyncStorage.getItem("@spliteasy_rates_v2");
      if (ratesStored) {
        const { rates: storedRates, updated } = JSON.parse(ratesStored);
          const rates = sanitizeRates(storedRates) ?? {};
        setExchangeRates(rates);
        setRatesUpdated(updated);
        const ageMs = Date.now() - new Date(updated).getTime();
        if (ageMs > 24 * 60 * 60 * 1000) fetchExchangeRates();
      } else {
        fetchExchangeRates();
      }

      const directPaymentsStored = await AsyncStorage.getItem("@spliteasy_direct_payments");
      if (directPaymentsStored) {
        try {
          const stored: Array<Partial<DirectPayment>> = JSON.parse(directPaymentsStored);
          if (!Array.isArray(stored)) throw new Error("Invalid direct payment data");
          const migrated = stored.map(payment => {
            const legacyNote = typeof payment.note === "string" ? payment.note.trim() : "";
            const reason = typeof payment.reason === "string" && payment.reason.trim()
              ? payment.reason.trim()
              : legacyNote || "Payment";
            const comments = typeof payment.comments === "string" && payment.comments.trim()
              ? payment.comments.trim()
              : legacyNote && legacyNote !== reason ? legacyNote : undefined;
            const { note: _legacyNote, ...rest } = payment;
            return { ...rest, reason, ...(comments ? { comments } : {}) } as DirectPayment;
          });
          setDirectPayments(migrated);
          // Write the normalized shape back once so later edits cannot drop legacy data.
          if (stored.some(payment => !payment.reason || payment.note !== undefined)) {
            AsyncStorage.setItem("@spliteasy_direct_payments", JSON.stringify(migrated)).catch(() => {});
          }
        } catch {}
      }

      const customCatsStored = await AsyncStorage.getItem(CUSTOM_CATS_KEY);
      if (customCatsStored) setCustomCategories(JSON.parse(customCatsStored));

      const notifStored = await AsyncStorage.getItem(NOTIF_KEY);
      if (notifStored) {
        try { setNotifPrefs({ ...DEFAULT_NOTIF_PREFS, ...JSON.parse(notifStored) }); } catch {}
      }

      const messagesStored = await AsyncStorage.getItem(MESSAGES_KEY);
      if (messagesStored) {
        try { setGroupMessages(JSON.parse(messagesStored)); } catch {}
      }

      // Load the persistent dismissed-ID set first so the ref is populated
      // before any notification merge runs.
      const dismissedRaw = await AsyncStorage.getItem(DISMISSED_IDS_KEY);
      if (dismissedRaw) {
        try {
          const ids: string[] = JSON.parse(dismissedRaw);
          dismissedNotifIdsRef.current = new Set(ids);
        } catch {}
      }

      // Seed the notifications list from the local store.  This covers the
      // offline/cold-start case where the server cache hasn't loaded yet and
      // ensures locally-created settlement reminders survive restarts.
      const localNotifRaw = await AsyncStorage.getItem(NOTIFICATIONS_KEY);
      if (localNotifRaw) {
        try {
          const local: AppNotification[] = JSON.parse(localNotifRaw);
          const dismissed = dismissedNotifIdsRef.current;
          setNotifications(local.filter(n => !dismissed.has(n.id)));
        } catch {}
      }
    } catch {}
  }, []);

  /**
   * Read the cached server snapshot for fast/offline startup. This is a cache
   * only — the live bootstrap fetch overwrites it when the network is up.
   */
  const loadServerCache = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(SERVER_CACHE_KEY);
      if (!raw) return;
      const mapped = JSON.parse(raw) as Awaited<ReturnType<typeof fetchBootstrap>>;
      setCurrentUser(mapped.currentUser ?? defaultCurrentUser);
      setMembers(mapped.members ?? []);
      setGroups(mapped.groups ?? []);
      setExpenses(mapped.expenses ?? []);
      setSettlements((mapped.settlements ?? []).filter(s => !pendingSettlementDeletes.current.has(s.id)));
      setInvitations(mapped.invitations ?? []);
      setRecurringExpenses(mapped.recurringExpenses ?? []);
      // Merge cache notifications with whatever local prefs loaded earlier.
      setNotifications(prev => mergeNotifications(mapped.notifications ?? [], prev));
      if (mapped.memberKeyMap) setMemberKeyMap(mapped.memberKeyMap);
      if (mapped.currentUserId) setServerUserId(mapped.currentUserId);
      if (mapped.notifPrefs) setNotifPrefs(mapped.notifPrefs);
      // Group messages come from the dedicated MESSAGES_KEY cache (loadLocalPrefs).
    } catch {}
  }, [mergeNotifications]);

  /**
   * One-time migration of the legacy `spliteasy_data_v3` snapshot to the
   * server via POST /api/imports. Only real user data is migrated — the seeded
   * demo defaults are never auto-imported.
   */
  const migrateLegacySnapshotIfNeeded = useCallback(async (): Promise<void> => {
    try {
      const done = await AsyncStorage.getItem(MIGRATION_DONE_KEY);
      if (done === "true") return;

      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // Nothing stored locally → nothing to migrate. Mark done so we never
        // reconsider and never import demo defaults.
        await AsyncStorage.setItem(MIGRATION_DONE_KEY, "true");
        return;
      }

      let snapshot: LegacySnapshot;
      try {
        snapshot = JSON.parse(raw) as LegacySnapshot;
      } catch {
        await AsyncStorage.setItem(MIGRATION_DONE_KEY, "true");
        return;
      }

      if (!isRealUserSnapshot(snapshot)) {
        // Looks like seeded demo defaults — do not import.
        await AsyncStorage.setItem(MIGRATION_DONE_KEY, "true");
        return;
      }

      const recurringRaw = await AsyncStorage.getItem(RECURRING_KEY);
      let recurring: RecurringExpense[] = [];
      if (recurringRaw) {
        try {
          const parsed = JSON.parse(recurringRaw) as RecurringExpense[];
          // Exclude the seeded demo recurring ids from migration.
          recurring = parsed.filter(r => !r.id.startsWith("rec_"));
        } catch {}
      }

      const currencyStored = (await AsyncStorage.getItem("@spliteasy_defaultCurrency")) || "USD";

      // Stable idempotency key so retries never double-import.
      let idemKey = await AsyncStorage.getItem(MIGRATION_DONE_KEY + "_key");
      if (!idemKey) {
        idemKey = newIdempotencyKey();
        await AsyncStorage.setItem(MIGRATION_DONE_KEY + "_key", idemKey);
      }

      await importLocalSnapshot(snapshot, recurring, currencyStored, idemKey, serverUserId ?? undefined);
      await AsyncStorage.setItem(MIGRATION_DONE_KEY, "true");
    } catch (e) {
      // Migration is best-effort; leave the flag unset so it retries next launch.
    }
  }, []);

  // Initial local prefs + cached snapshot (fast, offline-safe).
  useEffect(() => {
    void loadLocalPrefs();
    void loadServerCache().finally(() => setIsLoading(false));
  }, [loadLocalPrefs, loadServerCache]);

  // When authentication becomes available, migrate any legacy local data once,
  // then hydrate authoritative state from the server.
  const didBootstrapRef = useRef(false);
  useEffect(() => {
    if (!isSignedIn) {
      didBootstrapRef.current = false;
      return;
    }
    if (didBootstrapRef.current) return;
    didBootstrapRef.current = true;

    (async () => {
      // Ensure a token is available before hitting authenticated endpoints.
      try { await getToken(); } catch {}
      await migrateLegacySnapshotIfNeeded();
      await refreshFromServer();
      setIsLoading(false);
    })();
  }, [isSignedIn, getToken, migrateLegacySnapshotIfNeeded, refreshFromServer]);

  // Register / unregister the OS-level background task in step with auth state.
  useEffect(() => {
    if (isSignedIn) {
      void registerBackgroundRecurring();
    } else {
      void unregisterBackgroundRecurring();
    }
  }, [isSignedIn]);

  const fetchExchangeRates = useCallback(async () => {
    try {
      // open.er-api.com covers 160+ currencies (including KWD, AED, SAR, etc.)
      // — free, no API key, rates relative to USD.
      const resp = await fetch("https://open.er-api.com/v6/latest/USD");
      const data = await resp.json();
      // API includes USD itself (rate: 1) so no special-casing needed.
      const rates = sanitizeRates(data?.rates);
      if (!rates) return; // keep the last good rates if the service sends something unusable
      const updated = new Date().toISOString();
      setExchangeRates(rates);
      setRatesUpdated(updated);
      await AsyncStorage.setItem("@spliteasy_rates_v2", JSON.stringify({ rates, updated }));
    } catch {}
  }, []);

  const convertAmount = useCallback(
    (amount: number, from: Currency, to: Currency): number => {
      if (from === to) return amount;
      // Live rates, with bundled rates for anything missing: never a silent 1:1 or USD guess.
      // The amount comes back unchanged only for a code outside the currency list.
      return convertWithRates(amount, from, to, withFallback(exchangeRates)) ?? amount;
    },
    [exchangeRates]
  );

  const convertCurrency = useCallback(
    (amount: number, from: Currency): number => {
      if (from === defaultCurrency) return amount;
      return convertWithRates(amount, from, defaultCurrency, withFallback(exchangeRates)) ?? amount;
    },
    [exchangeRates, defaultCurrency]
  );

  const setDefaultCurrency = useCallback(async (currency: Currency) => {
    setDefaultCurrencyState(currency);
    await AsyncStorage.setItem("@spliteasy_defaultCurrency", currency);
    // Persist the preference on the server profile (best-effort).
    api.updateCurrentUser({ defaultCurrency: currency }).catch(() => {});
  }, []);

  // Writes the current optimistic state to the offline cache (cache only —
  // the production API remains the source of truth).
  const saveData = useCallback(
    async (
      updatedMembers: Member[],
      updatedGroups: Group[],
      updatedExpenses: Expense[],
      updatedSettlements: Settlement[],
      updatedInvitations: GroupInvitation[]
    ) => {
      try {
        const s = stateRef.current;
        await AsyncStorage.setItem(
          SERVER_CACHE_KEY,
          JSON.stringify({
            currentUser,
            members: updatedMembers,
            groups: updatedGroups,
            expenses: updatedExpenses,
            settlements: updatedSettlements,
            invitations: updatedInvitations,
            recurringExpenses: s.recurringExpenses,
            notifications: s.notifications,
            notifPrefs,
            defaultCurrency,
          })
        );
      } catch (e) {}
    },
    [currentUser, notifPrefs, defaultCurrency]
  );

  /**
   * Run a mutating server call for an optimistic UI update. On failure we
   * surface a user-safe toast and re-hydrate authoritative state from the
   * server (rollback). On success we refresh so server-assigned ids/derived
   * fields replace the optimistic client values (refresh-on-success).
   *
   * All calls are fire-and-forget so the public (synchronous) method
   * signatures in AppContextType are preserved.
   */
  /** True when the error is a connectivity failure (no response), not a server 4xx/5xx. */
  const isNetworkError = (e: unknown): boolean => {
    if (!(e instanceof Error)) return false;
    if ('status' in e) return false; // API errors carry a status field
    return true;
  };

  // Offline queue: changes made with no connection are kept and sent later,
  // instead of being rolled back.
  const pendingSyncRef = useRef<Array<RecordedOp | (() => Promise<unknown>)>>([]);
  const OFFLINE_QUEUE_KEY = "offlineQueue:v1";
  const persistQueue = useCallback(() => {
    const ops = pendingSyncRef.current.filter((x): x is RecordedOp => typeof x !== "function");
    AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(ops)).catch(() => {});
  }, []);
  const queueOffline = useCallback(async (fn: () => Promise<unknown>) => {
    const ops = await recordApiCalls(fn);
    if (ops && ops.length > 0) pendingSyncRef.current.push(...ops);
    else pendingSyncRef.current.push(fn); // could not record: keep in memory only
    persistQueue();
  }, [persistQueue]);
  const flushingRef = useRef(false);

  const runServerSync = useCallback(
    (fn: () => Promise<unknown>, opts?: { errorMessage?: string; silent?: boolean }) => {
      if (pendingSyncRef.current.length > 0) {
        // Keep order: queue behind anything still waiting to sync.
        void queueOffline(fn);
        return;
      }
      (async () => {
        try {
          await fn();
          setSyncStatus('ok');
          await refreshFromServer();
        } catch (e) {
          // Connectivity failure → raise the persistent banner so the user knows
          // the change didn't reach the server, even after the toast fades.
          if (isNetworkError(e)) {
            setSyncStatus('error');
            setIsOffline(true);
            void queueOffline(fn);
            if (!opts?.silent) showToast("Saved on your phone. It will sync when you're back online.", "warning");
            return; // keep the change; do not roll back
          }
          if (!opts?.silent) {
            showToast(toUserMessage(e, opts?.errorMessage), "warning");
          }
          // Rollback: restore server truth (drops the optimistic change).
          await refreshFromServer();
        }
      })();
    },
    [refreshFromServer, showToast]
  );

  const flushPendingSync = useCallback(async () => {
    if (flushingRef.current || pendingSyncRef.current.length === 0) return;
    flushingRef.current = true;
    try {
      while (pendingSyncRef.current.length > 0) {
        try {
          const item = pendingSyncRef.current[0];
          await (typeof item === "function" ? item() : replayApiCall(item));
          pendingSyncRef.current.shift();
          persistQueue();
        } catch (e) {
          if (isNetworkError(e)) return; // still offline; try again later
          pendingSyncRef.current.shift(); persistQueue(); // server rejected it; drop and tell the user
          showToast(toUserMessage(e, "A change made offline couldn't be saved."), "warning");
        }
      }
      setSyncStatus('ok');
      setIsOffline(false);
      await refreshFromServer();
    } finally {
      flushingRef.current = false;
    }
  }, [refreshFromServer, showToast, persistQueue]);

  // Changes saved on the phone before the app was closed: load and send them.
  useEffect(() => {
    AsyncStorage.getItem(OFFLINE_QUEUE_KEY).then(raw => {
      const ops = raw ? (JSON.parse(raw) as RecordedOp[]) : [];
      if (ops.length) { pendingSyncRef.current.unshift(...ops); void flushPendingSync(); }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setInterval(() => { void flushPendingSync(); }, 10000);
    const sub = AppState.addEventListener("change", s => { if (s === "active") void flushPendingSync(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [flushPendingSync]);

  const toggleSimplifyDebts = useCallback(
    (groupId: string) => {
      const previous = groups.find(group => group.id === groupId);
      if (!previous) return;

      const next = previous.simplifyDebtsEnabled === false;
      const updatedGroups = groups.map(group =>
        group.id === groupId ? { ...group, simplifyDebtsEnabled: next } : group,
      );
      setGroups(updatedGroups);
      saveData(members, updatedGroups, expenses, settlements, invitations);
      runServerSync(
        () => api.updateGroup(groupId, { simplifyDebtsEnabled: next }),
        { errorMessage: "Couldn't update Simplify Debts." },
      );
    },
    [
      groups,
      members,
      expenses,
      settlements,
      invitations,
      saveData,
      runServerSync,
    ],
  );

  const clearNewActivity = useCallback(() => setHasNewActivity(false), []);
  const clearSyncError = useCallback(() => setSyncStatus('ok'), []);

  const retrySync = useCallback(() => {
    return refreshFromServer().then(ok => {
      if (ok) setSyncStatus('ok');
      return ok;
    });
  }, [refreshFromServer]);

  const sendGroupReminder = useCallback(
    async (groupId: string, recipientMemberId: string, amount: number, currency: string) => {
      await api.sendGroupReminder(
        groupId,
        recipientMemberId,
        amount,
        currency,
        stateRef.current.memberKeyMap,
      );
      await refreshFromServer();
    },
    [refreshFromServer],
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
      runServerSync(() => api.updateCurrentUser({
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.email !== undefined ? { email: updates.email } : {}),
        ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
        ...(updates.avatarColor !== undefined ? { avatarColor: updates.avatarColor } : {}),
        ...(updates.photo !== undefined ? { photo: updates.photo } : {}),
      }), { errorMessage: "Couldn't update your profile." });
    },
    [currentUser, members, groups, expenses, settlements, invitations, saveData, runServerSync]
  );

  const updateMember = useCallback(
    (id: string, updates: Partial<Omit<Member, "id">>) => {
      const updated = members.map(m => (m.id === id ? { ...m, ...updates } : m));
      setMembers(updated);
      if (id === currentUser.id) setCurrentUser(prev => ({ ...prev, ...updates }));
      saveData(updated, groups, expenses, settlements, invitations);
      // Member profile fields are stored per group-member row on the server;
      // updating the current user routes through the /me endpoint above.
      if (id === currentUser.id) {
        runServerSync(() => api.updateCurrentUser({
          ...(updates.name !== undefined ? { name: updates.name } : {}),
          ...(updates.email !== undefined ? { email: updates.email } : {}),
          ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
          ...(updates.avatarColor !== undefined ? { avatarColor: updates.avatarColor } : {}),
          ...(updates.photo !== undefined ? { photo: updates.photo } : {}),
        }), { errorMessage: "Couldn't update member." });
      }
    },
    [currentUser.id, members, groups, expenses, settlements, invitations, saveData, runServerSync]
  );

  const leaveGroupMember = useCallback(
    (groupId: string, memberId: string) => {
      const memberKey = getMemberKeyForGroup(memberId, groupId);
      const isSelf = memberId === currentUser.id;
      const updatedGroups = isSelf
        ? groups.filter(g => g.id !== groupId)
        : groups.map(g => (g.id === groupId ? { ...g, memberIds: (g.memberIds ?? []).filter(x => x !== memberId) } : g));
      setGroups(updatedGroups);
      saveData(members, updatedGroups, expenses, settlements, invitations);
      runServerSync(() => api.removeGroupMember(groupId, memberKey), {
        errorMessage: isSelf ? "Couldn't leave the group." : "Couldn't remove member.",
      });
    },
    [currentUser.id, members, groups, expenses, settlements, invitations, saveData, runServerSync, getMemberKeyForGroup],
  );

  const removeMember = useCallback(
    (id: string) => {
      const target = members.find(m => m.id === id);
      const updated = members.filter(m => m.id !== id);
      setMembers(updated);
      saveData(updated, groups, expenses, settlements, invitations);
      if (target) pushNotif({ type: "member_removed", title: "Member removed", body: `${target.name} was removed from the group` });
      // Remove the member from every group they belong to on the server.
      const affected = groups.filter(g => (g.memberIds ?? []).includes(id));
      if (affected.length) {
        const mkm = stateRef.current.memberKeyMap;
        runServerSync(async () => {
          for (const g of affected) {
            // Resolve the group-scoped memberKey (not the stable app id).
            const memberKey = getMemberKeyForGroup(id, g.id);
            await api.removeGroupMember(g.id, memberKey);
          }
        }, { errorMessage: "Couldn't remove member." });
      }
    },
    [members, groups, expenses, settlements, invitations, saveData, pushNotif, runServerSync, getMemberKeyForGroup]
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
      // A member exists on the server only within a group; the caller adds it to
      // groups via addGroup/updateGroup which carry member rows. No standalone
      // server call here (see report: standalone member directory is local).
      return newMember;
    },
    [members, groups, expenses, settlements, invitations, saveData]
  );

  const seedDemoFriends = useCallback(() => {
    const existingEmails = new Set(
      members.map(member => member.email?.trim().toLowerCase()).filter(Boolean),
    );
    const currentEmail = currentUser.email?.trim().toLowerCase();
    const demoFriends = defaultMembers
      .filter(member => member.id !== CURRENT_USER_ID && member.email)
      .filter(member => member.email!.toLowerCase() !== currentEmail)
      .filter(member => !existingEmails.has(member.email!.toLowerCase()));

    if (demoFriends.length === 0) return 0;

    const joinedAt = new Date().toISOString();
    const seededFriends = demoFriends.map(friend => ({
      ...friend,
      id: genId(),
      joinedAt,
      isPending: false,
    }));
    const updated = [...members, ...seededFriends];
    setMembers(updated);
    saveData(updated, groups, expenses, settlements, invitations);
    return seededFriends.length;
  }, [currentUser.email, members, groups, expenses, settlements, invitations, saveData]);

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
      runServerSync(
        () => api.createGroup(newGroup, members, serverUserId, stateRef.current.memberKeyMap),
        { errorMessage: "Couldn't create group." },
      );
      return newGroup;
    },
    [members, groups, expenses, settlements, invitations, saveData, currentUser.id, serverUserId, runServerSync]
  );

  // Create on the server first, then open the group under the server's id.
  // (The local temporary id is replaced on the next refresh, which made a
  // freshly created group show "Group not found".)
  const addGroupAsync = useCallback(
    async (group: Omit<Group, "id" | "createdAt">): Promise<Group> => {
      const draft: Group = {
        ...group,
        id: genId(),
        createdAt: new Date().toISOString(),
        adminIds: group.adminIds ?? [currentUser.id],
      };
      try {
        const server = await api.createGroup(draft, members, serverUserId, stateRef.current.memberKeyMap);
        await refreshFromServer();
        return { ...draft, id: (server as { id: string }).id };
      } catch {
        // Offline or server error: fall back to the local copy so nothing is lost.
        return addGroup(group);
      }
    },
    [members, currentUser.id, serverUserId, refreshFromServer, addGroup]
  );

  const updateGroup = useCallback(
    (id: string, updates: Partial<Group>) => {
      const prev = groups.find(g => g.id === id);
      const updated = groups.map(g => (g.id === id ? { ...g, ...updates } : g));
      setGroups(updated);
      saveData(members, updated, expenses, settlements, invitations);
      if (prev) pushNotif({ type: "group_updated", groupId: id, title: "Group updated", body: `"${prev.name}" settings were updated` });
      runServerSync(() => api.updateGroup(id, updates), { errorMessage: "Couldn't update group." });
    },
    [members, groups, expenses, settlements, invitations, saveData, pushNotif, runServerSync]
  );

  const archiveGroup = useCallback(
    (id: string) => {
      const prev = groups.find(g => g.id === id);
      const updated = groups.map(g =>
        g.id === id ? { ...g, isArchived: true, archivedAt: new Date().toISOString() } : g
      );
      setGroups(updated);
      saveData(members, updated, expenses, settlements, invitations);
      showToast("Group archived", "info");
      if (prev) pushNotif({ type: "group_archived", groupId: id, title: "Group archived", body: `"${prev.name}" has been archived` });
      runServerSync(() => api.updateGroup(id, { isArchived: true }), { errorMessage: "Couldn't archive group." });
    },
    [members, groups, expenses, settlements, invitations, saveData, showToast, pushNotif, runServerSync]
  );

  const unarchiveGroup = useCallback(
    (id: string) => {
      const updated = groups.map(g =>
        g.id === id ? { ...g, isArchived: false, archivedAt: undefined } : g
      );
      setGroups(updated);
      saveData(members, updated, expenses, settlements, invitations);
      showToast("Group restored", "success");
      runServerSync(() => api.updateGroup(id, { isArchived: false }), { errorMessage: "Couldn't restore group." });
    },
    [members, groups, expenses, settlements, invitations, saveData, showToast, runServerSync]
  );

  const endGroup = useCallback(
    (id: string) => {
      const prev = groups.find(g => g.id === id);
      const endedAt = new Date().toISOString();
      const updated = groups.map(g =>
        g.id === id
          ? { ...g, isEnded: true, endedAt, isArchived: true, archivedAt: endedAt }
          : g
      );
      setGroups(updated);
      saveData(members, updated, expenses, settlements, invitations);
      showToast("Group ended and archived", "info");
      if (prev) {
        pushNotif({
          type: "group_ended",
          groupId: id,
          title: "Group ended and archived",
          body: `"${prev.name}" has been archived. A member must restore it manually.`,
        });
      }
      runServerSync(
        () => api.updateGroup(id, { isEnded: true, isArchived: true }),
        { errorMessage: "Couldn't end and archive group." },
      );
    },
    [members, groups, expenses, settlements, invitations, saveData, showToast, pushNotif, runServerSync]
  );

  const assignAdmin = useCallback(
    (groupId: string, memberId: string) => {
      const grp = groups.find(g => g.id === groupId);
      const updated = groups.map(g =>
        g.id === groupId
          ? { ...g, adminIds: [...new Set([...(g.adminIds ?? []), memberId])] }
          : g
      );
      setGroups(updated);
      saveData(members, updated, expenses, settlements, invitations);
      showToast("Admin assigned", "success");
      if (grp) {
        // Resolve the group-scoped memberKey and PATCH the existing row.
        const memberKey = getMemberKeyForGroup(memberId, groupId);
        runServerSync(
          () => api.updateGroupMember(groupId, memberKey, true),
          { errorMessage: "Couldn't assign admin." },
        );
      }
    },
    [members, groups, expenses, settlements, invitations, saveData, showToast, runServerSync, getMemberKeyForGroup]
  );

  const removeAdmin = useCallback(
    (groupId: string, memberId: string) => {
      const grp = groups.find(g => g.id === groupId);
      const updated = groups.map(g =>
        g.id === groupId
          ? { ...g, adminIds: (g.adminIds ?? []).filter(id => id !== memberId) }
          : g
      );
      setGroups(updated);
      saveData(members, updated, expenses, settlements, invitations);
      if (grp) {
        // Resolve the group-scoped memberKey and PATCH the existing row.
        const memberKey = getMemberKeyForGroup(memberId, groupId);
        runServerSync(
          () => api.updateGroupMember(groupId, memberKey, false),
          { errorMessage: "Couldn't update admin." },
        );
      }
    },
    [members, groups, expenses, settlements, invitations, saveData, runServerSync, getMemberKeyForGroup]
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
      runServerSync(() => api.deleteGroup(id), { errorMessage: "Couldn't delete group." });
    },
    [members, groups, expenses, settlements, invitations, saveData, runServerSync]
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
      // Persist notification preferences on the server profile (best-effort).
      api.updateCurrentUser({ notifPrefs: next as unknown as Record<string, unknown> }).catch(() => {});
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
        creationSnapshot: {
          amount: expense.amount,
          currency: expense.currency,
          paidById: expense.paidById,
          splitType: expense.splitType,
          splits: expense.splits,
        },
      };
      const newExpense: Expense = {
        ...expense,
        id: genId(),
        createdAt: now,
        addedBy: creatorId,
        auditLog: [auditEntry],
      };
      const updated = [newExpense, ...expenses];
      playAdded();
      void maybeAskForReview("expense");
      setExpenses(updated);
      saveData(members, groups, updated, settlements, invitations);
      const isInvolved = isExpenseParticipant(newExpense, currentUser.id);
      if (notifPrefs.expenseAdded && isInvolved) {
        showToast(`"${expense.description}" added to group`, "success");
      }
      setHasNewActivity(true);
      const grp = groups.find(g => g.id === expense.groupId);
      if (isInvolved) {
        pushNotif({
          type: "expense_added",
          groupId: expense.groupId,
          expenseId: newExpense.id,
          title: "Expense added",
          body: `"${expense.description}" (${expense.amount.toFixed(2)} ${expense.currency}) was added${grp ? ` to ${grp.name}` : ""}`,
        });
      }
      runServerSync(
        async () => {
        const created = await api.createExpense(expense.groupId, expense, stateRef.current.memberKeyMap);
        if (created?.id && created.id !== newExpense.id) expenseIdAlias[newExpense.id] = created.id;
        return created;
      },
        { errorMessage: "Couldn't add expense." },
      );
    },
    [members, groups, expenses, settlements, invitations, saveData, notifPrefs, showToast, currentUser.id, pushNotif, runServerSync]
  );

  const updateExpense = useCallback(
    (id: string, updates: Partial<Expense>) => {
      const prev = expenses.find(e => e.id === id);
      const isRealEdit = !updates.reactions && !updates.comments;
      let updatedExpenses: Expense[];
      if (isRealEdit && prev) {
        const trackedFields: (keyof Expense)[] = ["description", "amount", "currency", "paidById", "splitType", "category", "notes"];
        const fieldChanges: AuditEntry["fieldChanges"] = [];
        trackedFields.forEach(field => {
          const oldVal = String(prev[field] ?? "");
          const newVal = updates[field] !== undefined ? String(updates[field] ?? "") : oldVal;
          if (updates[field] !== undefined && oldVal !== newVal) {
            fieldChanges.push({ field, oldValue: oldVal, newValue: newVal });
          }
        });

        // Track splits — record per-person breakdown so the audit shows actual share changes
        if (updates.splits !== undefined) {
          const newSplitType = updates.splitType ?? prev.splitType;
          const fmtBreakdown = (splits: SplitDetail[], type: SplitType) =>
            splits.map(s => {
              const m = members.find(mbr => mbr.id === s.memberId);
              const name = m ? (m.isCurrentUser ? "You" : m.name.split(" ")[0]) : "?";
              if (type === "percentage") return `${name}: ${(s.percentage ?? 0).toFixed(0)}%`;
              return `${name}: ${s.amount.toFixed(2)}`;
            }).join(", ");
          const oldBreakdown = fmtBreakdown(prev.splits, prev.splitType);
          const newBreakdown = fmtBreakdown(updates.splits, newSplitType);
          if (oldBreakdown !== newBreakdown) {
            fieldChanges.push({ field: "splits", oldValue: oldBreakdown, newValue: newBreakdown });
          }
        }

        const auditEntry: AuditEntry = {
          id: genId(),
          action: "updated",
          changedBy: currentUser.id,
          changedAt: new Date().toISOString(),
          ...(fieldChanges.length > 0 ? { fieldChanges } : {}),
        };

        // Preserve "created" entry: if the existing log has no "created" entry (e.g. expense
        // was added before audit logging was introduced), prepend a synthetic one so the full
        // history is never truncated after the first edit.
        const existingLog = prev.auditLog ?? [];
        const hasCreatedEntry = existingLog.some(entry => entry.action === "created");
        const syntheticCreated: AuditEntry = {
          id: `synthetic_created_${id}`,
          action: "created",
          changedBy: prev.addedBy ?? prev.paidById,
          changedAt: prev.createdAt,
        };
        const fullLog = hasCreatedEntry
          ? [...existingLog, auditEntry]
          : [syntheticCreated, ...existingLog, auditEntry];

        updatedExpenses = expenses.map(e =>
          e.id === id
            ? { ...e, ...updates, auditLog: fullLog }
            : e
        );
      } else {
        updatedExpenses = expenses.map(e => (e.id === id ? { ...e, ...updates } : e));
      }
      setExpenses(updatedExpenses);
      saveData(members, groups, updatedExpenses, settlements, invitations);
      const isInvolved = prev ? isExpenseParticipant(prev, currentUser.id) : false;
      if (notifPrefs.expenseEdited && prev && isRealEdit && isInvolved) {
        showToast(`"${prev.description}" was updated`, "info");
      }
      if (prev && isRealEdit && isInvolved) {
        const grp = groups.find(g => g.id === prev.groupId);
        pushNotif({
          type: "expense_edited",
          groupId: prev.groupId,
          expenseId: id,
          title: "Expense updated",
          body: `"${prev.description}" was edited${grp ? ` in ${grp.name}` : ""}`,
        });
      }
      // Reactions are a device-local nicety and not persisted server-side; only
      // sync structural edits (comments handled by addExpenseComment).
      if (isRealEdit && prev) {
        const expGroupId = prev.groupId;
        runServerSync(
          () => api.updateExpense(id, expGroupId, updates, stateRef.current.memberKeyMap),
          { errorMessage: "Couldn't update expense." },
        );
      }
    },
    [members, groups, expenses, settlements, invitations, saveData, notifPrefs, showToast, currentUser.id, pushNotif, runServerSync]
  );

  const deleteExpense = useCallback(
    (id: string) => {
      const target = expenses.find(e => e.id === id);
      const updated = expenses.filter(e => e.id !== id);
      setExpenses(updated);
      if (target) playRemoved();
      saveData(members, groups, updated, settlements, invitations);
      let undone = false;
      const isInvolved = target ? isExpenseParticipant(target, currentUser.id) : false;
      if (notifPrefs.expenseDeleted && target && isInvolved) {
        showToast(`"${target.description}" removed for everyone`, "warning", {
          label: "Undo",
          onPress: () => {
            undone = true;
          pendingSettlementDeletes.current.delete(id);
            setExpenses(prev => {
              if (prev.some(e => e.id === target.id)) return prev;
              const restored = [target, ...prev].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              );
              saveData(members, groups, restored, settlements, invitations);
              return restored;
            });
            // Re-create on the server (server assigns a fresh id; refresh reconciles).
            const { id: _omit, createdAt: _omit2, ...rest } = target;
            runServerSync(() => api.createExpense(target.groupId, rest, stateRef.current.memberKeyMap), { errorMessage: "Couldn't restore expense." });
          },
        });
      }
      if (target && isInvolved) {
        const grp = groups.find(g => g.id === target.groupId);
        pushNotif({
          type: "expense_deleted",
          groupId: target.groupId,
          deletedExpense: target,
          deletedById: currentUser.id,
          title: "Expense removed",
          body: `"${target.description}" (${target.amount.toFixed(2)} ${target.currency}) was removed${grp ? ` from ${grp.name}` : ""}`,
        });
      }
      // Delete on the server after a short delay so an Undo tap can cancel it.
      setTimeout(() => {
        if (undone) return;
        runServerSync(() => api.deleteExpense(id), { errorMessage: "Couldn't delete expense." });
      }, 4000);
    },
    [members, groups, expenses, settlements, invitations, saveData, notifPrefs, showToast, pushNotif, runServerSync]
  );

  const addExpenseComment = useCallback(
    (expenseId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const expense = expenses.find(e => e.id === expenseId);
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
      const isInvolved = expense ? isExpenseParticipant(expense, currentUser.id) : false;
      if (notifPrefs.comment && isInvolved) {
        showToast("Comment added", "success");
      }
      if (expense && isInvolved) {
        const grp = groups.find(g => g.id === expense.groupId);
        pushNotif({
          type: "comment_added",
          groupId: expense.groupId,
          expenseId,
          title: "New comment",
          body: `A comment was added to "${expense.description}"${grp ? ` in ${grp.name}` : ""}`,
        });
      }
      if (expense) {
        const expGroupId = expense.groupId;
        runServerSync(
          () => api.addExpenseComment(expenseId, currentUser.id, expGroupId, trimmed, stateRef.current.memberKeyMap),
          { errorMessage: "Couldn't add comment." },
        );
      }
    },
    [currentUser.id, members, groups, expenses, settlements, invitations, saveData, notifPrefs, showToast, pushNotif, runServerSync]
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
      playSettled();
      void maybeAskForReview("settled");
      const isInvolved = isSettlementParticipant(newSettlement, currentUser.id);
      if (notifPrefs.settlement && isInvolved) {
        showToast("Settlement recorded ✓", "success", undefined, { dismissible: true });
      }
      setHasNewActivity(true);
      const grp = groups.find(g => g.id === settlement.groupId);
      const toMember = members.find(m => m.id === settlement.toId);
      if (isInvolved) {
        pushNotif({
          type: "settlement_recorded",
          groupId: settlement.groupId,
          settlementId: newSettlement.id,
          title: "Payment recorded",
          body: `${settlement.amount.toFixed(2)} ${settlement.currency} paid${toMember ? ` to ${toMember.name}` : ""}${grp ? ` in ${grp.name}` : ""}`,
        });
      }
      runServerSync(
        () => api.createSettlement(settlement.groupId, settlement, stateRef.current.memberKeyMap),
        { errorMessage: "Couldn't record settlement." },
      );
    },
    [members, groups, expenses, settlements, invitations, saveData, notifPrefs, showToast, pushNotif, playSettled, runServerSync]
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
      playSettled();
      void maybeAskForReview("settled");
      const involvedCreated = created.filter(s => isSettlementParticipant(s, currentUser.id));
      if (notifPrefs.settlement && involvedCreated.length > 0) {
        showToast(
          `${created.length} settlement${created.length > 1 ? "s" : ""} recorded ✓`,
          "success",
          undefined,
          { dismissible: true },
        );
      }
      setHasNewActivity(true);
      const groupIds = [...new Set(created.map(s => s.groupId))];
      groupIds.forEach(gid => {
        const grp = groups.find(g => g.id === gid);
         const batch = involvedCreated.filter(s => s.groupId === gid);
         if (batch.length === 0) return;
        pushNotif({
          type: "settlement_recorded",
          groupId: gid,
          settlementId: batch.length === 1 ? batch[0].id : undefined,
          title: `${batch.length > 1 ? `${batch.length} payments` : "Payment"} recorded`,
          body: `${batch.length > 1 ? `${batch.length} settlements` : `${batch[0].amount.toFixed(2)} ${batch[0].currency} settlement`} recorded${grp ? ` in ${grp.name}` : ""}`,
        });
      });
      runServerSync(async () => {
        const mkm = stateRef.current.memberKeyMap;
        for (const s of newSettlements) await api.createSettlement(s.groupId, s, mkm);
      }, { errorMessage: "Couldn't record settlements." });
    },
    [members, groups, expenses, settlements, invitations, saveData, notifPrefs, showToast, pushNotif, playSettled, runServerSync]
  );

    // Hooks for One-off sync (filled in below, next to deleteDirectPayment).
  const dpSyncRef = useRef<{ push: (p?: DirectPayment) => void; remove: (id: string, quiet?: boolean) => void }>({ push: () => {}, remove: () => {} });

  const addDirectPayment = useCallback(
    (payment: Omit<DirectPayment, "id" | "createdAt">) => {
      const now = new Date().toISOString();
      const auditEntry: AuditEntry = {
        id: genId(),
        action: "created",
        changedBy: currentUser.id,
        changedAt: now,
      };
      const newPayment: DirectPayment = {
        ...payment,
        id: genId(),
        createdAt: now,
        auditLog: [auditEntry],
      };
      setDirectPayments(prev => {
        const updated = [newPayment, ...prev];
        AsyncStorage.setItem("@spliteasy_direct_payments", JSON.stringify(updated)).catch(() => {});
        return updated;
      });
      const other = members.find(member => member.id === (payment.fromId === currentUser.id ? payment.toId : payment.fromId));
      pushNotif({
        type: "direct_payment_added",
        title: "One-off added",
        body: `${payment.reason} with ${other?.name ?? "a friend"} was added`,
        paymentId: newPayment.id,
      });
      setHasNewActivity(true);
      dpSyncRef.current.push(newPayment);
    },
    [currentUser.id, members, pushNotif]
  );

  const seedDirectPayments = useCallback(
    (count: number) => {
      const availableFriends = members.filter(
        member => !member.isCurrentUser && member.id !== currentUser.id && !member.isPending,
      );
      if (count <= 0 || availableFriends.length === 0) return;

      const reasons = [
        "Dinner at Luma",
        "Airport transfer",
        "Coffee run",
        "Concert tickets",
        "Grocery run",
        "Weekend brunch",
        "Taxi home",
        "Movie night",
        "Birthday gift",
        "Parking",
      ];
      const categories = ["food", "transport", "food", "entertainment", "shopping", "food", "transport", "entertainment", "shopping", "transport"];
      const currencies: Currency[] = ["USD", "EUR", "GBP", "AED"];
      const now = Date.now();
      const amountPattern = [18, 24.5, 32, 46.75, 58, 72.4, 91, 115.25, 136, 164.5];

      const samples: DirectPayment[] = Array.from({ length: count }, (_, index) => {
        const friend = availableFriends[index % availableFriends.length];
        const fromCurrentUser = index % 3 !== 1;
        const createdAt = new Date(now - (index + 1) * 86_400_000).toISOString();
        return {
          id: genId(),
          fromId: fromCurrentUser ? currentUser.id : friend.id,
          toId: fromCurrentUser ? friend.id : currentUser.id,
          amount: amountPattern[index % amountPattern.length],
          currency: currencies[index % currencies.length],
          reason: reasons[index % reasons.length],
          category: categories[index % categories.length],
          ...(index % 6 === 0 ? { comments: "Sample one-off for preview" } : {}),
          createdAt,
          auditLog: [{
            id: genId(),
            action: "created",
            changedBy: currentUser.id,
            changedAt: createdAt,
          }],
        };
      });

      setDirectPayments(prev => {
        const updated = [...samples, ...prev];
        AsyncStorage.setItem("@spliteasy_direct_payments", JSON.stringify(updated)).catch(() => {});
        return updated;
      });
    },
    [currentUser.id, members],
  );

  const updateDirectPayment = useCallback(
    (id: string, updates: Partial<Omit<DirectPayment, "id" | "createdAt">>) => {
      const current = directPaymentsRef.current;
      const updated = current.map(payment => {
        if (payment.id !== id) return payment;

        const trackedFields: (keyof Omit<DirectPayment, "id" | "createdAt">)[] = ["reason", "amount", "currency", "category", "comments"];
        const fieldChanges: AuditEntry["fieldChanges"] = [];
        trackedFields.forEach(field => {
          const oldVal = String(payment[field] ?? "");
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

        // Preserve a "created" entry even for payments made before audit
        // logging existed, so history never looks truncated after an edit.
        const existingLog = payment.auditLog ?? [];
        const hasCreatedEntry = existingLog.some(entry => entry.action === "created");
        const syntheticCreated: AuditEntry = {
          id: `synthetic_created_${id}`,
          action: "created",
          changedBy: payment.fromId,
          changedAt: payment.createdAt,
        };
        const fullLog = hasCreatedEntry
          ? [...existingLog, auditEntry]
          : [syntheticCreated, ...existingLog, auditEntry];

        return { ...payment, ...updates, updatedAt: new Date().toISOString(), auditLog: fullLog };
      });
      directPaymentsRef.current = updated;
      setDirectPayments(updated);
      persistDirectPayments(updated);
      pushNotif({
        type: "direct_payment_edited",
        title: "One-off updated",
        body: "A one-off payment was updated",
        paymentId: id,
      });
      setHasNewActivity(true);
      dpSyncRef.current.push(updated.find(p => p.id === id));
    },
    [pushNotif, currentUser.id]
  );

    // ── One-offs are shared: both people see the same list. ─────────────
  // One-offs with someone who has no account stay on this phone only.
  const dpMembersRef = useRef(members);
  dpMembersRef.current = members;
  const dpMeRef = useRef({ id: currentUser.id, userId: serverUserId });
  dpMeRef.current = { id: currentUser.id, userId: serverUserId };
  dpSyncRef.current = {
    push: (p?: DirectPayment) => {
      if (!p) return;
      const me = dpMeRef.current;
      if (!me.userId) return;
      const userOf = (mid: string) => (mid === me.id ? me.userId : dpMembersRef.current.find(m => m.id === mid)?.userId);
      const fromUserId = userOf(p.fromId);
      const toUserId = userOf(p.toId);
      if (!fromUserId || !toUserId) return;
      void api.saveDirectPayment({
        clientId: p.id, fromUserId, toUserId, amount: p.amount, currency: p.currency,
        reason: p.reason ?? "", comments: p.comments ?? null, category: p.category ?? null,
        meta: p.bill ? { billId: p.billId ?? p.bill.billId, bill: p.bill } : null,
      }).catch(() => {});
    },
    remove: (id: string, quiet?: boolean) => { void api.deleteDirectPaymentRemote(id, quiet).catch(() => {}); },
  };
  const syncDirectPayments = useCallback(async () => {
    const me = dpMeRef.current;
    if (!me.userId) return;
    let rows: Awaited<ReturnType<typeof api.listDirectPayments>>;
    try { rows = await api.listDirectPayments(); } catch { return; }
    // Upload one-offs that so far only exist on this phone.
    const known = new Set(rows.map(r => r.clientId));
    directPaymentsRef.current.filter(p => !known.has(p.id)).forEach(p => dpSyncRef.current.push(p));
    const memberOf = (uid: string) => (uid === me.userId ? me.id : dpMembersRef.current.find(m => m.userId === uid)?.id);
    const prev = directPaymentsRef.current;
    const byId = new Map(prev.map(p => [p.id, p]));
    let sawNew = false;
    for (const r of rows) {
      if (r.deletedAt) { byId.delete(r.clientId); continue; }
      const fromId = memberOf(r.fromUserId);
      const toId = memberOf(r.toUserId);
      if (!fromId || !toId) continue;
      const existing = byId.get(r.clientId);
      if (!existing && r.createdBy !== me.userId) sawNew = true;
      byId.set(r.clientId, {
        ...(existing ?? {}),
        id: r.clientId, fromId, toId, amount: Number(r.amount), currency: r.currency as DirectPayment["currency"],
        reason: r.reason, comments: r.comments ?? undefined, category: r.category ?? undefined,
        createdAt: existing?.createdAt ?? r.createdAt, updatedAt: r.updatedAt,
        ...(r.meta && (r.meta as { bill?: OneOffBill }).bill ? { billId: (r.meta as { billId?: string }).billId, bill: (r.meta as { bill: OneOffBill }).bill } : {}),
      } as DirectPayment);
    }
    const next = Array.from(byId.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    directPaymentsRef.current = next;
    setDirectPayments(next);
    persistDirectPayments(next);
    if (sawNew) setHasNewActivity(true);
  }, [persistDirectPayments]);
  useEffect(() => {
    if (!serverUserId) return;
    void syncDirectPayments();
    const t = setInterval(() => void syncDirectPayments(), 300_000);
    const offPush = onPush(d => { if (String(d.type ?? "").startsWith("direct_payment")) void syncDirectPayments(); });
    const appSub = DPAppState.addEventListener("change", st => { if (st === "active") void syncDirectPayments(); });
    return () => { clearInterval(t); offPush(); appSub.remove(); };
  }, [serverUserId, syncDirectPayments]);

  const deleteDirectPayment = useCallback(
    (id: string, quiet?: boolean) => {
      const target = directPayments.find(payment => payment.id === id);
      setDirectPayments(prev => {
        const updated = prev.filter(p => p.id !== id);
        AsyncStorage.setItem("@spliteasy_direct_payments", JSON.stringify(updated)).catch(() => {});
        return updated;
      });
      if (!quiet) pushNotif({
        type: "direct_payment_deleted",
        title: "One-off removed",
        body: target ? `${target.reason} was removed` : "A one-off payment was removed",
        deletedPayment: target,
        deletedById: currentUser.id,
      });
      setHasNewActivity(true);
      dpSyncRef.current.remove(id, quiet);
    },
    [directPayments, pushNotif, currentUser.id]
  );

  // Removed payments stay hidden through the undo window, even if a refresh lands.
  const pendingSettlementDeletes = useRef<Set<string>>(new Set());
  const deleteSettlement = useCallback(
    (id: string) => {
      pendingSettlementDeletes.current.add(id);
      const target = settlements.find(s => s.id === id);
      const updated = settlements.filter(s => s.id !== id);
      setSettlements(updated);
      saveData(members, groups, expenses, updated, invitations);
      let undone = false;
       const isInvolved = target ? isSettlementParticipant(target, currentUser.id) : false;
       if (target && isInvolved) {
        showToast("Payment removed — balance restored", "warning", {
          label: "Undo",
          onPress: () => {
            undone = true;
            setSettlements(prev => {
              if (prev.some(s => s.id === target.id)) return prev;
              const restored = [target, ...prev].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              );
              saveData(members, groups, expenses, restored, invitations);
              return restored;
            });
            const { id: _o1, createdAt: _o2, ...rest } = target;
            runServerSync(() => api.createSettlement(target.groupId, rest, stateRef.current.memberKeyMap), { errorMessage: "Couldn't restore settlement." });
          },
        });
        const grp = groups.find(g => g.id === target.groupId);
        pushNotif({
          type: "settlement_deleted",
          groupId: target.groupId,
          deletedSettlement: target,
          deletedById: currentUser.id,
          title: "Payment removed",
          body: `A ${target.amount.toFixed(2)} ${target.currency} settlement was removed${grp ? ` from ${grp.name}` : ""}`,
        });
      }
      setTimeout(() => {
        if (undone) return;
        runServerSync(() => api.deleteSettlement(id).finally(() => pendingSettlementDeletes.current.delete(id)), { errorMessage: "Couldn't delete settlement." });
      }, 4000);
    },
    [members, groups, expenses, settlements, invitations, saveData, showToast, pushNotif, runServerSync]
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
        inviterUserId: currentUser.id,
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
      runServerSync(
        () => api.createGroupInvitation(groupId, email, name || email.split("@")[0]),
        { errorMessage: "Couldn't send invite." },
      );
      return newInvite;
    },
    [members, groups, expenses, settlements, invitations, currentUser, saveData, runServerSync]
  );

  const sendAppInvitation = useCallback(
    async (email: string, name: string): Promise<boolean> => {
      try {
        await api.sendAppInvitation(email, name);
        return true;
      } catch (error) {
        showToast(toUserMessage(error, "Couldn't send invitation email."), "warning");
        return false;
      }
    },
    [showToast],
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
        memberIds: [invite.inviterUserId, currentUser.id],
        createdAt: invite.createdAt,
      };

      const updatedGroups = [newGroup, ...groups];
      const updatedInvitations = invitations.map(i =>
        i.id === invitationId ? { ...i, status: "accepted" as const } : i
      );

      setGroups(updatedGroups);
      setInvitations(updatedInvitations);
      saveData(members, updatedGroups, expenses, settlements, updatedInvitations);
      // Accept on the server via the invitation token, then reconcile.
      if (invite.token) {
        runServerSync(() => api.acceptInvitation(invite.token as string), { errorMessage: "Couldn't accept invite." });
      }
    },
    [members, groups, expenses, settlements, invitations, saveData, currentUser.id, runServerSync]
  );

  const declineInvitation = useCallback(
    (invitationId: string) => {
      const invite = invitations.find(i => i.id === invitationId);
      const updatedInvitations = invitations.filter(i => i.id !== invitationId);
      setInvitations(updatedInvitations);
      saveData(members, groups, expenses, settlements, updatedInvitations);
      if (invite?.token) {
        runServerSync(() => api.declineInvitation(invite.token as string), { errorMessage: "Couldn't decline invite." });
      }
    },
    [members, groups, expenses, settlements, invitations, saveData, runServerSync]
  );

  const getPendingInvitesForCurrentUser = useCallback(
    () => invitations.filter(
      i =>
        (i.invitedMemberId === currentUser.id ||
          (currentUser.email && i.invitedEmail.toLowerCase() === currentUser.email.toLowerCase())) &&
        i.status === "pending"
    ),
    [invitations, currentUser.id, currentUser.email]
  );

  const getGroupPendingInvites = useCallback(
    (groupId: string) =>
      invitations.filter(
        i => i.groupId === groupId && i.inviterUserId === currentUser.id && i.status === "pending"
      ),
    [invitations, currentUser.id]
  );

  const getGroupBalances = useCallback(
    (groupId: string): DebtRelation[] => {
      const group = groups.find(g => g.id === groupId);
      if (!group) return [];

      const groupExpenses = expenses.filter(e => e.groupId === groupId);
      const groupSettlements = settlements.filter(s => s.groupId === groupId);

      // Cent-exact maths lives in utils/balanceMath.ts (covered by tests).
      return computeGroupDebts({
        memberIds: group.memberIds,
        expenses: groupExpenses,
        settlements: groupSettlements,
        groupCurrency: group.currency,
        convert: (amount, from, to) => convertAmount(amount, from as Currency, to as Currency),
        simplify: group.simplifyDebtsEnabled !== false,
      });
    },
    [groups, expenses, settlements, convertAmount]
  );

  const getTotalOwed = useCallback(() => {
    const groupBalances = groups
      .filter(group => !group.isArchived)
      .map(group => ({
        currency: group.currency,
        debts: getGroupBalances(group.id),
      }));
    const summary = summarizeMemberGroupBalances(
      groupBalances,
      currentUser.id,
      convertCurrency,
    );

    return { ...summary, currency: defaultCurrency };
  }, [groups, getGroupBalances, convertCurrency, defaultCurrency, currentUser.id]);

  // Remember everyone we have ever seen, so history keeps real names after someone leaves or is removed.
  const memberNameCacheRef = useRef<Record<string, Member>>({});
  useEffect(() => {
    AsyncStorage.getItem("memberCache:v1").then(v => { if (v) memberNameCacheRef.current = { ...JSON.parse(v), ...memberNameCacheRef.current }; }).catch(() => {});
  }, []);
  useEffect(() => {
    let changed = false;
    for (const m of members) {
      const c = memberNameCacheRef.current[m.id];
      if (!c || c.name !== m.name || c.photo !== m.photo) {
        memberNameCacheRef.current[m.id] = { id: m.id, name: m.name, avatarColor: m.avatarColor, photo: m.photo, userId: m.userId } as Member;
        changed = true;
      }
    }
    if (changed) AsyncStorage.setItem("memberCache:v1", JSON.stringify(memberNameCacheRef.current)).catch(() => {});
  }, [members]);

  const getMemberById = useCallback(
    (id: string) => {
      const m = members.find(mem => mem.id === id);
      if (!m) return memberNameCacheRef.current[id];
      // currentUser.photo is the authoritative source — the members array from
      // the server may omit it. Always surface it for the current user.
      if (m.id === currentUser.id && !m.photo && currentUser.photo) {
        return { ...m, photo: currentUser.photo };
      }
      return m;
    },
    [members, currentUser]
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
      setGroupMessages(prev => {
        const next = [...prev, msg];
        saveMessages(next);
        return next;
      });
      void (async () => {
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            const saved = await api.createGroupMessage(groupId, currentUser.id, msg.text, stateRef.current.memberKeyMap);
            setGroupMessages(prev => {
              const already = !!saved?.id && prev.some(x => x.id === saved.id);
              const next = already
                ? prev.filter(x => x.id !== msg.id)
                : prev.map(x => (x.id === msg.id ? { ...x, id: saved?.id ?? x.id, failed: false } : x));
              saveMessages(next);
              return next;
            });
            return;
          } catch {
            await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          }
        }
        setGroupMessages(prev => {
          const next = prev.map(x => (x.id === msg.id ? { ...x, failed: true } : x));
          saveMessages(next);
          return next;
        });
        showToast("Message not sent. Check your connection.", "warning");
      })();
      return msg;
    },
    [currentUser.id, saveMessages, showToast]
  );

  const getGroupMessages = useCallback(
    (groupId: string) => groupMessages.filter(m => m.groupId === groupId),
    [groupMessages]
  );

  /**
   * Pull messages + per-member read cursors for a group from the server and
   * merge them into local state. This is what makes chat (and its read
   * receipts) visible across devices — messages sent by other members never
   * arrive any other way, since group messages aren't part of bootstrap.
   */
  const syncGroupMessages = useCallback(
    async (groupId: string) => {
      try {
        const [serverMessages, reads] = await Promise.all([
          api.listGroupMessages(groupId, stateRef.current.memberKeyMap),
          api.listGroupMessageReads(groupId, stateRef.current.memberKeyMap),
        ]);
        setGroupMessages(prev => {
          const byId = new Map(prev.map(m => [m.id, m]));
            const serverIds = new Set(serverMessages.map(m => m.id));
            for (const [k, m] of byId) {
              if (serverIds.has(k)) continue;
              const t = new Date(m.createdAt).getTime();
              if (serverMessages.some(sm => sm.memberId === m.memberId && sm.text === m.text && Math.abs(new Date(sm.createdAt).getTime() - t) < 120000)) byId.delete(k);
            }
            for (const m of serverMessages) byId.set(m.id, m);
          const merged = Array.from(byId.values()).sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          saveMessages(merged);
          return merged;
        });
        setGroupMessageReads(prev => ({ ...prev, [groupId]: reads }));
      } catch {
        // Offline or transient failure — keep showing the local/cached messages.
      }
    },
    [saveMessages]
  );

  /** Mark all messages in this group read-up-to-now for the current member. */
  const markGroupMessagesRead = useCallback(
    async (groupId: string) => {
      // Optimistic local update so my own "read" ticks on other members' devices
      // reflect instantly once they refetch, and my own UI doesn't wait on the network.
      const now = new Date().toISOString();
      setGroupMessageReads(prev => ({
        ...prev,
        [groupId]: { ...prev[groupId], [currentUser.id]: now },
      }));
      try {
        await api.markGroupMessagesRead(groupId);
      } catch {
        // Best-effort — the next syncGroupMessages call will reconcile the true cursor.
      }
    },
    [currentUser.id]
  );

  const addRecurringExpense = useCallback(
    (r: Omit<RecurringExpense, "id" | "createdAt">): RecurringExpense => {
      const newR: RecurringExpense = { ...r, id: genId(), createdAt: new Date().toISOString() };
      const updated = [...recurringExpenses, newR];
      setRecurringExpenses(updated);
      saveRecurring(updated);
      showToast(`Recurring "${r.description}" set up ✓`, "success");
      const grp = groups.find(g => g.id === r.groupId);
      pushNotif({
        type: "recurring_added",
        groupId: r.groupId,
        title: "Recurring schedule created",
        body: `"${r.description}" will repeat ${r.frequency}${grp ? ` in ${grp.name}` : ""}`,
      });
      runServerSync(
        () => api.createRecurring(r.groupId, r, stateRef.current.memberKeyMap),
        { errorMessage: "Couldn't create recurring schedule." },
      );
      return newR;
    },
    [recurringExpenses, saveRecurring, showToast, groups, pushNotif, runServerSync]
  );

  const updateRecurringExpense = useCallback(
    (id: string, updates: Partial<RecurringExpense>) => {
      const target = recurringExpenses.find(r => r.id === id);
      const updated = recurringExpenses.map(r => r.id === id ? { ...r, ...updates } : r);
      setRecurringExpenses(updated);
      saveRecurring(updated);
      if (target) {
        const grp = groups.find(g => g.id === target.groupId);
        pushNotif({
          type: "recurring_updated",
          groupId: target.groupId,
          title: "Recurring schedule updated",
          body: `"${target.description}" schedule was updated${grp ? ` in ${grp.name}` : ""}`,
        });
      }
      if (target) {
        const recurGroupId = target.groupId;
        runServerSync(
          () => api.updateRecurring(id, recurGroupId, updates, stateRef.current.memberKeyMap),
          { errorMessage: "Couldn't update recurring schedule." },
        );
      }
    },
    [recurringExpenses, saveRecurring, groups, pushNotif, runServerSync]
  );

  const deleteRecurringExpense = useCallback(
    (id: string) => {
      const target = recurringExpenses.find(r => r.id === id);
      const updated = recurringExpenses.filter(r => r.id !== id);
      setRecurringExpenses(updated);
      saveRecurring(updated);
      let undone = false;
      if (target) {
        showToast(`"${target.description}" schedule deleted`, "warning", {
          label: "Undo",
          onPress: () => {
            undone = true;
            setRecurringExpenses(prev => {
              if (prev.some(r => r.id === target.id)) return prev;
              const restored = [...prev, target];
              saveRecurring(restored);
              return restored;
            });
            const { id: _o1, createdAt: _o2, ...rest } = target;
            runServerSync(() => api.createRecurring(target.groupId, rest, stateRef.current.memberKeyMap), { errorMessage: "Couldn't restore recurring schedule." });
          },
        });
        const grp = groups.find(g => g.id === target.groupId);
        pushNotif({
          type: "recurring_deleted",
          groupId: target.groupId,
          title: "Recurring schedule removed",
          body: `"${target.description}" recurring schedule was deleted${grp ? ` from ${grp.name}` : ""}`,
        });
      }
      setTimeout(() => {
        if (undone) return;
        runServerSync(() => api.deleteRecurring(id), { errorMessage: "Couldn't delete recurring schedule." });
      }, 4000);
    },
    [recurringExpenses, saveRecurring, groups, pushNotif, showToast, runServerSync]
  );

  const saveNotifications = useCallback(async (notifs: AppNotification[]) => {
    try { await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifs)); } catch {}
  }, []);

  const markAllNotificationsRead = useCallback((silent = false) => {
    setNotifications(prev => {
      const previouslyUnread = prev.filter(n => !n.read).map(n => n.id);
      if (previouslyUnread.length === 0) return prev;
      const updated = prev.map(n => ({ ...n, read: true }));
      saveNotifications(updated);
      // Persist read state server-side (fire-and-forget; no refresh so the
      // optimistic read state and Undo window are preserved).
      api.markAllNotificationsRead().catch(() => {});
      // Silent mode: called from Activity tab cleanup — no toast needed because
      // the user just browsed through the feed and saw everything implicitly.
      if (!silent) {
        showToast(
          `${previouslyUnread.length} notification${previouslyUnread.length === 1 ? "" : "s"} marked read`,
          "info",
          {
            label: "Undo",
            onPress: () => {
              const unreadSet = new Set(previouslyUnread);
              setNotifications(cur => {
                const reverted = cur.map(n => (unreadSet.has(n.id) ? { ...n, read: false } : n));
                saveNotifications(reverted);
                return reverted;
              });
            },
          }
        );
      }
      return updated;
    });
  }, [saveNotifications, showToast]);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, read: true } : n);
      saveNotifications(updated);
      return updated;
    });
    api.markNotificationRead(id).catch(() => {});
  }, [saveNotifications]);

  const markNotificationUnread = useCallback((id: string) => {
    setNotifications(prev => {
      const updated = prev.map(n => n.id === id ? { ...n, read: false } : n);
      saveNotifications(updated);
      return updated;
    });
  }, [saveNotifications]);

  const dismissNotification = useCallback((id: string) => {
    // Add to the persistent dismissed set so that future bootstrap merges
    // don't re-surface this notification after an app restart.
    const updated = new Set(dismissedNotifIdsRef.current).add(id);
    dismissedNotifIdsRef.current = updated;
    AsyncStorage.setItem(DISMISSED_IDS_KEY, JSON.stringify([...updated])).catch(() => {});

    setNotifications(prev => {
      const filtered = prev.filter(n => n.id !== id);
      saveNotifications(filtered);
      return filtered;
    });
    // No dedicated dismiss endpoint; treat dismissal as "read" on the server.
    api.markNotificationRead(id).catch(() => {});
  }, [saveNotifications]);

  const dismissAllNotifications = useCallback(() => {
    setNotifications(prev => {
      if (prev.length === 0) return prev;
      const updatedDismissed = new Set(dismissedNotifIdsRef.current);
      prev.forEach(n => updatedDismissed.add(n.id));
      dismissedNotifIdsRef.current = updatedDismissed;
      AsyncStorage.setItem(DISMISSED_IDS_KEY, JSON.stringify([...updatedDismissed])).catch(() => {});
      saveNotifications([]);
      return [];
    });
  }, [saveNotifications]);

  const unreadNotificationCount = notifications.filter(n => !n.read).length;

  const checkAndAddRecurring = useCallback((): number => {
    const now = new Date();
    let added = 0;
    let updatedRecurring = [...recurringExpenses];
    let updatedExpenses = [...expenses];
    const firedSummaries: Array<{ description: string; amount: number; currency: string }> = [];

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
      if (r.endType === "date" && r.endDate && dateOnlyInTimeZone(due, r.timeZone) > r.endDate) {
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
        paymentDate: dateOnlyInTimeZone(due, r.timeZone),
        addedBy: currentUser.id,
        sourceRecurringId: r.id,
      };
      updatedExpenses = [newExpense, ...updatedExpenses];

      let nextDue = new Date(
        nextRecurringInstant(
          r.nextDueAt,
          r.frequency,
          r.frequency === "custom" ? r.customDays : undefined,
          r.timeZone,
        ),
      );
      while (nextDue <= now) {
        nextDue = new Date(
          nextRecurringInstant(
            nextDue.toISOString(),
            r.frequency,
            r.frequency === "custom" ? r.customDays : undefined,
            r.timeZone,
          ),
        );
      }

      // Deactivate if this was the last allowed occurrence
      const shouldDeactivate =
        (r.endType === "count" && r.endCount !== undefined && newCount >= r.endCount) ||
        (r.endType === "date" && r.endDate && dateOnlyInTimeZone(nextDue, r.timeZone) > r.endDate);

      updatedRecurring = updatedRecurring.map(rec =>
        rec.id === r.id
          ? { ...rec, nextDueAt: nextDue.toISOString(), occurrenceCount: newCount, isActive: !shouldDeactivate }
          : rec
      );
      firedSummaries.push({ description: r.description, amount: r.amount, currency: r.currency });
      added++;
    });

    if (added > 0) {
      setExpenses(updatedExpenses);
      setRecurringExpenses(updatedRecurring);
      saveData(members, groups, updatedExpenses, settlements, invitations);
      saveRecurring(updatedRecurring);
      showToast(`${added} recurring expense${added > 1 ? "s" : ""} added`, "success");
      // Server authoritatively creates due recurring expenses and advances the
      // schedules; refresh reconciles our optimistic local computation.
      runServerSync(() => api.runRecurring(), { silent: true });
      // Fire a local push notification for each triggered schedule so the user
      // knows a payment was added even when the app is in the background.
      firedSummaries.forEach(({ description, amount, currency }) => {
        Notifications.scheduleNotificationAsync({
          content: {
            title: "Recurring expense added",
            body: `${description} · ${currency} ${amount.toFixed(2)}`,
            data: { type: "recurring_fired" },
          },
          trigger: null,
        }).catch(() => {});
      });
    }

    return added;
  }, [recurringExpenses, expenses, members, groups, settlements, invitations, saveData, saveRecurring, showToast, runServerSync, currentUser.id]);

  const checkAndSendGroupReminders = useCallback(() => {
    const now = new Date();
    const newNotifs: AppNotification[] = [];
    groups.forEach(g => {
      const reminderDays = g.settleUpReminderDays;
      if (!reminderDays || reminderDays < 1) return;
      // Ended groups are archived automatically, but their unsettled balances
      // still need reminders. Ignore groups archived independently.
      if (g.isArchived && !g.isEnded) return;
      const reminderStartDate = g.isEnded && g.endedAt
        ? g.endedAt.slice(0, 10)
        : g.endDate;
      if (!reminderStartDate) return;

      const endDate = new Date(`${reminderStartDate}T23:59:59`);
      if (Number.isNaN(endDate.getTime())) return;
      const intervalMs = reminderDays * 24 * 60 * 60 * 1000;
      const firstReminder = new Date(endDate.getTime() + intervalMs);
      if (now < firstReminder) return;

      const debts = getGroupBalances(g.id);
      if (debts.length === 0) return;

      // Send the current due interval only. The stable id prevents duplicate
      // reminders when the activity screen refreshes repeatedly.
      const reminderNumber = Math.floor((now.getTime() - endDate.getTime()) / intervalMs);
      const stableId = `settle_reminder_${g.id}_${reminderNumber}`;
      const alreadyExists = notifications.some(n => n.id === stableId);
      if (alreadyExists) return;

      newNotifs.push({
        id: stableId,
        type: "settlement_reminder",
        groupId: g.id,
        title: `Settlement reminder — ${g.name}`,
        body: `${debts.length} unsettled ${debts.length === 1 ? "balance remains" : "balances remain"} in ${g.name}.`,
        createdAt: now.toISOString(),
        read: false,
      });
    });

    if (newNotifs.length > 0) {
      setNotifications(prev => {
        const updated = [...newNotifs, ...prev];
        saveNotifications(updated);
        return updated;
      });
      showToast(`${newNotifs.length} settlement reminder${newNotifs.length > 1 ? "s" : ""} sent`, "info");
    }
  }, [groups, notifications, getGroupBalances, saveNotifications, showToast]);

  // ── Foreground-resume: re-hydrate authoritative state from the server ──
  // On resume we re-fetch the bootstrap so any changes made elsewhere (or
  // server-side recurring runs) are reflected. A lock prevents concurrent runs.
  const showToastRef = useRef(showToast);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);

  const refreshFromServerRef = useRef(refreshFromServer);
  useEffect(() => { refreshFromServerRef.current = refreshFromServer; }, [refreshFromServer]);

  const appStateRef = useRef<AppStateStatus>((AppState.currentState ?? "active") as AppStateStatus);
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      if (prev.match(/inactive|background/) && nextState === "active") {
        if (recurringLockRef.current) return;
        recurringLockRef.current = true;
        try {
          await refreshFromServerRef.current();
        } finally {
          recurringLockRef.current = false;
        }
      }
    });
    return () => sub.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Something changed for you (a push arrived): refresh once instead of polling all the time.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = onPush(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { refreshFromServerRef.current(); }, 800);
    });
    return () => { off(); if (timer) clearTimeout(timer); };
  }, []);

  // While offline, poll every 15 s so the banner clears automatically the
  // moment connectivity is restored — no manual retry needed.
  useEffect(() => {
    if (!isOffline) return;
    const id = setInterval(() => { refreshFromServerRef.current(); }, 15_000);
    return () => clearInterval(id);
  }, [isOffline]);

  return (
    <AppContext.Provider
      value={{
        refreshFromServer,
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
        toggleSimplifyDebts,
        customCategories,
        addCustomCategory,
        notifPrefs,
        updateNotifPref,
        addMember,
        seedDemoFriends,
        removeMember,
        leaveGroupMember,
        addGroup,
        addGroupAsync,
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
        directPayments,
        addDirectPayment,
        seedDirectPayments,
        updateDirectPayment,
        deleteDirectPayment,
        sendGroupInvite,
        sendAppInvitation,
        acceptInvitation,
        declineInvitation,
        getPendingInvitesForCurrentUser,
        getGroupPendingInvites,
        getGroupBalances,
        getTotalOwed,
        getMemberById,
        getMemberKeyForGroup,
        getGroupById,
        getGroupExpenses,
        getGroupSettlements,
        groupMessages,
        addGroupMessage,
        getGroupMessages,
        groupMessageReads,
        syncGroupMessages,
        markGroupMessagesRead,
        recurringExpenses,
        addRecurringExpense,
        updateRecurringExpense,
        deleteRecurringExpense,
        checkAndAddRecurring,
        notifications,
        unreadNotificationCount,
        sendGroupReminder,
        markAllNotificationsRead,
        markNotificationRead,
        markNotificationUnread,
        dismissNotification,
        dismissAllNotifications,
        checkAndSendGroupReminders,
        isLoading,
        syncStatus,
        isOffline,
        clearSyncError,
        retrySync,
        hasNewActivity,
        clearNewActivity,
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
