import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { recordAiUsage } from "./aiUsage";
import type { ParsedReceipt, ParsedReceiptItem } from "./receiptParser";
import { reconcileParsedReceipt } from "./receiptParser";

/**
 * Receipt reading with Claude Haiku 5.5 (vision + structured JSON output).
 * Roughly $0.0005-0.0007 per receipt: about 2-3k input tokens (image + prompt)
 * at $0.10/MTok and ~600 output tokens at $0.50/MTok.
 */
const MODEL = "claude-haiku-5-5";

const CATEGORY_ENUM = ["food", "transport", "accommodation", "entertainment", "utilities", "shopping", "health", "other"];
const CATEGORY_HINT =
  "food = restaurants, cafes, groceries, delivery; transport = fuel, taxi, parking, tolls, flights; accommodation = hotels, rent; " +
  "entertainment = activities, tickets, cinema; utilities = electricity, water, phone, internet bills; " +
  "shopping = clothes, electronics, household goods; health = pharmacy, medical, personal care; other = anything else.";
const toCategory = (value: unknown): string | null =>
  typeof value === "string" && (CATEGORY_ENUM as string[]).includes(value) ? value : null;

const RECEIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_receipt", "merchant", "category", "date", "currency", "items", "subtotal", "tax", "tip", "service_charge", "fees", "tax_included", "discount", "rounding", "total"],
  properties: {
    is_receipt: { type: "boolean", description: "False if the image is not a purchase receipt or bill." },
    merchant: { type: ["string", "null"] },
    category: { type: "string", enum: CATEGORY_ENUM, description: "What kind of shop or bill this is overall. " + CATEGORY_HINT },
    date: { type: ["string", "null"], description: "Purchase date as YYYY-MM-DD, or null." },
    currency: { type: ["string", "null"], description: "ISO 4217 code (AED, SAR, USD, EUR, GBP...). Null only if it truly cannot be determined." },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "category", "quantity", "unit_price", "amount"],
        properties: {
          name: { type: "string" },
          category: { type: "string", enum: CATEGORY_ENUM, description: "Category of this line. " + CATEGORY_HINT },
          quantity: { type: ["number", "null"] },
          unit_price: { type: ["number", "null"] },
          amount: { type: ["number", "null"], description: "Line total as printed. Negative for line discounts/voids." },
        },
      },
    },
    subtotal: { type: ["number", "null"] },
    tax: { type: ["number", "null"], description: "VAT / sales tax amount (not the rate)." },
    tip: { type: ["number", "null"] },
    service_charge: { type: ["number", "null"], description: "Restaurant service charge, if any." },
    fees: {
      type: "array",
      description: "Delivery, service, platform, small-order, bag or packaging fees, each as printed. Empty if none.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "amount"],
        properties: { label: { type: "string" }, amount: { type: "number" } },
      },
    },
    tax_included: { type: "boolean", description: "True if item prices already include the tax/VAT shown (common in the UAE)." },
    discount: { type: ["number", "null"], description: "Bill-level discount as a POSITIVE number, or null." },
    rounding: { type: ["number", "null"], description: "Rounding adjustment (can be negative), or null." },
    total: { type: ["number", "null"], description: "Final amount charged, whatever it is called (Total, Grand total, Amount paid, Order total, Paid by card, Net payable). Null only if no final amount is printed." },
  },
} as const;

const SYSTEM_PROMPT = `You read photos of shop and restaurant receipts and return their contents as JSON.
Copy numbers exactly as printed; never invent or estimate a value. Use null for anything you cannot read.
List every purchased line item once, in printed order, with its printed line total. Do not list subtotal, tax, VAT, tip, service charge, discount, rounding, payment or change lines as items.
If the receipt shows VAT-inclusive prices, keep item amounts as printed and still report the VAT amount in "tax".
Currency: look everywhere (header, next to each price, totals, payment lines, footer). Convert symbols and abbreviations to the ISO code: AED, Dhs, DH, Dirham or د.إ -> AED; SAR, SR or ر.س -> SAR; QAR or QR -> QAR; KWD or KD -> KWD; BHD or BD -> BHD; OMR or RO -> OMR; £ -> GBP; € -> EUR; ₹ -> INR. If no currency is printed but the receipt is clearly from one country (address or city, phone code such as +971, a TRN tax number, "VAT 5%" in the UAE), use that country's currency.
Return the bill-level discount as a positive number (add up promo codes, vouchers and offers).
Delivery-app receipts (Talabat, Deliveroo, Careem, Noon, Uber Eats) often have no line called "Total": the final amount may be labelled "Amount paid", "Paid with card", "Grand total" or similar. Use that as "total". If no final amount is printed at all, return null for total; never compute it yourself.
Put delivery, service, platform, small-order, bag and packaging fees in "fees", not in "items". A rider/driver tip goes in "tip".`;

