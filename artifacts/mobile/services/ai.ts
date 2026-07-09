/**
 * AI service — auto-categorization (keyword-based, instant, offline)
 * + receipt scanning stub (API-ready, swap in any vision LLM below).
 */

export type CategorySuggestion = {
  category: string;
  confidence: "high" | "medium" | "low";
};

export interface ReceiptData {
  description: string;
  amount: number;
  category: string;
}

const KEYWORD_MAP: Record<string, string[]> = {
  food: [
    "restaurant", "cafe", "coffee", "pizza", "sushi", "ramen", "burger", "kebab",
    "sandwich", "lunch", "dinner", "breakfast", "brunch", "bar", "drinks", "beer",
    "wine", "cocktail", "grocery", "supermarket", "market", "takeout", "takeaway",
    "delivery", "doordash", "ubereats", "grubhub", "just eat", "food", "eat",
    "snack", "bakery", "boulangerie", "croissant", "dessert", "ice cream",
  ],
  transport: [
    "uber", "lyft", "taxi", "cab", "bus", "train", "metro", "subway", "tram",
    "flight", "airline", "airport", "gas", "fuel", "petrol", "parking", "toll",
    "ferry", "boat", "bike", "scooter", "rental car", "car hire", "car rental",
    "transport", "transit", "ticket", "rail", "amtrak", "eurostar", "blablacar",
  ],
  accommodation: [
    "hotel", "airbnb", "hostel", "motel", "apartment", "rent", "lodge", "inn",
    "villa", "resort", "guesthouse", "b&b", "bed and breakfast", "accommodation",
    "stay", "room", "suite", "booking.com", "hotels.com", "expedia",
  ],
  entertainment: [
    "movie", "cinema", "theater", "concert", "ticket", "show", "theme park",
    "museum", "gallery", "exhibit", "game", "sport", "netflix", "spotify",
    "streaming", "club", "nightclub", "event", "festival", "comedy", "opera",
    "escape room", "bowling", "karaoke", "mini golf", "arcade",
  ],
  utilities: [
    "electricity", "water", "gas bill", "internet", "wifi", "broadband", "phone",
    "subscription", "insurance", "utility", "bill", "cable", "mobile", "sim",
    "icloud", "google one", "dropbox",
  ],
  shopping: [
    "amazon", "ebay", "etsy", "shop", "store", "clothes", "clothing", "shoes",
    "mall", "outlet", "gift", "purchase", "buy", "market", "ikea", "zara",
    "h&m", "apple store", "electronics", "appliance", "furniture",
  ],
  health: [
    "pharmacy", "chemist", "doctor", "physician", "hospital", "clinic",
    "medicine", "prescription", "gym", "fitness", "yoga", "spa", "massage",
    "dental", "dentist", "optician", "vision", "health", "wellness",
  ],
};

export function suggestCategory(description: string): CategorySuggestion {
  if (!description || description.trim().length < 2) {
    return { category: "other", confidence: "low" };
  }
  const lower = description.toLowerCase();
  for (const [cat, keywords] of Object.entries(KEYWORD_MAP)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        return { category: cat, confidence: "high" };
      }
    }
  }
  return { category: "other", confidence: "low" };
}

/**
 * Parse a receipt image and extract expense data.
 *
 * TODO: Replace the stub below with a real LLM vision API call.
 *
 * Recommended options (all cheap):
 *   • OpenAI   — gpt-4o-mini  (multimodal, $0.15/1M tokens input)
 *   • Anthropic — claude-3-haiku  ($0.25/1M tokens)
 *   • Google   — gemini-1.5-flash (free tier available)
 *
 * Example OpenAI call:
 *   const response = await fetch("https://api.openai.com/v1/chat/completions", {
 *     method: "POST",
 *     headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
 *     body: JSON.stringify({
 *       model: "gpt-4o-mini",
 *       messages: [{
 *         role: "user",
 *         content: [
 *           { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
 *           { type: "text", text:
 *             'Extract from this receipt: merchant name, total amount (number only), ' +
 *             'and category (one of: food, transport, accommodation, entertainment, utilities, shopping, health, other). ' +
 *             'Respond as JSON: {"description":"...","amount":0,"category":"..."}' }
 *         ]
 *       }],
 *       max_tokens: 100,
 *     }),
 *   });
 *   const json = await response.json();
 *   return JSON.parse(json.choices[0].message.content);
 */
export async function parseReceipt(_imageUri: string): Promise<ReceiptData> {
  await new Promise(r => setTimeout(r, 1200));
  return { description: "", amount: 0, category: "other" };
}
