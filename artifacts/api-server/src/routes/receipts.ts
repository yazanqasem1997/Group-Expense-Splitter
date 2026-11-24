import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { recordScan, scanUsage } from "../lib/plan";
import { Router, type IRouter } from "express";
import { sendPushToUsers } from "../lib/push";
import sharp from "sharp";
import { createWorker, PSM } from "tesseract.js";
import {
  db,
  groupMembersTable,
  receiptClaimsTable,
  receiptItemsTable,
  receiptSessionsTable,
} from "@workspace/db";
import {
  AddReceiptItemBody,
  CreateReceiptBody,
  CreateReceiptUploadUrlBody,
  GetReceiptResponse,
  LinkReceiptExpenseBody,
  ToggleReceiptClaimBody,
  UpdateReceiptBody,
  UpdateReceiptItemBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { getMembership } from "../lib/authz";
import { param } from "../lib/params";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import {
  chooseParsedReceipt as chooseRichParsedReceipt,
  extractTesseractLayout,
  parseReceiptText as parseRichReceiptText,
  type OcrCandidate as RichOcrCandidate,
  type ParsedReceipt as RichParsedReceipt,
} from "../lib/receiptParser";
import { isAnthropicReceiptConfigured, recognizeReceiptWithHaiku } from "../lib/anthropicReceipt";

export const parseReceiptText = parseRichReceiptText;
export const chooseParsedReceipt = chooseRichParsedReceipt;

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

type LegacyParsedReceipt = {
  merchant: string | null;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  currency: string | null;
  items: Array<{ name: string; amount: number }>;
};

type LegacyOcrCandidate = {
  text: string;
  confidence: number;
};

function numberValue(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMoney(raw: string): number | null {
  let normalized = raw
    .replace(/[OoQq]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/[^\d,.-]/g, "");
  if (!normalized) return null;
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    const fractionDigits = normalized.length - lastComma - 1;
    normalized =
      fractionDigits === 1 || fractionDigits === 2
        ? normalized.replace(",", ".")
        : normalized.replace(/,/g, "");
  } else if (lastDot !== -1) {
    const fractionDigits = normalized.length - lastDot - 1;
    if (fractionDigits !== 1 && fractionDigits !== 2) {
      normalized = normalized.replace(/\./g, "");
    }
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

type MoneyMatch = {
  value: number;
  raw: string;
  index: number;
};

const MONEY_TOKEN =
  /(?:[$€£]\s*)?((?:[\dOoQqIl|]{1,3}(?:[.,][\dOoQqIl|]{3})+|[\dOoQqIl|]+)(?:[.,][\dOoQqIl|]{1,2})?)(?:\s*[$€£])?/g;

function lastMoneyInLine(line: string): MoneyMatch | null {
  const matches = [...line.matchAll(MONEY_TOKEN)];
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    const raw = match[0];
    const value = parseMoney(raw);
    if (value == null || value < 0 || value > 1_000_000) continue;
    const hasCurrency = /[$€£]/.test(raw);
    const hasDecimalSeparator = /[.,]\s*[\dOoQqIl|]{1,2}/.test(raw);
    const beforeToken = line.slice(0, match.index ?? 0).trimEnd();
    // A bare number embedded after another number is usually a quantity,
    // product size, date, or OCR noise rather than the line price.
    if (
      !hasCurrency &&
      !hasDecimalSeparator &&
      (/\d$/.test(beforeToken) || !/[A-Za-zÀ-ÿ]/.test(beforeToken))
    ) {
      continue;
    }
    return {
      value,
      raw,
      index: match.index ?? 0,
    };
  }
  return null;
}

function moneyFromLine(line: string): number | null {
  return lastMoneyInLine(line)?.value ?? null;
}

function cleanItemName(raw: string): string {
  return raw
    .replace(/^[\s*•·\-|]+|[\s*•·\-|]+$/g, "")
    .replace(/^\d{1,3}[.)]\s*/, "")
    .replace(/^\d+\s*[xX×]\s*/, "")
    .replace(/^\d{1,3}\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeItemName(name: string): boolean {
  if (!name || name.length < 2 || name.length > 120) return false;
  if (/^\d+$/.test(name)) return false;
  if (/\d{2}[./-]\d{2,4}/.test(name)) return false;
  if (/^(?:qty|quantity|price|item|description)$/i.test(name)) return false;
  return /[a-zA-ZÀ-ÿ]/.test(name);
}

function isSummaryLine(line: string): boolean {
  return /^(?:(?:sub\s*total|subtotal|tax|vat|tip|service\s+(?:charge|fee|tax)|total|totale|grand\s*total|amount\s*due|balance\s*due|to\s*pay|change|cash|card|visa|mastercard|balance|discount|rounding|thank\s+you|goodbye|receipt|invoice|order|date|time|id)\b|\d+\s+(?:ospiti|guests?)\b)/i.test(line);
}

function currencyFromText(text: string): string | null {
  if (text.includes("€")) return "EUR";
  if (text.includes("£")) return "GBP";
  if (text.includes("$")) return "USD";
  const match = text.match(/\b(EUR|USD|GBP|CHF|CAD|AUD)\b/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function countDirectPriceLines(rawText: string): number {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => {
      if (isSummaryLine(line)) return false;
      const money = lastMoneyInLine(line);
      if (!money) return false;
      return looksLikeItemName(cleanItemName(line.slice(0, money.index)));
    }).length;
}

function scoreParsedReceipt(parsed: LegacyParsedReceipt, confidence: number, rawText: string): number {
  const itemSum = parsed.items.reduce((sum, item) => sum + item.amount, 0);
  // Directly named price rows are the strongest signal. This prevents a
  // sparse-text pass from winning merely because it pairs orphaned numbers
  // with the wrong neighboring item.
  let score = Math.min(countDirectPriceLines(rawText), 20) * 12;
  score += Math.min(parsed.items.length, 20) * 4;
  if (parsed.total != null) score += 8;
  if (parsed.subtotal != null) score += 3;
  if (parsed.tax != null) score += 1;
  if (parsed.tip != null) score += 1;
  if (parsed.merchant) score += 2;
  score += Math.max(0, Math.min(confidence, 100)) / 20;

  if (parsed.total != null && itemSum > 0) {
    const difference = Math.abs(parsed.total - itemSum);
    if (difference <= 0.05) score += 10;
    else if (itemSum <= parsed.total + 0.05) score += 5;
    else score -= Math.min(12, difference / Math.max(parsed.total, 1) * 12);
  }
  if (parsed.subtotal != null && itemSum > 0) {
    const difference = Math.abs(parsed.subtotal - itemSum);
    if (difference <= 0.05) score += 8;
    else if (itemSum <= parsed.subtotal + 0.05) score += 3;
  }
  return score;
}

function legacyChooseParsedReceipt(candidates: LegacyOcrCandidate[]): { text: string; parsed: LegacyParsedReceipt } {
  let best: { text: string; parsed: LegacyParsedReceipt; score: number } | null = null;
  for (const candidate of candidates) {
    const parsed = legacyParseReceiptText(candidate.text);
    const score = scoreParsedReceipt(parsed, candidate.confidence, candidate.text);
    if (!best || score > best.score) {
      best = { text: candidate.text, parsed, score };
    }
  }
  return best ?? { text: "", parsed: legacyParseReceiptText("") };
}

function legacyParseReceiptText(rawText: string): LegacyParsedReceipt {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const labelValue = (labels: RegExp): number | null => {
    for (const line of lines) {
      if (labels.test(line)) {
        const value = moneyFromLine(line);
        if (value != null) return value;
      }
    }
    return null;
  };

  const total =
    labelValue(/^(?:grand\s*)?(?:total|totale)\b(?!\s+a\s+persona)/i) ??
    labelValue(/amount\s+due|balance\s+due|to\s+pay/i);
  const subtotal = labelValue(/sub\s*total/i);
  const tax = labelValue(/\b(?:tax|vat)\b/i);
  const tip = labelValue(/\b(?:tip|service\s+charge)\b/i);

  const items: Array<{ name: string; amount: number }> = [];
  let pendingNameLines: string[] = [];
  let bodyStarted = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const money = lastMoneyInLine(line);
    if (isSummaryLine(line)) {
      pendingNameLines = [];
      continue;
    }

    if (!money) {
      const candidateName = cleanItemName(line);
      // The first couple of lines are normally the merchant/header. Collect
      // wrapped item text after that point so a price-only first item can still
      // use the item name from the preceding OCR line.
      if ((bodyStarted || index >= 2) && looksLikeItemName(candidateName)) {
        pendingNameLines.push(candidateName);
      }
      continue;
    }

    const beforePrice = cleanItemName(line.slice(0, money.index));
    const wrappedName = pendingNameLines.length > 0 ? `${pendingNameLines.join(" ")} ` : "";
    const name = cleanItemName(`${wrappedName}${beforePrice}`);
    pendingNameLines = [];

    if (!looksLikeItemName(name)) continue;
    bodyStarted = true;
    items.push({ name, amount: money.value });
  }

  if (items.length === 0 && total != null) {
    items.push({ name: "Receipt total", amount: total });
  }

  const merchant =
    lines
      .slice(0, 5)
      .find((line) => !/\d/.test(line) && line.length >= 2 && !isSummaryLine(line)) ??
    null;

  return {
    merchant,
    total,
    subtotal,
    tax,
    tip,
    currency: currencyFromText(rawText),
    items,
  };
}

export async function recognizeReceipt(image: Buffer): Promise<RichOcrCandidate[]> {
  const preparedImage = await sharp(image)
    .rotate()
    .resize({
      width: 2400,
      height: 5000,
      fit: "inside",
      withoutEnlargement: false,
    })
    .sharpen({ sigma: 1 })
    .png()
    .toBuffer();
  const worker = await createWorker("eng");
  try {
    const candidates: RichOcrCandidate[] = [];
    // Different segmentation modes recover different receipt layouts:
    // AUTO handles normal receipts, SINGLE_BLOCK handles tightly cropped
    // photos, and SPARSE_TEXT helps when the receipt has large gaps or folds.
    for (const psm of [PSM.AUTO, PSM.SINGLE_BLOCK, PSM.SPARSE_TEXT]) {
      await worker.setParameters({
        tessedit_pageseg_mode: psm,
        preserve_interword_spaces: "1",
      });
      const result = await worker.recognize(preparedImage);
      const layout = extractTesseractLayout(result.data);
      candidates.push({
        text: result.data.text,
        confidence: Number(result.data.confidence) || 0,
        layoutLines: layout.lines,
        layoutWords: layout.words,
      });
    }
    return candidates;
  } finally {
    await worker.terminate();
  }
}

async function loadReceipt(receiptId: string) {
  const [receipt] = await db
    .select()
    .from(receiptSessionsTable)
    .where(eq(receiptSessionsTable.id, receiptId))
    .limit(1);
  return receipt ?? null;
}

async function serializeReceipt(receiptId: string) {
  const receipt = await loadReceipt(receiptId);
  if (!receipt) return null;
  const [items, claims] = await Promise.all([
    db
      .select()
      .from(receiptItemsTable)
      .where(eq(receiptItemsTable.receiptId, receiptId))
      .orderBy(asc(receiptItemsTable.position)),
    db
      .select()
      .from(receiptClaimsTable)
      .where(
        inArray(
          receiptClaimsTable.receiptItemId,
          db
            .select({ id: receiptItemsTable.id })
            .from(receiptItemsTable)
            .where(eq(receiptItemsTable.receiptId, receiptId)),
        ),
      ),
  ]);
  const claimsByItem = new Map<string, string[]>();
  for (const claim of claims) {
    const existing = claimsByItem.get(claim.receiptItemId) ?? [];
    existing.push(claim.memberKey);
    claimsByItem.set(claim.receiptItemId, existing);
  }
  return GetReceiptResponse.parse({
    id: receipt.id,
    groupId: receipt.groupId,
    merchant: receipt.merchant,
    category: receipt.category,
    receiptDate: receipt.receiptDate,
    total: numberValue(receipt.parsedTotal),
    subtotal: numberValue(receipt.subtotal),
    tax: numberValue(receipt.tax),
    tip: numberValue(receipt.tip),
    discount: numberValue(receipt.discount),
    serviceCharge: numberValue(receipt.serviceCharge),
    rounding: numberValue(receipt.rounding),
    currency: receipt.currency,
    rawOcrText: receipt.rawOcrText,
    rawOcrResponse: receipt.rawOcrResponse,
    ocrLanguage: receipt.ocrLanguage,
    ocrConfidence: numberValue(receipt.ocrConfidence),
    ocrLayout: receipt.ocrLayout,
    reconciliationStatus: receipt.reconciliationStatus,
    reconciliationDifference: numberValue(receipt.reconciliationDifference),
    reconciliationWarnings: Array.isArray(receipt.reconciliationWarnings)
      ? receipt.reconciliationWarnings.filter((warning): warning is string => typeof warning === "string")
      : [],
    imageUrl: await objectStorage.getObjectEntityDownloadURL(receipt.imageObjectPath),
    linkedExpenseId: receipt.linkedExpenseId,
    status: receipt.status,
    createdAt: receipt.createdAt,
    updatedAt: receipt.updatedAt,
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      amount: numberValue(item.amount),
      quantity: numberValue(item.quantity),
      unitPrice: numberValue(item.unitPrice),
      printedAmount: numberValue(item.printedAmount),
      calculatedAmount: numberValue(item.calculatedAmount),
      confidence: numberValue(item.confidence),
      sourceText: item.sourceText,
      sourceBbox: item.sourceBbox,
      checkStatus: item.checkStatus,
      uncertain: item.uncertain,
      claimedByMemberKeys: claimsByItem.get(item.id) ?? [],
    })),
  });
}