type HaikuReceipt = {
  is_receipt: boolean;
  merchant: string | null;
  category?: string;
  date: string | null;
  currency: string | null;
  items: { name: string; category?: string; quantity: number | null; unit_price: number | null; amount: number | null }[];
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  service_charge: number | null;
  fees: { label: string; amount: number }[];
  tax_included: boolean;
  discount: number | null;
  rounding: number | null;
  total: number | null;
};

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error("Receipt scanning is not configured (missing ANTHROPIC_API_KEY).");
  }
  client ??= new Anthropic();
  return client;
}

export function isAnthropicReceiptConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

const money = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;

function toItem(raw: HaikuReceipt["items"][number]): ParsedReceiptItem {
  const quantity = money(raw.quantity);
  const unitPrice = money(raw.unit_price);
  const amount = money(raw.amount);
  const calculated = quantity !== null && unitPrice !== null ? Math.round(quantity * unitPrice * 1000) / 1000 : null;
  const checkStatus: ParsedReceiptItem["checkStatus"] =
    calculated === null || amount === null
      ? "unavailable"
      : Math.abs(calculated - amount) <= 0.011
        ? "balanced"
        : "mismatch";
  return {
    name: (raw.name ?? "").trim() || "Item",
    category: toCategory(raw.category),
    amount,
    quantity,
    unitPrice,
    printedAmount: amount,
    calculatedAmount: calculated,
    confidence: null,
    sourceText: null,
    sourceBbox: null,
    checkStatus,
    uncertain: amount === null || checkStatus === "mismatch",
  };
}

const CURRENCY_ALIASES: Record<string, string> = {
  DHS: "AED", DH: "AED", DIRHAM: "AED", DIRHAMS: "AED", "د.إ": "AED",
  SR: "SAR", "ر.س": "SAR", QR: "QAR", KD: "KWD", BD: "BHD", RO: "OMR",
  "$": "USD", "US$": "USD", "€": "EUR", "£": "GBP", "₹": "INR",
};

/** Turns what the model returned ("Dhs", "AED", "£"...) into an ISO 4217 code, or null. */
export function normalizeCurrency(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const key = trimmed.toUpperCase().replace(/\s+/g, "").replace(/\.$/, "");
  const code = CURRENCY_ALIASES[key] ?? CURRENCY_ALIASES[trimmed] ?? key;
  return /^[A-Z]{3}$/.test(code) && code !== "DHS" ? code : null;
}

export type AnthropicReceiptResult = { parsed: ParsedReceipt; rawText: string; rawResponse: unknown };

