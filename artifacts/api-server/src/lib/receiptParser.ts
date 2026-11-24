export type ReceiptBbox = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type ReceiptOcrWord = {
  text: string;
  confidence: number;
  bbox: ReceiptBbox;
};

export type ReceiptOcrLine = {
  text: string;
  confidence: number;
  bbox: ReceiptBbox;
};

export type ParsedReceiptItem = {
  category?: string | null;
  name: string;
  amount: number | null;
  quantity: number | null;
  unitPrice: number | null;
  printedAmount: number | null;
  calculatedAmount: number | null;
  confidence: number | null;
  sourceText: string | null;
  sourceBbox: ReceiptBbox | null;
  checkStatus: "balanced" | "mismatch" | "unavailable";
  uncertain: boolean;
};

export type ParsedReceipt = {
  category?: string | null;
  merchant: string | null;
  receiptDate: string | null;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  discount: number | null;
  serviceCharge: number | null;
  rounding: number | null;
  currency: string | null;
  items: ParsedReceiptItem[];
  ocrLayout: ReceiptOcrWord[];
  ocrConfidence: number;
  reconciliationStatus: "balanced" | "mismatch" | "insufficient";
  reconciliationDifference: number | null;
  reconciliationWarnings: string[];
};

export type OcrCandidate = {
  text: string;
  confidence: number;
  layoutLines: ReceiptOcrLine[];
  layoutWords: ReceiptOcrWord[];
};

type MoneyMatch = {
  value: number;
  raw: string;
  index: number;
};

const MONEY_TOKEN =
  /(?:[$€£¥₹₽د\.إ]\s*)?((?:[\dOoQqIl|]{1,3}(?:[.,][\dOoQqIl|]{3})+|[\dOoQqIl|]+)(?:[.,][\dOoQqIl|]{1,3})?)(?:\s*[$€£¥₹₽د\.إ])?/g;

const roundMoney = (value: number | null): number | null =>
  value == null || !Number.isFinite(value) ? null : Math.round(value * 1000) / 1000;

export function parseMoney(raw: string): number | null {
  let normalized = raw
    .replace(/[OoQq]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/[^\d,.-]/g, "");
  if (!normalized) return null;
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    normalized =
      lastComma > lastDot
        ? normalized.replace(/\./g, "").replace(",", ".")
        : normalized.replace(/,/g, "");
  } else if (lastComma !== -1) {
    const fractionDigits = normalized.length - lastComma - 1;
    normalized =
      fractionDigits <= 3 && fractionDigits > 0
        ? normalized.replace(",", ".")
        : normalized.replace(/,/g, "");
  } else if (lastDot !== -1) {
    const fractionDigits = normalized.length - lastDot - 1;
    if (fractionDigits > 3 || fractionDigits === 0) normalized = normalized.replace(/\./g, "");
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? roundMoney(value) : null;
}

function validMoneyMatch(line: string, match: RegExpMatchArray, value: number): boolean {
  const raw = match[0];
  const hasCurrency = /[$€£¥₹₽د\.إ]/.test(raw);
  const hasDecimalSeparator = /[.,]\s*[\dOoQqIl|]{1,3}/.test(raw);
  const beforeToken = line.slice(0, match.index ?? 0).trimEnd();
  if (value < 0 || value > 1_000_000) return false;
  if (
    !hasCurrency &&
    !hasDecimalSeparator &&
    (/\d$/.test(beforeToken) || !/[A-Za-zÀ-ÿ\u0600-\u06ff\u0400-\u04ff]/.test(beforeToken))
  ) {
    return false;
  }
  return true;
}

function moneyMatches(line: string): MoneyMatch[] {
  return [...line.matchAll(MONEY_TOKEN)]
    .map((match) => {
      const value = parseMoney(match[0]);
      return value == null || !validMoneyMatch(line, match, value)
        ? null
        : { value, raw: match[0], index: match.index ?? 0 };
    })
    .filter((match): match is MoneyMatch => match != null);
}

