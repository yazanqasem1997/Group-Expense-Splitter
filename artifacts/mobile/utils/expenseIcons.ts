/**
 * Keyword-based icon vocabulary.
 *
 * Given a stored category and (optionally) a free-text description, resolves
 * the most specific icon key available so visually distinct items — a bottle
 * of water vs. an electricity bill, a coffee vs. a burger — don't collapse
 * onto the same generic category icon.
 *
 * This only picks a *rendering* hint. It never changes the stored category,
 * the itemization bucket, or the spending chart series — see
 * `mainItemizationCategory` in spendingCategories.ts for that.
 */
import { isFoodAndBeverageDescription } from "./spendingCategories";

const GENERIC_ICON_CATEGORIES = new Set([
  "food",
  "transport",
  "accommodation",
  "entertainment",
  "utilities",
  "shopping",
  "health",
]);

type Subtype = { key: string; keywords: string[] };

const ARABIC = /[\u0600-\u06FF]/;
const wordPatterns = new Map<string, RegExp>();

/**
 * Whole-word matching, so "business" isn't a bus and "card" isn't a car. Plurals still
 * match ("burgers"). Arabic keywords match anywhere, since Arabic attaches prefixes.
 */
function matches(text: string, keywords: string[]): boolean {
  return keywords.some(kw => {
    if (ARABIC.test(kw)) return text.includes(kw);
    let pattern = wordPatterns.get(kw);
    if (!pattern) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      pattern = new RegExp("(^|[^a-z0-9])" + escaped + "(e?s)?($|[^a-z0-9])");
      wordPatterns.set(kw, pattern);
    }
    return pattern.test(text);
  });
}

const FOOD_SUBTYPES: Subtype[] = [
  {
    key: "coffee",
    keywords: [
      "coffee", "cafe", "café", "espresso", "americano", "cappuccino", "latte",
      "flat white", "macchiato", "mocha", "cortado", "karak", "matcha",
      "hot chocolate", "starbucks", "costa coffee",
    ],
  },
  {
    key: "alcohol",
    keywords: [
      "beer", "lager", "wine", "champagne", "prosecco", "cocktail", "mocktail",
      "whisky", "whiskey", "vodka", "gin", "rum", "tequila", "liquor",
      "spirits", "pint", "bar tab",
    ],
  },
  {
    key: "soft-drink",
    keywords: [
      "soft drink", "soda", "coke", "coca cola", "coca-cola", "pepsi",
      "sprite", "fanta", "seven up", "7up", "juice", "smoothie", "milkshake",
      "lemonade", "iced tea", "energy drink", "red bull",
    ],
  },
  {
    key: "groceries",
    keywords: [
      "groceries", "grocery", "supermarket", "hypermarket", "minimart",
      "convenience store", "carrefour", "spinneys", "waitrose", "lulu",
      "choithrams", "union coop",
    ],
  },
  {
    key: "dessert",
    keywords: [
      "dessert", "ice cream", "gelato", "cake", "donut", "doughnut",
      "pastry", "croissant", "bakery",
    ],
  },
];

const ACCOMMODATION_SUBTYPES: Subtype[] = [
  {
    key: "home-stay",
    keywords: [
      "apartment rental", "holiday apartment", "vacation rental",
      "villa rental", "chalet", "serviced apartment", "home stay", "homestay",
    ],
  },
];

const TRANSPORT_SUBTYPES: Subtype[] = [
  {
    key: "taxi",
    keywords: [
      "taxi", "cab", "uber", "careem", "bolt", "lyft", "free now", "black cab",
      "ride-hailing", "airport transfer", "limousine",
    ],
  },
  {
    key: "fuel",
    keywords: [
      "fuel", "petrol", "gasoline", "diesel", "gas station", "service station",
      "adnoc", "enoc", "eppco", "fill up",
    ],
  },
  {
    key: "parking",
    keywords: [
      "parking", "car park", "valet", "meter parking", "parking garage",
      "salik", "toll", "darb",
    ],
  },
];