async function requireReceiptMember(receiptId: string, userId: string) {
  const receipt = await loadReceipt(receiptId);
  if (!receipt) return { receipt: null, membership: null };
  const membership = await getMembership(receipt.groupId, userId);
  return { receipt, membership };
}

router.post(
  "/groups/:groupId/receipts/upload-url",
  requireAuth,
  async (req, res): Promise<void> => {
    const groupId = param(req, "groupId");
    const membership = await getMembership(groupId, req.localUser!.id);
    if (!membership) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    if (!membership.isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = CreateReceiptUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const target = await objectStorage.getObjectEntityUploadTarget();
    res.json({
      uploadURL: target.uploadURL,
      objectPath: target.objectPath,
      contentType: parsed.data.contentType,
    });
  },
);

router.post(
  "/groups/:groupId/receipts",
  requireAuth,
  async (req, res): Promise<void> => {
    const groupId = param(req, "groupId");
    const membership = await getMembership(groupId, req.localUser!.id);
    if (!membership) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    if (!membership.isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsedBody = CreateReceiptBody.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: parsedBody.error.message });
      return;
    }
    const body = parsedBody.data;
    if (!body.rawOcrText?.trim()) {
      const usage = await scanUsage(req.localUser!.id, groupId);
      if (usage.limit !== null && usage.used >= usage.limit) {
        res.status(402).json({ error: "You have used your " + usage.limit + " free scans this month. Go Plus for unlimited scans.", code: "scan_limit", usage });
        return;
      }
    }
    let rawOcrText = body.rawOcrText?.trim() ?? "";
    let ocrCandidates: RichOcrCandidate[] = rawOcrText
      ? [{ text: rawOcrText, confidence: 100, layoutLines: [], layoutWords: [] }]
      : [];
    let parsed: RichParsedReceipt | null = null;
    let rawOcrResponse: unknown = null;
    let ocrEngine = "eng";
    try {
      const image = await objectStorage.getObjectEntityFile(body.imageObjectPath);
      if (!rawOcrText) {
        const [buffer] = await image.download();
        await recordScan(req.localUser!.id);
        if (isAnthropicReceiptConfigured()) {
          try {
            let haiku = await recognizeReceiptWithHaiku(buffer);
            // needsSecondLook: if the fast read missed items (they don't add up to the
            // total, or nothing was itemised), re-read once with the stronger model.
            {
              const p = haiku.parsed as { items?: { amount?: number | null }[]; total?: number | null; subtotal?: number | null };
              const items = p.items ?? [];
              const sum = items.reduce((s, it) => s + (it.amount ?? 0), 0);
              const target = p.subtotal ?? p.total ?? null;
              const needsSecondLook = items.length === 0 || (target != null && target > 0 && Math.abs(sum - target) > Math.max(1, target * 0.03) && Math.abs(sum - (p.total ?? 0)) > Math.max(1, (p.total ?? 0) * 0.03));
              if (needsSecondLook) {
                try { haiku = await recognizeReceiptWithHaiku(buffer, "claude-sonnet-5-5"); } catch { /* keep the first read */ }
              }
            }
            parsed = haiku.parsed;
            rawOcrResponse = haiku.rawResponse;
            rawOcrText = haiku.rawText;
            ocrEngine = "claude-haiku";
          } catch (error) {
            // A photo that isn't a receipt is a user error; anything else falls back
            // to the free on-server reader so scanning still works during an outage.
            if (error instanceof Error && /doesn't look like a receipt/.test(error.message)) throw error;
            req.log?.warn?.(error, "Claude receipt reading failed; using local OCR");
          }
        }
        if (!parsed) {
          ocrCandidates = await recognizeReceipt(buffer);
          const selected = chooseRichParsedReceipt(ocrCandidates);
          rawOcrText = selected.text;
          parsed = selected.parsed;
        }
      }
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(400).json({ error: "Receipt image upload could not be found." });
        return;
      }
      req.log?.error?.(error, "Receipt OCR failed");
      res.status(422).json({
        error: error instanceof Error && error.message
          ? error.message
          : "We couldn't read that receipt. Please try another photo.",
      });
      return;
    }

    parsed ??= chooseRichParsedReceipt(ocrCandidates).parsed;
    const result = await db.transaction(async (tx) => {
      const [receipt] = await tx
        .insert(receiptSessionsTable)
        .values({
          groupId,
          createdByUserId: req.localUser!.id,
          imageObjectPath: body.imageObjectPath,
          contentType: body.contentType,
          rawOcrText,
          rawOcrResponse,
          ocrLanguage: ocrEngine,
          ocrConfidence: String(parsed.ocrConfidence),
          ocrLayout: parsed.ocrLayout,
          merchant: parsed.merchant,
          category: (parsed as { category?: string | null } | null)?.category ?? null,
          receiptDate: parsed.receiptDate,
          parsedTotal: parsed.total == null ? null : String(parsed.total),
          subtotal: parsed.subtotal == null ? null : String(parsed.subtotal),
          tax: parsed.tax == null ? null : String(parsed.tax),
          tip: parsed.tip == null ? null : String(parsed.tip),
          discount: parsed.discount == null ? null : String(parsed.discount),
          serviceCharge: parsed.serviceCharge == null ? null : String(parsed.serviceCharge),
          rounding: parsed.rounding == null ? null : String(parsed.rounding),
          currency: parsed.currency,
          reconciliationStatus: parsed.reconciliationStatus,
          reconciliationDifference:
            parsed.reconciliationDifference == null ? null : String(parsed.reconciliationDifference),
          reconciliationWarnings: parsed.reconciliationWarnings,
        })
        .returning();
      if (parsed.items.length > 0) {
        await tx.insert(receiptItemsTable).values(
          parsed.items.map((item, position) => ({
            receiptId: receipt!.id,
            position,
            name: item.name,
            category: (item as { category?: string | null }).category ?? null,
            amount: item.amount == null ? null : String(item.amount),
            quantity: item.quantity == null ? null : String(item.quantity),
            unitPrice: item.unitPrice == null ? null : String(item.unitPrice),
            printedAmount: item.printedAmount == null ? null : String(item.printedAmount),
            calculatedAmount: item.calculatedAmount == null ? null : String(item.calculatedAmount),
            confidence: item.confidence == null ? null : String(item.confidence),
            sourceText: item.sourceText,
            sourceBbox: item.sourceBbox,
            checkStatus: item.checkStatus,
            uncertain: item.uncertain,
          })),
        );
      }
      return receipt!;
    });
    // The app was closed or backgrounded mid-scan: tell them it's ready.
    if (!res.socket || res.socket.destroyed) {
      void sendPushToUsers([req.localUser!.id], {
        title: "Receipt ready",
        body: "Your receipt is scanned. Tap to split it.",
        data: { type: "receipt_ready", receiptId: result.id, groupId },
      }).catch(() => {});
    }
    res.status(201).json(await serializeReceipt(result.id));
  },
);

