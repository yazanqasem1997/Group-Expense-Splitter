export type ReceiptAllocationItem = {
  id: string;
  amount: number;
  claimedByMemberKeys: string[];
};

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

export function allocateProportionally(
  totals: Record<string, number>,
  amount: number,
  onlyMemberKeys?: string[],
) {
  if (amount === 0) return;
  const positive = Object.entries(totals).filter(([, value]) => value > 0);
  const targeted = onlyMemberKeys && onlyMemberKeys.length > 0
    ? positive.filter(([memberKey]) => onlyMemberKeys.includes(memberKey))
    : positive;
  // If none of the chosen people has anything on the bill, fall back to everyone
  // so the receipt still adds up to its total.
  const entries = targeted.length > 0 ? targeted : positive;
  const base = entries.reduce((sum, [, value]) => sum + value, 0);
  if (base <= 0 || entries.length === 0) return;

  let allocated = 0;
  entries.forEach(([memberKey, value], index) => {
    const share = index === entries.length - 1
      ? roundMoney(amount - allocated)
      : roundMoney(amount * value / base);
    allocated = roundMoney(allocated + share);
    totals[memberKey] = roundMoney((totals[memberKey] ?? 0) + share);
  });
}

export function buildReceiptMemberTotals({
  items,
  total,
  discount,
  discountMemberKeys,
  tax,
  tip,
}: {
  items: ReceiptAllocationItem[];
  total: number;
  discount: number;
  /** People the discount applies to (e.g. a voucher on one person's meal). Empty = everyone. */
  discountMemberKeys?: string[];
  tax: number;
  tip: number;
}): Record<string, number> {
  const positiveItems = items.filter(({ amount }) => amount > 0);
  const positiveSubtotal = positiveItems.reduce((sum, item) => sum + item.amount, 0);
  const baseTotal = total - discount - tax - tip;
  const scale = positiveSubtotal > 0 ? baseTotal / positiveSubtotal : 1;
  const lastPositiveItemId = positiveItems[positiveItems.length - 1]?.id;
  const memberTotals: Record<string, number> = {};
  let positiveAllocated = 0;

  items.forEach((item) => {
    const rawAllocated = item.amount > 0
      ? item.id === lastPositiveItemId
        ? roundMoney(baseTotal - positiveAllocated)
        : roundMoney(item.amount * scale)
      : item.amount;
    if (item.amount > 0) positiveAllocated = roundMoney(positiveAllocated + rawAllocated);

    const claimers = item.claimedByMemberKeys;
    const baseShare = claimers.length > 1
      ? roundMoney(rawAllocated / claimers.length)
      : rawAllocated;
    claimers.forEach((memberKey, memberIndex) => {
      const share = memberIndex === claimers.length - 1
        ? roundMoney(rawAllocated - baseShare * (claimers.length - 1))
        : baseShare;
      memberTotals[memberKey] = roundMoney((memberTotals[memberKey] ?? 0) + share);
    });
  });

  allocateProportionally(memberTotals, tax);
  allocateProportionally(memberTotals, tip);
  allocateProportionally(memberTotals, discount, discountMemberKeys);

  return memberTotals;
}