const ENTERTAINMENT_SUBTYPES: Subtype[] = [
  {
    key: "cinema",
    keywords: [
      "cinema", "movie", "theatre", "theater", "opera", "comedy show",
      "imax", "reel cinemas", "vox cinemas",
    ],
  },
  {
    key: "museum",
    keywords: [
      "museum", "gallery", "exhibition", "monument", "palace", "castle",
      "historical site",
    ],
  },
  {
    key: "music",
    keywords: ["concert", "live music", "music festival", "gig", "dj event"],
  },
  {
    key: "sports",
    keywords: [
      "gym", "padel", "tennis", "football", "match ticket", "stadium",
      "ski pass", "fitness class", "yoga class", "crossfit", "pilates",
    ],
  },
  {
    key: "nightlife",
    keywords: ["nightclub", "club entry", "nightlife", "party", "lounge entry"],
  },
  {
    key: "tour",
    keywords: [
      "guided tour", "excursion", "sightseeing", "boat tour", "walking tour",
      "day trip",
    ],
  },
  {
    key: "ticket",
    keywords: [
      "admission", "entry ticket", "attraction ticket", "event ticket",
      "entrance fee", "theme park", "amusement park",
    ],
  },
];

const SHOPPING_SUBTYPES: Subtype[] = [
  {
    key: "clothing",
    keywords: [
      "clothing", "clothes", "shirt", "t-shirt", "trousers", "jeans",
      "jacket", "dress", "shoes", "trainers", "sneakers", "zara", "h&m",
      "uniqlo", "nike", "adidas",
    ],
  },
  {
    key: "electronics",
    keywords: [
      "electronics", "laptop", "computer", "tablet", "charger", "headphones",
      "camera", "apple store", "samsung", "sharaf dg", "emax", "iphone",
    ],
  },
  {
    key: "gift",
    keywords: ["gift", "present", "flowers", "greeting card"],
  },
];

const HEALTH_SUBTYPES: Subtype[] = [
  {
    key: "pharmacy",
    keywords: [
      "pharmacy", "chemist", "medicine", "medication", "tablets", "capsules",
      "prescription", "painkiller", "vitamins", "supplements",
    ],
  },
  {
    key: "medical",
    keywords: [
      "doctor", "clinic", "hospital", "dentist", "dental", "consultation",
      "treatment", "physiotherapy", "laboratory", "blood test", "mri",
    ],
  },
  {
    key: "salon",
    keywords: [
      "salon", "barber", "haircut", "hairdresser", "manicure", "pedicure",
      "grooming",
    ],
  },
  {
    key: "spa",
    keywords: ["spa", "massage", "facial", "wellness treatment"],
  },
  {
    key: "laundry",
    keywords: ["laundry", "dry cleaning", "laundromat", "ironing service"],
  },
  {
    key: "personal-care",
    keywords: [
      "toiletries", "toothpaste", "toothbrush", "deodorant", "shampoo",
      "conditioner", "soap", "skincare", "cosmetics", "makeup", "perfume",
    ],
  },
];

const UTILITIES_SUBTYPES: Subtype[] = [
  {
    key: "internet",
    keywords: ["internet", "broadband", "wifi", "fiber", "fibre", "router service"],
  },
  {
    key: "phone",
    keywords: [
      "phone bill", "mobile bill", "mobile plan", "sim plan", "data plan",
      "roaming package", "esim plan", "telecom bill",
    ],
  },
  {
    key: "gas",
    keywords: ["gas bill", "cooking gas", "natural gas", "gas utility"],
  },
];

const SUBTYPE_MAP: Record<string, Subtype[]> = {
  food: FOOD_SUBTYPES,
  accommodation: ACCOMMODATION_SUBTYPES,
  transport: TRANSPORT_SUBTYPES,
  entertainment: ENTERTAINMENT_SUBTYPES,
  shopping: SHOPPING_SUBTYPES,
  health: HEALTH_SUBTYPES,
  utilities: UTILITIES_SUBTYPES,
};