// The newest receipt this user scanned in a group since a moment in time.
// Lets the app pick up a scan that finished while it was in the background.
router.get(
  "/groups/:groupId/receipts/latest",
  requireAuth,
  async (req, res): Promise<void> => {
    const groupId = param(req, "groupId");
    const m = await getMembership(groupId, req.localUser!.id);
    if (!m || !m.isMember) { res.status(404).json({ error: "Group not found" }); return; }
    const sinceMs = Number(req.query.since ?? 0);
    const since = new Date(Number.isFinite(sinceMs) ? sinceMs - 5000 : 0);
    const [row] = await db
      .select({ id: receiptSessionsTable.id })
      .from(receiptSessionsTable)
      .where(and(
        eq(receiptSessionsTable.groupId, groupId),
        eq(receiptSessionsTable.createdByUserId, req.localUser!.id),
        gte(receiptSessionsTable.createdAt, since),
      ))
      .orderBy(desc(receiptSessionsTable.createdAt))
      .limit(1);
    if (!row) { res.status(404).json({ error: "Not ready" }); return; }
    res.json({ id: row.id });
  },
);

router.get(
  "/receipts/:receiptId",
  requireAuth,
  async (req, res): Promise<void> => {
    const receiptId = param(req, "receiptId");
    const { receipt, membership } = await requireReceiptMember(receiptId, req.localUser!.id);
    if (!receipt) {
      res.status(404).json({ error: "Receipt not found" });
      return;
    }
    if (!membership?.isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    res.json(await serializeReceipt(receiptId));
  },
);

router.patch(
  "/receipts/:receiptId",
  requireAuth,
  async (req, res): Promise<void> => {
    const receiptId = param(req, "receiptId");
    const { receipt, membership } = await requireReceiptMember(receiptId, req.localUser!.id);
    if (!receipt) {
      res.status(404).json({ error: "Receipt not found" });
      return;
    }
    if (!membership?.isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = UpdateReceiptBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    await db
      .update(receiptSessionsTable)
      .set({
        ...(parsed.data.merchant !== undefined ? { merchant: parsed.data.merchant } : {}),
        ...(parsed.data.total !== undefined
          ? { parsedTotal: parsed.data.total == null ? null : String(parsed.data.total) }
          : {}),
        ...(parsed.data.subtotal !== undefined
          ? { subtotal: parsed.data.subtotal == null ? null : String(parsed.data.subtotal) }
          : {}),
        ...(parsed.data.tax !== undefined
          ? { tax: parsed.data.tax == null ? null : String(parsed.data.tax) }
          : {}),
        ...(parsed.data.tip !== undefined
          ? { tip: parsed.data.tip == null ? null : String(parsed.data.tip) }
          : {}),
        ...(parsed.data.currency !== undefined ? { currency: parsed.data.currency } : {}),
        ...(parsed.data.receiptDate !== undefined ? { receiptDate: parsed.data.receiptDate } : {}),
        ...(parsed.data.discount !== undefined
          ? { discount: parsed.data.discount == null ? null : String(parsed.data.discount) }
          : {}),
        ...(parsed.data.serviceCharge !== undefined
          ? { serviceCharge: parsed.data.serviceCharge == null ? null : String(parsed.data.serviceCharge) }
          : {}),
        ...(parsed.data.rounding !== undefined
          ? { rounding: parsed.data.rounding == null ? null : String(parsed.data.rounding) }
          : {}),
      })
      .where(eq(receiptSessionsTable.id, receiptId));
    res.json(await serializeReceipt(receiptId));
  },
);

router.get(
  "/receipts/:receiptId/image",
  requireAuth,
  async (req, res): Promise<void> => {
    const receiptId = param(req, "receiptId");
    const { receipt, membership } = await requireReceiptMember(receiptId, req.localUser!.id);
    if (!receipt) {
      res.status(404).json({ error: "Receipt not found" });
      return;
    }
    if (!membership?.isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    try {
      const file = await objectStorage.getObjectEntityFile(receipt.imageObjectPath);
      const response = await objectStorage.downloadObject(file, 600);
      res.status(200);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      const buffer = await response.arrayBuffer();
      res.end(Buffer.from(buffer));
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Receipt image not found" });
        return;
      }
      res.status(500).json({ error: "Receipt image could not be loaded" });
    }
  },
);

router.patch(
  "/receipts/:receiptId/items/:itemId",
  requireAuth,
  async (req, res): Promise<void> => {
    const receiptId = param(req, "receiptId");
    const itemId = param(req, "itemId");
    const { receipt, membership } = await requireReceiptMember(receiptId, req.localUser!.id);
    if (!receipt) {
      res.status(404).json({ error: "Receipt not found" });
      return;
    }
    if (!membership?.isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = UpdateReceiptItemBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [item] = await db
      .update(receiptItemsTable)
      .set({
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.amount !== undefined
          ? { amount: parsed.data.amount == null ? null : String(parsed.data.amount) }
          : {}),
        ...(parsed.data.quantity !== undefined
          ? { quantity: parsed.data.quantity == null ? null : String(parsed.data.quantity) }
          : {}),
        ...(parsed.data.unitPrice !== undefined
          ? { unitPrice: parsed.data.unitPrice == null ? null : String(parsed.data.unitPrice) }
          : {}),
      })
      .where(and(eq(receiptItemsTable.id, itemId), eq(receiptItemsTable.receiptId, receiptId)))
      .returning();
    if (!item) {
      res.status(404).json({ error: "Receipt item not found" });
      return;
    }
    res.json(await serializeReceipt(receiptId));
  },
);

router.post(
  "/receipts/:receiptId/items",
  requireAuth,
  async (req, res): Promise<void> => {
    const receiptId = param(req, "receiptId");
    const { receipt, membership } = await requireReceiptMember(receiptId, req.localUser!.id);
    if (!receipt) {
      res.status(404).json({ error: "Receipt not found" });
      return;
    }
    if (!membership?.isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = AddReceiptItemBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const existingItems = await db
      .select({ id: receiptItemsTable.id })
      .from(receiptItemsTable)
      .where(eq(receiptItemsTable.receiptId, receiptId));
    await db.insert(receiptItemsTable).values({
      receiptId,
      position: existingItems.length,
      name: parsed.data.name,
      amount: parsed.data.amount == null ? null : String(parsed.data.amount),
      quantity: parsed.data.quantity == null ? null : String(parsed.data.quantity),
      unitPrice: parsed.data.unitPrice == null ? null : String(parsed.data.unitPrice),
      printedAmount: parsed.data.amount == null ? null : String(parsed.data.amount),
      checkStatus: "unavailable",
      uncertain: true,
    });
    res.status(201).json(await serializeReceipt(receiptId));
  },
);

router.delete(
  "/receipts/:receiptId/items/:itemId",
  requireAuth,
  async (req, res): Promise<void> => {
    const receiptId = param(req, "receiptId");
    const itemId = param(req, "itemId");
    const { receipt, membership } = await requireReceiptMember(receiptId, req.localUser!.id);
    if (!receipt) {
      res.status(404).json({ error: "Receipt not found" });
      return;
    }
    if (!membership?.isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const [item] = await db
      .select({ id: receiptItemsTable.id })
      .from(receiptItemsTable)
      .where(and(eq(receiptItemsTable.id, itemId), eq(receiptItemsTable.receiptId, receiptId)))
      .limit(1);
    if (!item) {
      res.status(404).json({ error: "Receipt item not found" });
      return;
    }
    await db.delete(receiptItemsTable).where(eq(receiptItemsTable.id, itemId));
    const remaining = await db
      .select({ id: receiptItemsTable.id })
      .from(receiptItemsTable)
      .where(eq(receiptItemsTable.receiptId, receiptId))
      .orderBy(asc(receiptItemsTable.position));
    for (const [position, remainingItem] of remaining.entries()) {
      await db
        .update(receiptItemsTable)
        .set({ position })
        .where(eq(receiptItemsTable.id, remainingItem.id));
    }
    res.json(await serializeReceipt(receiptId));
  },
);

router.post(
  "/receipts/:receiptId/claims/toggle",
  requireAuth,
  async (req, res): Promise<void> => {
    const receiptId = param(req, "receiptId");
    const { receipt, membership } = await requireReceiptMember(receiptId, req.localUser!.id);
    if (!receipt) {
      res.status(404).json({ error: "Receipt not found" });
      return;
    }
    if (!membership?.isMember || !membership.member?.memberKey) {
      res.status(403).json({ error: "Only a signed-in group member can claim items." });
      return;
    }
    const parsed = ToggleReceiptClaimBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const itemId = parsed.data.itemId;
    const [item] = await db
      .select()
      .from(receiptItemsTable)
      .where(and(eq(receiptItemsTable.id, itemId), eq(receiptItemsTable.receiptId, receiptId)))
      .limit(1);
    if (!item) {
      res.status(404).json({ error: "Receipt item not found" });
      return;
    }
    const memberKey = parsed.data.memberKey ?? membership.member.memberKey;
    const [targetMember] = await db
      .select({ memberKey: groupMembersTable.memberKey })
      .from(groupMembersTable)
      .where(
        and(
          eq(groupMembersTable.groupId, receipt.groupId),
          eq(groupMembersTable.memberKey, memberKey),
        ),
      )
      .limit(1);
    if (!targetMember) {
      res.status(400).json({ error: "That person is not a member of this group." });
      return;
    }
    const [existing] = await db
      .select()
      .from(receiptClaimsTable)
      .where(
        and(
          eq(receiptClaimsTable.receiptItemId, itemId),
          eq(receiptClaimsTable.memberKey, memberKey),
        ),
      )
      .limit(1);
    if (existing) {
      await db.delete(receiptClaimsTable).where(eq(receiptClaimsTable.id, existing.id));
    } else {
      await db.insert(receiptClaimsTable).values({ receiptItemId: itemId, memberKey });
    }
    res.json(await serializeReceipt(receiptId));
  },
);

router.post(
  "/receipts/:receiptId/link-expense",
  requireAuth,
  async (req, res): Promise<void> => {
    const receiptId = param(req, "receiptId");
    const { receipt, membership } = await requireReceiptMember(receiptId, req.localUser!.id);
    if (!receipt) {
      res.status(404).json({ error: "Receipt not found" });
      return;
    }
    if (!membership?.isMember) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = LinkReceiptExpenseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    await db
      .update(receiptSessionsTable)
      .set({ linkedExpenseId: parsed.data.expenseId, status: "linked" })
      .where(eq(receiptSessionsTable.id, receiptId));
    res.json(await serializeReceipt(receiptId));
  },
);

export default router;