function cleanItemName(raw: string): string {
  return raw
    .replace(/^[\s*•·\-|:]+|[\s*•·\-|:]+$/g, "")
    .replace(/^\d{1,3}[.)]\s*/, "")
    .replace(/^\d+\s*[xX×]\s*/, "")
    .replace(/^\d{1,3}\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeItemName(name: string): boolean {
  if (!name || name.length < 2 || name.length > 140) return false;
  if (/^\d+$/.test(name)) return false;
  if (/\d{2}[./-]\d{2,4}/.test(name)) return false;
  if (/^(?:qty|quantity|price|item|description)$/i.test(name)) return false;
  return /[A-Za-zÀ-ÿ\u0600-\u06ff\u0400-\u04ff\u4e00-\u9fff]/.test(name);
}

function isSummaryLine(line: string): boolean {
  return /^(?:(?:sub\s*total|subtotal|totale\s+parziale|tax|vat|iva|mwst|tva|imposta|tip|gratuity|mancia|pourboire|discount|sconto|rabatt|remise|service\s+(?:charge|fee|tax)|total|totale|grand\s*total|amount\s*due|balance\s*due|to\s*pay|change|resto|cash|card|visa|mastercard|balance|rounding|arrotondamento|thank\s+you|goodbye|receipt|invoice|order|date|time|id)\b|\d+\s+(?:ospiti|guests?|person(?:s|a)?))\b/i.test(
    line,
  );
}

function currencyFromText(text: string): string | null {
  if (text.includes("€")) return "EUR";
  if (text.includes("£")) return "GBP";
  if (text.includes("$")) return "USD";
  if (text.includes("¥")) return "JPY";
  if (text.includes("₹")) return "INR";
  const match = text.match(/\b(EUR|USD|GBP|CHF|CAD|AUD|JPY|INR|AED|SAR|SEK|NOK|DKK|PLN|TRY)\b/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function parseQuantity(line: string): { quantity: number | null; explicitUnit: boolean } {
  const match = line.match(/^\s*([\dOoQqIl|]+(?:[.,][\dOoQqIl|]+)?)\s*(?:(x|×)\s*)?/i);
  if (!match) return { quantity: null, explicitUnit: false };
  const quantity = parseMoney(match[1]);
  return {
    quantity: quantity != null && quantity > 0 && quantity <= 10000 ? quantity : null,
    explicitUnit: Boolean(match[2]),
  };
}

function parseReceiptDate(lines: string[]): string | null {
  return (
    lines.find((line) => /\b\d{1,4}[./-]\d{1,2}[./-]\d{1,4}\b/.test(line)) ??
    lines.find((line) => /\b\d{1,2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{2,4}\b/.test(line)) ??
    null
  );
}

function labelValue(lines: string[], labels: RegExp): number | null {
  for (const line of lines) {
    if (!labels.test(line)) continue;
    const matches = moneyMatches(line);
    if (matches.length > 0) return matches[matches.length - 1].value;
  }
  return null;
}

function findBbox(lines: ReceiptOcrLine[], index: number): ReceiptBbox | null {
  return lines[index]?.bbox ?? null;
}

export function reconcileParsedReceipt(
  items: ParsedReceiptItem[],
  total: number | null,
  subtotal: number | null,
  tax: number | null,
  tip: number | null,
  discount: number | null,
  serviceCharge: number | null,
  rounding: number | null,
): Pick<ParsedReceipt, "reconciliationStatus" | "reconciliationDifference" | "reconciliationWarnings"> {
  const knownItems = items.filter((item) => item.amount != null);
  const warnings: string[] = [];
  if (knownItems.length !== items.length) warnings.push("One or more item prices could not be read.");
  if (total == null || knownItems.length === 0) {
    return {
      reconciliationStatus: "insufficient",
      reconciliationDifference: null,
      reconciliationWarnings: warnings.length > 0 ? warnings : ["A printed total or item amount is missing."],
    };
  }
  const itemSum = knownItems.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const base = subtotal ?? itemSum;
  const calculated =
    base +
    (tax ?? 0) +
    (tip ?? 0) +
    (serviceCharge ?? 0) +
    (rounding ?? 0) -
    (discount ?? 0);
  // vatInsidePrices: if the items (plus fees) already reach the printed total,
  // the VAT line is informational (prices include it) and must not be added again.
  let effective = calculated;
  if (tax != null && tax > 0) {
    const tol = Math.max(0.05, Math.abs(total) * 0.005);
    const withoutTax = calculated - tax;
    const inside = Math.abs(withoutTax - total) <= tol;
    const onTop = Math.abs(calculated - total) <= tol;
    if (inside && !onTop) effective = withoutTax;
  }
  const difference = roundMoney(total - effective) ?? 0;
  if (
    subtotal == null &&
    Math.abs(total - itemSum) > 0.02 &&
    tax == null &&
    tip == null &&
    discount == null &&
    serviceCharge == null &&
    rounding == null
  ) {
    warnings.push("The receipt may include an unrecognized charge or tax.");
  }
  if (Math.abs(difference) <= 0.02) {
    return {
      reconciliationStatus: warnings.length > 0 ? "mismatch" : "balanced",
      reconciliationDifference: difference,
      reconciliationWarnings: warnings,
    };
  }
  warnings.push(`Printed total differs from calculated total by ${difference.toFixed(3)}.`);
  return {
    reconciliationStatus: "mismatch",
    reconciliationDifference: difference,
    reconciliationWarnings: warnings,
  };
}

export function extractTesseractLayout(data: unknown): {
  lines: ReceiptOcrLine[];
  words: ReceiptOcrWord[];
} {
  const lines: ReceiptOcrLine[] = [];
  const words: ReceiptOcrWord[] = [];
  const blocks = (data as { blocks?: unknown[] } | null)?.blocks;
  if (!Array.isArray(blocks)) return { lines, words };
  for (const block of blocks) {
    const paragraphs = (block as { paragraphs?: unknown[] }).paragraphs;
    if (!Array.isArray(paragraphs)) continue;
    for (const paragraph of paragraphs) {
      const paragraphLines = (paragraph as { lines?: unknown[] }).lines;
      if (!Array.isArray(paragraphLines)) continue;
      for (const line of paragraphLines) {
        const typedLine = line as {
          text?: string;
          confidence?: number;
          bbox?: ReceiptBbox;
          words?: unknown[];
        };
        if (typedLine.text?.trim()) {
          lines.push({
            text: typedLine.text.trim(),
            confidence: Number(typedLine.confidence) || 0,
            bbox: typedLine.bbox ?? { x0: 0, y0: 0, x1: 0, y1: 0 },
          });
        }
        if (!Array.isArray(typedLine.words)) continue;
        for (const word of typedLine.words) {
          const typedWord = word as { text?: string; confidence?: number; bbox?: ReceiptBbox };
          if (typedWord.text?.trim()) {
            words.push({
              text: typedWord.text.trim(),
              confidence: Number(typedWord.confidence) || 0,
              bbox: typedWord.bbox ?? { x0: 0, y0: 0, x1: 0, y1: 0 },
            });
          }
        }
      }
    }
  }
  return { lines, words };
}

export function parseReceiptText(
  rawText: string,
  layoutLines: ReceiptOcrLine[] = [],
  layoutWords: ReceiptOcrWord[] = [],
  ocrConfidence = 0,
): ParsedReceipt {
  const lines = (layoutLines.length > 0 ? layoutLines.map((line) => line.text) : rawText.split(/\r?\n/))
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const total =
    labelValue(lines, /^(?:grand\s*)?(?:total|totale)\b(?!\s+(?:a\s+persona|per\s+persona))/i) ??
    labelValue(lines, /amount\s+due|balance\s+due|to\s+pay/i);
  const subtotal = labelValue(lines, /(?:sub\s*total|subtotal|totale\s+parziale|sous[-\s]total|zwischensumme)/i);
  const tax = labelValue(lines, /\b(?:tax|vat|iva|mwst|tva|imposta)\b/i);
  const tip = labelValue(lines, /\b(?:tip|gratuity|mancia|pourboire)\b/i);
  const discount = labelValue(lines, /\b(?:discount|sconto|rabatt|remise)\b/i);
  const serviceCharge = labelValue(lines, /\bservice\s+(?:charge|fee|tax)\b/i);
  const rounding = labelValue(lines, /\b(?:rounding|arrotondamento)\b/i);

  const items: ParsedReceiptItem[] = [];
  let pendingNameLines: string[] = [];
  let bodyStarted = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isSummaryLine(line)) {
      pendingNameLines = [];
      continue;
    }
    const matches = moneyMatches(line);
    if (matches.length === 0) {
      const candidateName = cleanItemName(line);
      if ((bodyStarted || index >= 2) && looksLikeItemName(candidateName)) pendingNameLines.push(candidateName);
      continue;
    }
    const amountMatch = matches[matches.length - 1];
    const { quantity, explicitUnit } = parseQuantity(line);
    const unitMatch = explicitUnit && matches.length > 1 ? matches[matches.length - 2] : null;
    const beforeAmount = cleanItemName(line.slice(0, unitMatch?.index ?? amountMatch.index));
    const wrappedName = pendingNameLines.length > 0 ? `${pendingNameLines.join(" ")} ` : "";
    const name = cleanItemName(`${wrappedName}${beforeAmount}`);
    pendingNameLines = [];
    if (!looksLikeItemName(name)) continue;

    const unitPrice =
      explicitUnit && matches.length > 1 ? matches[matches.length - 2].value : null;
    const calculatedAmount = quantity != null && unitPrice != null ? roundMoney(quantity * unitPrice) : null;
    const printedAmount = amountMatch.value;
    const checkStatus =
      calculatedAmount == null
        ? "unavailable"
        : Math.abs(calculatedAmount - printedAmount) <= 0.005
          ? "balanced"
          : "mismatch";
    const confidence = layoutLines[index]?.confidence || ocrConfidence || null;
    items.push({
      name,
      amount: printedAmount,
      quantity,
      unitPrice,
      printedAmount,
      calculatedAmount,
      confidence,
      sourceText: line,
      sourceBbox: findBbox(layoutLines, index),
      checkStatus,
      uncertain: confidence != null && confidence < 65,
    });
    bodyStarted = true;
  }

  const merchant =
    lines
      .slice(0, 6)
      .find((line) => !/\d/.test(line) && line.length >= 2 && !isSummaryLine(line)) ??
    null;
  const reconciliation = reconcileParsedReceipt(items, total, subtotal, tax, tip, discount, serviceCharge, rounding);
  return {
    merchant,
    receiptDate: parseReceiptDate(lines),
    total,
    subtotal,
    tax,
    tip,
    discount,
    serviceCharge,
    rounding,
    currency: currencyFromText(rawText),
    items,
    ocrLayout: layoutWords,
    ocrConfidence,
    ...reconciliation,
  };
}

export function scoreParsedReceipt(parsed: ParsedReceipt, confidence: number, rawText: string): number {
  const directRows = parsed.items.filter((item) => item.amount != null).length;
  const itemSum = parsed.items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  let score = directRows * 12 + Math.min(parsed.items.length, 20) * 4;
  if (parsed.total != null) score += 8;
  if (parsed.subtotal != null) score += 3;
  if (parsed.merchant) score += 2;
  score += Math.max(0, Math.min(confidence, 100)) / 20;
  if (parsed.total != null && itemSum > 0) {
    const difference = Math.abs(parsed.total - itemSum);
    if (difference <= 0.005) score += 10;
    else if (itemSum <= parsed.total + 0.005) score += 5;
    else score -= Math.min(12, difference / Math.max(parsed.total, 1) * 12);
  }
  if (rawText.length > 0 && parsed.reconciliationStatus === "balanced") score += 4;
  return score;
}

export function chooseParsedReceipt(candidates: OcrCandidate[]): {
  text: string;
  parsed: ParsedReceipt;
} {
  let best: { text: string; parsed: ParsedReceipt; score: number } | null = null;
  for (const candidate of candidates) {
    const parsed = parseReceiptText(
      candidate.text,
      candidate.layoutLines,
      candidate.layoutWords,
      candidate.confidence,
    );
    const score = scoreParsedReceipt(parsed, candidate.confidence, candidate.text);
    if (!best || score > best.score) best = { text: candidate.text, parsed, score };
  }
  return best ?? {
    text: "",
    parsed: parseReceiptText(""),
  };
}