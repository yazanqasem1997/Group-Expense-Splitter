import { Redirect } from "expo-router";
// Recurring has moved to a stack screen so it can be navigated to from Groups
// with a proper back button. This redirect exists only as a safety net in case
// any old deep-link still targets /(tabs)/recurring.
export default function RecurringTabRedirect() {
  return <Redirect href="/recurring" />;
}
