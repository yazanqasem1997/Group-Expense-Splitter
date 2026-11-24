import { Feather } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";

const CATEGORY_ICONS: Record<string, string> = {
  food: "coffee",
  transport: "navigation",
  accommodation: "home",
  entertainment: "film",
  utilities: "zap",
  shopping: "shopping-bag",
  health: "heart",
  other: "file-text",
  flight: "navigation",
  car: "navigation",
  train: "navigation",
  bus: "navigation",
  bicycle: "navigation",
  ferry: "navigation",
};

type GroupIconTarget = {
  name?: string;
  type?: string;
  emoji?: string;
};

const GROUP_ICON_RULES: { terms: string[]; icon: string }[] = [
  { terms: ["bill", "invoice", "utility", "utilities", "subscription", "rent", "lease", "mortgage", "tax"], icon: "file-text" },
  { terms: ["flat", "apartment", "house", "home", "roommate", "roommates", "villa", "housing", "moving"], icon: "home" },
  { terms: ["paris", "london", "dubai", "rome", "tokyo", "cairo", "amman", "new york", "nyc", "travel", "trip", "vacation", "holiday", "weekend", "tour", "hotel"], icon: "map-pin" },
  { terms: ["flight", "flights", "airport", "airline", "boarding"], icon: "navigation" },
  { terms: ["beach", "summer", "sun", "island", "seaside"], icon: "sun" },
  { terms: ["boat", "sailing", "cruise", "yacht", "sea"], icon: "anchor" },
  { terms: ["food", "foodie", "restaurant", "dinner", "lunch", "brunch", "breakfast", "cafe", "coffee"], icon: "coffee" },
  { terms: ["grocery", "groceries", "shopping", "mall", "market"], icon: "shopping-bag" },
  { terms: ["car", "cars", "drive", "driving", "road", "transport", "commute", "taxi"], icon: "truck" },
  { terms: ["work", "office", "business", "project", "freelance", "startup", "client"], icon: "briefcase" },
  { terms: ["school", "study", "university", "college", "course", "class", "exam", "books"], icon: "book-open" },
  { terms: ["music", "concert", "band", "festival", "gig"], icon: "music" },
  { terms: ["movie", "movies", "film", "cinema", "netflix", "series"], icon: "film" },
  { terms: ["gym", "fitness", "sport", "sports", "football", "soccer", "tennis", "yoga", "run", "running"], icon: "activity" },
  { terms: ["birthday", "wedding", "party", "celebration", "gift", "christmas", "eid"], icon: "gift" },
  { terms: ["couple", "date", "anniversary", "honeymoon"], icon: "heart" },
  { terms: ["family", "friends", "friend", "team", "club", "group"], icon: "users" },
  { terms: ["photo", "photos", "camera", "shoot"], icon: "camera" },
  { terms: ["conference", "event", "meetup", "meeting"], icon: "calendar" },
  { terms: ["repair", "renovation", "maintenance", "diy", "build"], icon: "tool" },
  { terms: ["internet", "wifi", "phone", "mobile", "software", "app"], icon: "monitor" },
  { terms: ["money", "finance", "bank", "savings", "budget", "cash"], icon: "credit-card" },
  { terms: ["health", "doctor", "medical", "medicine", "pharmacy"], icon: "heart" },
  { terms: ["pet", "pets", "dog", "cat"], icon: "smile" },
  { terms: ["world", "international", "abroad", "global"], icon: "globe" },
];

const LEGACY_GROUP_ICONS: Record<string, string> = {
  trip: "map-pin",
  home: "home",
  friends: "users",
  couple: "heart",
  other: "package",
  "✈️": "navigation",
  "🏠": "home",
  "🎉": "users",
  "💑": "heart",
  "📦": "package",
};

export function groupIconName({ name = "", type, emoji }: GroupIconTarget) {
  const normalizedName = name.toLowerCase().trim();
  const matchingRule = GROUP_ICON_RULES.find(rule =>
    rule.terms.some(term => normalizedName.includes(term.trim()))
  );
  return matchingRule?.icon ?? LEGACY_GROUP_ICONS[emoji ?? ""] ?? LEGACY_GROUP_ICONS[type ?? ""] ?? "users";
}

export function categoryIconName(category?: string) {
  return CATEGORY_ICONS[category ?? "other"] ?? CATEGORY_ICONS.other;
}

interface MonochromeIconTileProps {
  icon: string;
  size?: number;
  color: string;
  borderColor: string;
  backgroundColor?: string;
}

export function MonochromeIconTile({
  icon,
  size = 40,
  color,
  borderColor,
  backgroundColor = "transparent",
}: MonochromeIconTileProps) {
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: 4,
          backgroundColor,
          borderColor,
        },
      ]}
    >
      <Feather name={icon as any} size={size * 0.5} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0,
  },
});