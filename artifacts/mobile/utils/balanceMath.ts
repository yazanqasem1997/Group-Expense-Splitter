/**
 * Group balance and "who owes whom" maths.
 *
 * All results are computed in integer cents so that:
 *  - every member's net position adds up to exactly zero across the group,
 *  - suggested payments add up to exactly each member's net position, and
 *  - recording "Settle all" leaves the group at exactly 0.00 (no 0.01 ghosts).
 *
 * Self-contained on purpose (no imports) so Node's test runner can load it.
 */

export type BalanceEdge = {
  fromId: string;
  toId: string;
  amount: number;
};

export type LedgerSplit = { memberId: string; amount: number; paid?: number | null };
export type LedgerExpense = {
  /** Rate locked on the day of the payment (units of fxRateCurrency per 1 unit of currency). */
  fxRate?: number | null;
  fxRateCurrency?: string | null;
  amount: number;
  currency: string;
  paidById: string;
  splits: LedgerSplit[];
};
export type LedgerSettlement = {
  fromId: string;
  toId: string;
  amount: number;
  currency: string;
  fxRate?: number | null;
  fxRateCurrency?: string | null;
};
export type Converter = (amount: number, from: string, to: string) => number;

function toCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100 + (value >= 0 ? 1e-6 : -1e-6));
}

/**
 * Who paid how much for an expense. Multi-payer expenses carry `paid` on the
 * splits; otherwise the single payer paid the full amount.
 */
export function getExpensePaidAmounts(expense: LedgerExpense): Record<string, number> {
  const explicitPaid = expense.splits
    .filter(split => split.paid != null && split.paid > 0)
    .reduce<Record<string, number>>((amounts, split) => {
      amounts[split.memberId] = (amounts[split.memberId] ?? 0) + (split.paid ?? 0);
      return amounts;
    }, {});
  return Object.keys(explicitPaid).length > 0
    ? explicitPaid
    : { [expense.paidById]: expense.amount };
}

/**
 * Rounds raw (floating) balances to cents while keeping their total intact,
 * using the largest-remainder method. Independent rounding could leave the
 * group at +/-0.01 overall, which shows up as an unsettleable cent.
 */
export function roundBalancesToCents(raw: Record<string, number>): Record<string, number> {
  const ids = Object.keys(raw).sort();
  const scaled = ids.map(id => (Number.isFinite(raw[id]) ? raw[id] * 100 : 0));
  const floors = scaled.map(value => Math.floor(value + 1e-6));
  const target = Math.round(scaled.reduce((sum, value) => sum + value, 0) + 0);
  let extra = target - floors.reduce((sum, value) => sum + value, 0);
  const order = scaled
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let k = 0; extra > 0 && order.length > 0; k++, extra--) floors[order[k % order.length].index] += 1;
  const result: Record<string, number> = {};
  ids.forEach((id, index) => { result[id] = floors[index]; });
  return result;
}

/**
 * Net position of every member in the group currency, in integer cents.
 * Positive = the member is owed money; negative = the member owes money.
 * Expense and settlement lines involving people who are no longer members are
 * skipped on BOTH sides, so the group still nets to zero.
 */
export function computeNetBalanceCents(
  memberIds: string[],
  expenses: LedgerExpense[],
  settlements: LedgerSettlement[],
  groupCurrency: string,
  convert: Converter,
): Record<string, number> {
  const net: Record<string, number> = {};
  memberIds.forEach(id => { net[id] = 0; });
  ledgerTransfers(memberIds, expenses, settlements, groupCurrency, convert).forEach(({ creditor, debtor, cents }) => {
    net[creditor] += cents;
    net[debtor] -= cents;
  });
  Object.keys(net).forEach(id => { net[id] += 0; });
  return net;
}

/**
 * Minimal-ish set of payments that clears the given net balances (cents).
 * 1) Pay off exact matches first (a debtor owing exactly what a creditor is
 *    owed needs only one payment), then 2) greedily match the largest debtor
 *    with the largest creditor. Works in integers, so payments are exact.
 * Ties are broken by member id so the suggestion does not reshuffle on re-render.
 */
