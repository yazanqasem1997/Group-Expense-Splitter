/**
 * AI service — auto-categorization (keyword-based, instant, offline).
 *
 * Transport sub-categories (flight / car / train / bus / bicycle / ferry) must
 * appear BEFORE the generic "transport" entry so they match first.
 */

import { isFoodAndBeverageDescription } from "@/utils/spendingCategories";

export type CategorySuggestion = {
  category: string;
  confidence: "high" | "medium" | "low";
};

const KEYWORD_MAP: Record<string, string[]> = {
  food: [
    "restaurant", "resto", "cafe", "café", "coffee", "espresso", "latte", "cappuccino",
    "pizza", "sushi", "ramen", "burger", "kebab", "shawarma", "falafel", "hummus",
    "biryani", "curry", "noodles", "pho", "tacos", "burrito", "pasta", "steak",
    "sandwich", "salad", "wrap", "lunch", "dinner", "breakfast", "brunch", "iftar",
    "suhoor", "bar", "pub", "drinks", "beer", "wine", "cocktail", "juice", "boba",
    "bubble tea", "karak", "chai", "grocery", "groceries", "supermarket", "hypermarket",
    "market", "takeout", "takeaway", "take away", "delivery", "doordash", "ubereats",
    "uber eats", "grubhub", "just eat", "deliveroo", "talabat", "zomato", "careem eats",
    "noon food", "instashop", "food", "eat", "snack", "snacks", "bakery", "boulangerie",
    "croissant", "dessert", "ice cream", "gelato", "cake", "donut", "doughnut",
    "mcdonalds", "mcdonald's", "kfc", "starbucks", "subway", "dominos", "domino's",
    "papa johns", "hardees", "five guys", "shake shack", "nandos", "nando's",
    "carrefour", "spinneys", "lulu", "waitrose", "choithrams", "union coop", "geant",
    "west zone", "viva", "aldi", "lidl", "tesco", "walmart", "costco", "whole foods",
    "trader joe", "bbq", "barbecue", "grill", "buffet", "brasserie", "canteen",
  ],

  // ── Transport sub-categories (most specific first) ───────────────────────
  flight: [
    // Common words
    "plane", "aircraft", "aviation", "fly", "flying", "flew", "air travel",
    "air ticket", "plane ticket", "boarding pass",
    // Branded / specific
    "flight", "airline", "airfare", "airport",
    "emirates airlines", "etihad", "flydubai", "air arabia", "qatar airways",
    "ryanair", "easyjet", "lufthansa", "british airways", "air france", "klm",
    "turkish airlines", "singapore airlines", "cathay pacific", "united airlines",
    "american airlines", "delta", "southwest",
  ],
  car: [
    // Common words
    "car", "vehicle", "automobile", "auto", "drive", "driving", "drove",
    // Ride-hailing
    "uber", "lyft", "careem", "bolt", "taxi", "cab", "rideshare", "ride share",
    // Car rental
    "rental car", "car hire", "car rental", "hertz", "avis", "budget rental",
    // Fuel & maintenance
    "gas", "fuel", "petrol", "diesel", "adnoc", "enoc", "eppco", "shell", "aral",
    "fill up", "gas station", "petrol station",
    "car wash", "valet", "oil change", "tyre", "tire", "mechanic", "garage",
    "registration", "vignette", "car insurance", "mot",
    // Road charges
    "parking", "salik", "toll", "darb", "rta",
    // Other
    "blablacar", "road trip",
  ],
  train: [
    // Common words
    "train", "rail", "railway", "tram", "metro", "underground", "tube",
    "subway ride", "light rail", "commuter rail", "high speed rail",
    // Named services
    "amtrak", "eurostar", "nol card", "mrt", "bart", "intercity rail",
  ],
  bus: [
    "bus", "coach", "shuttle bus", "intercity bus", "greyhound", "flixbus",
    "minibus", "megabus", "national express",
  ],
  bicycle: [
    "bike", "bicycle", "cycling", "scooter", "lime", "e-bike", "e-scooter",
    "electric scooter", "motorbike", "motorcycle", "moped",
  ],
  ferry: [
    "ferry", "boat", "abra", "cruise", "water taxi", "ship", "sailing", "nautical",
  ],
  transport: [
    "transport", "transit", "commute", "rideshare",
  ],
  // ────────────────────────────────────────────────────────────────────────

  accommodation: [
    "hotel", "airbnb", "hostel", "motel", "apartment", "rent", "lease", "lodge",
    "inn", "villa", "resort", "guesthouse", "b&b", "bed and breakfast",
    "accommodation", "stay", "room", "suite", "booking.com", "booking",
    "hotels.com", "expedia", "agoda", "marriott", "hilton", "rotana", "address",
    "atlantis", "checkin", "check-in", "chalet", "camp", "glamping", "staycation",
  ],
  entertainment: [
    "movie", "cinema", "vox", "reel", "novo", "imax", "theater", "theatre",
    "concert", "gig", "show", "theme park", "waterpark", "aquapark", "ferrari world",
    "img world", "wild wadi", "aquaventure", "museum", "gallery", "exhibit", "expo",
    "game", "gaming", "playstation", "xbox", "steam", "nintendo", "sport", "match",
    "netflix", "spotify", "anghami", "shahid", "osn", "disney", "hulu", "youtube premium",
    "prime video", "streaming", "twitch", "club", "nightclub", "event", "festival",
    "comedy", "opera", "ballet", "escape room", "bowling", "karaoke", "mini golf",
    "arcade", "billiards", "paintball", "go kart", "karting", "zoo", "aquarium",
    "safari", "desert safari", "yacht", "beach club", "pool day", "padel", "golf",
  ],
  utilities: [
    "electricity", "sewage", "dewa", "sewa", "addc", "fewa", "gas bill",
    "internet", "wifi", "broadband", "fiber", "fibre", "etisalat", "e&", "du",
    "virgin mobile", "phone", "mobile", "sim", "recharge", "top up", "topup",
    "subscription", "insurance", "premium", "utility", "utilities", "bill", "bills",
    "cable", "landline", "icloud", "google one", "dropbox", "office 365",
    "microsoft 365", "chatgpt", "claude", "vpn", "hosting", "domain", "cleaning",
    "maid", "laundry", "dry clean", "maintenance", "plumber", "electrician", "ac service",
  ],
  shopping: [
    "amazon", "noon", "namshi", "shein", "temu", "aliexpress", "ebay", "etsy",
    "shop", "store", "boutique", "clothes", "clothing", "shoes", "sneakers",
    "trainers", "abaya", "kandura", "mall", "dubai mall", "mall of the emirates",
    "yas mall", "city centre", "outlet", "gift", "present", "purchase", "buy",
    "ikea", "home centre", "homebox", "pan emirates", "ace", "zara", "h&m", "uniqlo",
    "nike", "adidas", "mango", "next", "primark", "apple store", "sharaf dg",
    "jumbo", "emax", "virgin megastore", "electronics", "gadget", "appliance",
    "furniture", "decor", "stationery", "bookstore", "kinokuniya", "toys", "perfume",
    "makeup", "sephora", "cosmetics", "jewellery", "jewelry", "watch", "eyewear",
  ],
  health: [
    "pharmacy", "chemist", "boots", "life pharmacy", "aster", "medicine",
    "prescription", "doctor", "physician", "gp", "hospital", "clinic", "medcare",
    "mediclinic", "nmc", "checkup", "check-up", "lab test", "x-ray", "xray", "mri",
    "scan", "vaccine", "vaccination", "gym", "fitness", "fitness first", "gymnation",
    "crossfit", "pilates", "yoga", "spa", "massage", "physio", "physiotherapy",
    "chiropractor", "dental", "dentist", "orthodontist", "optician", "optical",
    "glasses", "lenses", "vision", "health", "wellness", "vitamins", "supplements",
    "protein", "salon", "barber", "haircut", "grooming",
  ],
};

export function suggestCategory(description: string): CategorySuggestion {
  if (!description || description.trim().length < 2) {
    return { category: "other", confidence: "low" };
  }
  const lower = description.toLowerCase();
  if (isFoodAndBeverageDescription(lower)) {
    return { category: "food", confidence: "high" };
  }
  for (const [cat, keywords] of Object.entries(KEYWORD_MAP)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        return { category: cat, confidence: "high" };
      }
    }
  }
  return { category: "other", confidence: "low" };
}