export async function recognizeReceiptWithHaiku(image: Buffer, model: string = MODEL): Promise<AnthropicReceiptResult> {
  // ~1568px on the long edge is the most detail the model uses; larger only costs more.
  const prepared = await sharp(image)
    .rotate()
    .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();

  let response: Anthropic.Message;
  try {
    response = await anthropic().messages.create(
      {
        model,
        max_tokens: 4096,
        output_config: { effort: "low", format: { type: "json_schema", schema: RECEIPT_SCHEMA } },
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: prepared.toString("base64") } },
              { type: "text", text: "Read this receipt." },
            ],
          },
        ],
      },
      { timeout: 45_000 },
    );
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new Error("Receipt scanning is busy right now. Please try again in a minute.");
    }
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new Error("Receipt scanning is not configured correctly. Please contact support.");
    }
    throw error;
  }

  recordAiUsage("receipts", MODEL, response.usage);

  if (response.stop_reason === "refusal") throw new Error("We couldn't read that receipt. Please try another photo.");
  const text = response.content.flatMap(block => (block.type === "text" ? [block.text] : [])).join("");
  let data: HaikuReceipt;
  try {
    data = JSON.parse(text) as HaikuReceipt;
  } catch {
    throw new Error("We couldn't read that receipt. Please try another photo.");
  }
  if (!data.is_receipt) throw new Error("That photo doesn't look like a receipt. Please try another photo.");

  const items = (data.items ?? []).map(toItem);
  const subtotal = money(data.subtotal);
  const tax = money(data.tax);
  const tip = money(data.tip);
  const feeTotal = (data.fees ?? []).reduce((sum, fee) => sum + (money(fee.amount) ?? 0), 0);
  const serviceCharge = money((money(data.service_charge) ?? 0) + feeTotal) || null;
  const rounding = money(data.rounding);
  const discountValue = money(data.discount);
  // Stored as a positive amount; reconcileParsedReceipt subtracts it.
  const discount = discountValue === null ? null : Math.abs(discountValue);
  let taxIncluded = data.tax_included === true;

  // Delivery receipts often print no line called "Total". Then work it out from the
  // items, fees, tip and discounts, and ask the user to check it.
  let total = money(data.total);
  let totalWasCalculated = false;
  // qtyMaths: for "2 x Burger 12.00", decide by arithmetic whether 12.00 is the
  // line total or the price of one. Pick the reading that makes the items reach
  // the receipt's subtotal/total; record unit price so the app shows "2 × 6.00".
  {
    const target = subtotal ?? total ?? null;
    const multi = items.filter(it => (it.quantity ?? 1) > 1 && it.amount != null);
    if (target != null && multi.length > 0) {
      const asTotals = items.reduce((s, it) => s + (it.amount ?? 0), 0);
      const asUnits = items.reduce((s, it) => s + (it.amount ?? 0) * (((it.quantity ?? 1) > 1) ? (it.quantity as number) : 1), 0);
      const tol = Math.max(0.05, Math.abs(target) * 0.01);
      const unitsFit = Math.abs(asUnits - target) <= tol || (tax != null && Math.abs(asUnits + tax - target) <= tol);
      const totalsFit = Math.abs(asTotals - target) <= tol || (tax != null && Math.abs(asTotals + tax - target) <= tol);
      for (const it of multi) {
        const q = it.quantity as number;
        if (unitsFit && !totalsFit) {
          it.unitPrice = it.amount;
          it.amount = Math.round((it.amount as number) * q * 100) / 100;
        } else if (it.unitPrice == null) {
          it.unitPrice = Math.round(((it.amount as number) / q) * 100) / 100;
        }
      }
    }
  }
  const itemSum = items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  // vatByArithmetic: trust the numbers over the model's guess. If the items (plus
  // fees) already add up to the printed total, VAT is inside the prices; if they
  // only reach it once VAT is added, VAT is on top.
  if (total !== null && tax !== null && tax > 0 && itemSum > 0) {
    const extras = (tip ?? 0) + (serviceCharge ?? 0) + (rounding ?? 0) - (discount ?? 0);
    const tol = Math.max(0.05, total * 0.01);
    const inside = Math.abs(itemSum + extras - total) <= tol;
    const onTop = Math.abs(itemSum + extras + tax - total) <= tol;
    if (inside && !onTop) taxIncluded = true;
    else if (onTop && !inside) taxIncluded = false;
  }
  if (total === null && (itemSum > 0 || subtotal !== null)) {
    total = money(
      (subtotal ?? itemSum) + (taxIncluded ? 0 : tax ?? 0) + (tip ?? 0) + (serviceCharge ?? 0) + (rounding ?? 0) - (discount ?? 0),
    );
    totalWasCalculated = true;
  }
  // With VAT-inclusive prices the tax is already inside the items, so it is not added again when checking.
  const reconciliation = reconcileParsedReceipt(items, total, subtotal, taxIncluded ? null : tax, tip, discount, serviceCharge, rounding);
  if (totalWasCalculated) {
    reconciliation.reconciliationWarnings = [
      "No total was printed on this receipt, so it was calculated from the items, fees and discounts. Please check it.",
      ...reconciliation.reconciliationWarnings,
    ];
  }
  const currency = normalizeCurrency(data.currency);
  const receiptDate = data.date && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : null;

  const parsed: ParsedReceipt = {
    merchant: data.merchant?.trim() || null,
    category: toCategory(data.category),
    receiptDate,
    total,
    subtotal,
    tax,
    tip,
    discount,
    serviceCharge,
    rounding,
    currency,
    items,
    ocrLayout: [],
    // The model does not report calibrated confidence; use the arithmetic check instead.
    ocrConfidence: totalWasCalculated ? 70 : reconciliation.reconciliationStatus === "balanced" ? 95 : reconciliation.reconciliationStatus === "mismatch" ? 60 : 75,
    ...reconciliation,
  };
  return {
    parsed,
    rawText: text,
    rawResponse: { model: response.model, usage: response.usage, id: response.id },
  };
}