export function simplifyDebtCents(netCents: Record<string, number>): BalanceEdge[] {
  const creditors: { id: string; cents: number }[] = [];
  const debtors: { id: string; cents: number }[] = [];
  Object.keys(netCents).sort().forEach(id => {
    const cents = Math.round(netCents[id]);
    if (cents > 0) creditors.push({ id, cents });
    else if (cents < 0) debtors.push({ id, cents: -cents });
  });

  const result: BalanceEdge[] = [];
  const pay = (from: string, to: string, cents: number) => {
    if (cents > 0) result.push({ fromId: from, toId: to, amount: cents / 100 });
  };

  debtors.forEach(debtor => {
    const match = creditors.find(creditor => creditor.cents === debtor.cents && creditor.cents > 0);
    if (match) {
      pay(debtor.id, match.id, debtor.cents);
      match.cents = 0;
      debtor.cents = 0;
    }
  });

  const byAmount = (a: { id: string; cents: number }, b: { id: string; cents: number }) =>
    b.cents - a.cents || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const openCreditors = creditors.filter(c => c.cents > 0).sort(byAmount);
  const openDebtors = debtors.filter(d => d.cents > 0).sort(byAmount);
  let ci = 0;
  let di = 0;
  while (ci < openCreditors.length && di < openDebtors.length) {
    const credit = openCreditors[ci];
    const debt = openDebtors[di];
    const cents = Math.min(credit.cents, debt.cents);
    pay(debt.id, credit.id, cents);
    credit.cents -= cents;
    debt.cents -= cents;
    if (credit.cents === 0) ci++;
    if (debt.cents === 0) di++;
  }
  return result;
}

/** Backwards-compatible wrapper: accepts balances in currency units. */
export function simplifyDebts(netBalances: Record<string, number>): BalanceEdge[] {
  return simplifyDebtCents(roundBalancesToCents(netBalances));
}

/**
 * Raw pairwise debts (simplification OFF): who owes whom based only on the
 * expenses they actually shared, netted per pair, in cents.
 */
export function computePairwiseDebts(
  memberIds: string[],
  expenses: LedgerExpense[],
  settlements: LedgerSettlement[],
  groupCurrency: string,
  convert: Converter,
): BalanceEdge[] {
  // pair[a + NUL + b] > 0 means b owes a (a sorts before b).
  const pair = new Map<string, number>();
  ledgerTransfers(memberIds, expenses, settlements, groupCurrency, convert).forEach(({ creditor, debtor, cents }) => {
    if (creditor === debtor) return;
    const [a, b] = creditor < debtor ? [creditor, debtor] : [debtor, creditor];
    const key = a + "\u0000" + b;
    pair.set(key, (pair.get(key) ?? 0) + (creditor === a ? cents : -cents));
  });
  const result: BalanceEdge[] = [];
  [...pair.entries()].sort(([x], [y]) => (x < y ? -1 : 1)).forEach(([key, cents]) => {
    const [a, b] = key.split("\u0000");
    if (cents > 0) result.push({ fromId: b, toId: a, amount: cents / 100 });
    else if (cents < 0) result.push({ fromId: a, toId: b, amount: -cents / 100 });
  });
  return result;
}

/** One entry point for a group's outstanding debts. */
export function computeGroupDebts(params: {
  memberIds: string[];
  expenses: LedgerExpense[];
  settlements: LedgerSettlement[];
  groupCurrency: string;
  convert: Converter;
  simplify: boolean;
}): BalanceEdge[] {
  const { memberIds, expenses, settlements, groupCurrency, convert, simplify } = params;
  return simplify
    ? simplifyDebtCents(computeNetBalanceCents(memberIds, expenses, settlements, groupCurrency, convert))
    : computePairwiseDebts(memberIds, expenses, settlements, groupCurrency, convert);
}

/**
 * Returns a member's net position from pairwise debts:
 * positive means the member is owed money; negative means they owe money.
 */
export function getMemberNetPosition(debts: BalanceEdge[], memberId: string): number {
  const cents = debts.reduce((net, debt) => {
    if (debt.toId === memberId) return net + toCents(debt.amount);
    if (debt.fromId === memberId) return net - toCents(debt.amount);
    return net;
  }, 0);
  return cents / 100 + 0;
}

export function summarizeMemberGroupBalances(
  groups: { currency: string; debts: BalanceEdge[] }[],
  memberId: string,
  convertToPreferredCurrency: (amount: number, from: string) => number,
): { youOwe: number; youAreOwed: number } {
  let youOwe = 0;
  let youAreOwed = 0;

  groups.forEach(group => {
    const netPosition = getMemberNetPosition(group.debts, memberId);
    if (netPosition > 0.005) {
      youAreOwed += convertToPreferredCurrency(netPosition, group.currency);
    } else if (netPosition < -0.005) {
      youOwe += convertToPreferredCurrency(-netPosition, group.currency);
    }
  });

  return { youOwe, youAreOwed };
}

/**
 * A member's balance with each other member across several groups, converted
 * to one display currency. (Adding raw amounts from an AED group and a EUR
 * group together is meaningless, which is what the Friends tab used to do.)
 */
