import React from "react";
import { Text, TextStyle } from "react-native";
import { Currency } from "@/context/AppContext";

const SYMBOLS: Record<Currency, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "CA$",
  AUD: "A$",
  JPY: "¥",
  INR: "₹",
  AED: "AED ",
};

interface AmountTextProps {
  amount: number;
  currency?: Currency;
  style?: TextStyle;
  showSign?: boolean;
  positiveColor?: string;
  negativeColor?: string;
}

export function AmountText({
  amount,
  currency = "USD",
  style,
  showSign = false,
  positiveColor,
  negativeColor,
}: AmountTextProps) {
  const symbol = SYMBOLS[currency] ?? "$";
  const abs = Math.abs(amount);
  const isNeg = amount < 0;
  const sign = showSign ? (isNeg ? "-" : "+") : isNeg ? "-" : "";
  const color = showSign
    ? isNeg
      ? (negativeColor ?? "#E53E3E")
      : (positiveColor ?? "#22C55E")
    : undefined;

  const formatted =
    currency === "JPY"
      ? Math.round(abs).toLocaleString()
      : abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Text style={[style, color ? { color } : {}]}>
      {sign}
      {symbol}
      {formatted}
    </Text>
  );
}

export function formatAmount(amount: number, currency: Currency = "USD"): string {
  const symbol = SYMBOLS[currency] ?? "$";
  const abs = Math.abs(amount);
  const formatted =
    currency === "JPY"
      ? Math.round(abs).toLocaleString()
      : abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount < 0 ? "-" : ""}${symbol}${formatted}`;
}