/** UAE brands and Arabic words, checked before the generic English keywords. */
const LOCAL_SUBTYPES: Record<string, Subtype[]> = {
  food: [
    { key: "groceries", keywords: ["carrefour", "lulu", "spinneys", "waitrose", "union coop", "choithrams", "kibsons", "instashop", "grandiose", "كارفور", "لولو", "بقالة", "سوبرماركت", "تعاونية"] },
    { key: "coffee", keywords: ["starbucks", "tim hortons", "caribou", "costa", "arabica", "قهوة", "كافيه", "ستاربكس"] },
    { key: "dessert", keywords: ["آيس كريم", "حلويات", "كنافة"] },
    { key: "water", keywords: ["مياه"] },
  ],
  transport: [
    { key: "taxi", keywords: ["careem", "uber", "hala", "yango", "bolt", "تاكسي", "أوبر"] },
    { key: "fuel", keywords: ["enoc", "adnoc", "eppco", "emarat", "petrol", "بنزين", "وقود"] },
    { key: "parking", keywords: ["salik", "darb", "mawaqif", "parkin", "سالك", "مواقف", "درب"] },
    { key: "flight", keywords: ["emirates", "etihad", "flydubai", "air arabia", "طيران"] },
    { key: "train", keywords: ["metro", "nol", "مترو"] },
  ],
  utilities: [
    { key: "internet", keywords: ["etisalat", "e&", "du home", "اتصالات", "انترنت"] },
    { key: "phone", keywords: ["du", "virgin mobile", "recharge", "شحن رصيد"] },
  ],
  shopping: [
    { key: "electronics", keywords: ["noon", "amazon", "sharaf dg", "jumbo", "نون"] },
    { key: "clothing", keywords: ["max fashion", "centrepoint", "zara", "h&m", "ملابس"] },
  ],
  health: [
    { key: "pharmacy", keywords: ["aster", "life pharmacy", "boots", "supercare", "صيدلية"] },
    { key: "salon", keywords: ["barber", "صالون", "حلاق"] },
  ],
  entertainment: [
    { key: "cinema", keywords: ["vox", "reel cinemas", "novo", "سينما"] },
    { key: "ticket", keywords: ["platinumlist", "img worlds", "ski dubai", "dubai parks"] },
  ],
};
for (const [cat, extra] of Object.entries(LOCAL_SUBTYPES)) SUBTYPE_MAP[cat] = [...extra, ...(SUBTYPE_MAP[cat] ?? [])];

/** Food delivery apps: show the meal icon even when nothing more specific matches. */
const DELIVERY_APPS = ["talabat", "deliveroo", "noon food", "careem food", "zomato", "طلبات", "ديليفرو"];

/**
 * Resolve the most specific icon key for a category + free-text description.
 * Falls back to the category itself (e.g. "food", "utilities") when nothing
 * more specific matches, and to non-generic categories (e.g. "flight", a
 * transport sub-type stored directly on the expense) unchanged.
 */
export function resolveIconKey(category: string | undefined, description?: string): string {
  const normalizedCategory = (category ?? "other").trim().toLowerCase();
  // An expense left as "Other" still gets a fitting icon when its description is recognisable.
  if (normalizedCategory === "other" && description) {
    const text = description.trim().toLowerCase();
    if (matches(text, DELIVERY_APPS)) return "food";
    for (const subtypes of Object.values(SUBTYPE_MAP)) {
      for (const subtype of subtypes) if (matches(text, subtype.keywords)) return subtype.key;
    }
  }
  if (!GENERIC_ICON_CATEGORIES.has(normalizedCategory)) return normalizedCategory;

  // Water must render as F&B/water regardless of whether the stored category
  // is still the legacy "utilities" value or the corrected "food" value.
  if (
    (normalizedCategory === "food" || normalizedCategory === "utilities") &&
    isFoodAndBeverageDescription(description)
  ) {
    return "water";
  }

  const text = (description ?? "").trim().toLowerCase();
  if (!text) return normalizedCategory;

  const subtypes = SUBTYPE_MAP[normalizedCategory];
  if (!subtypes) return normalizedCategory;
  for (const subtype of subtypes) {
    if (matches(text, subtype.keywords)) return subtype.key;
  }
  return normalizedCategory;
}