export function summarizeCounterpartyBalances(
  groups: { currency: string; debts: BalanceEdge[] }[],
  memberId: string,
  convertToPreferredCurrency: (amount: number, from: string) => number,
): Record<string, number> {
  const raw: Record<string, number> = {};
  groups.forEach(group => {
    group.debts.forEach(debt => {
      if (debt.fromId === memberId) {
        raw[debt.toId] = (raw[debt.toId] ?? 0) - convertToPreferredCurrency(debt.amount, group.currency);
      } else if (debt.toId === memberId) {
        raw[debt.fromId] = (raw[debt.fromId] ?? 0) + convertToPreferredCurrency(debt.amount, group.currency);
      }
    });
  });
  const result: Record<string, number> = {};
  Object.entries(raw).forEach(([id, value]) => { result[id] = toCents(value) / 100 + 0; });
  return result;
}

/** A record's amount in the group currency, using the rate locked on the record when it has one. */
function toGroupAmount(
  amount: number,
  currency: string,
  groupCurrency: string,
  convert: Converter,
  fxRate?: number | null,
  fxRateCurrency?: string | null,
): number {
  if (currency === groupCurrency) return amount;
  if (fxRate && fxRate > 0 && fxRateCurrency) {
    // Keep the rate locked on the day it happened. If the group has since
    // switched currency, move that locked value across with one rate (today's),
    // so everyone's shares keep the same proportions.
    const locked = amount * fxRate;
    return fxRateCurrency === groupCurrency ? locked : convert(locked, fxRateCurrency, groupCurrency);
  }
  return convert(amount, currency, groupCurrency);
}

/** Rounds amounts to whole cents (largest remainder) so they add up to exactly `targetCents`. */
function allocateCents(values: number[], targetCents: number): number[] {
  if (values.length === 0) return [];
  const scaled = values.map(value => (Number.isFinite(value) ? value * 100 : 0));
  const result = scaled.map(value => Math.floor(value + 1e-6));
  let extra = targetCents - result.reduce((sum, value) => sum + value, 0);
  const order = scaled
    .map((value, index) => ({ index, remainder: value - result[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let k = 0; extra > 0; k++, extra--) result[order[k % order.length].index] += 1;
  for (let k = 0; extra < 0; k++, extra++) result[order[order.length - 1 - (k % order.length)].index] -= 1;
  return result;
}

type Transfer = { creditor: string; debtor: string; cents: number };

/**
 * Every expense and settlement as whole-cent transfers in the group currency. Net
 * balances and "who owes whom" are both sums of these same transfers, so they always
 * agree to the cent. Lines for people no longer in the group are skipped on both sides.
 */
function ledgerTransfers(
  memberIds: string[],
  expenses: LedgerExpense[],
  settlements: LedgerSettlement[],
  groupCurrency: string,
  convert: Converter,
): Transfer[] {
  const members = new Set(memberIds);
  const transfers: Transfer[] = [];
  expenses.forEach(expense => {
    const paid = getExpensePaidAmounts(expense);
    const payerIds = Object.keys(paid);
    const totalPaid = payerIds.reduce((sum, id) => sum + paid[id], 0);
    if (!(totalPaid > 0)) return;
    const owing = expense.splits.filter(split => members.has(split.memberId));
    const shares = owing.map(split =>
      toGroupAmount(split.amount, expense.currency, groupCurrency, convert, expense.fxRate, expense.fxRateCurrency),
    );
    const sharesTotalCents = toCents(shares.reduce((sum, value) => sum + value, 0));
    // Older expenses could be saved a cent off their total (e.g. 1.67 x 3 for 5.00).
    // Balance against the real total so groups settle to exactly zero.
    const expenseTotalCents = owing.length === expense.splits.length
      ? toCents(toGroupAmount(expense.amount, expense.currency, groupCurrency, convert, expense.fxRate, expense.fxRateCurrency))
      : sharesTotalCents;
    const shareCents = allocateCents(
      shares,
      Math.abs(expenseTotalCents - sharesTotalCents) <= owing.length ? expenseTotalCents : sharesTotalCents,
    );
    owing.forEach((split, i) => {
      const portions = allocateCents(payerIds.map(id => (shareCents[i] * paid[id]) / totalPaid / 100), shareCents[i]);
      payerIds.forEach((payerId, j) => {
        if (members.has(payerId) && portions[j] !== 0) {
          transfers.push({ creditor: payerId, debtor: split.memberId, cents: portions[j] });
        }
      });
    });
  });
  settlements.forEach(settlement => {
    if (!members.has(settlement.fromId) || !members.has(settlement.toId)) return;
    const cents = toCents(
      toGroupAmount(settlement.amount, settlement.currency, groupCurrency, convert, settlement.fxRate, settlement.fxRateCurrency),
    );
    // Paying someone reduces what you owe them.
    if (cents !== 0) transfers.push({ creditor: settlement.fromId, debtor: settlement.toId, cents });
  });
  return transfers;
}
