// A new expense is shown under a temporary id until the server confirms it.
// This remembers temp id -> server id so a screen opened in between still finds it.
export const expenseIdAlias: Record<string, string> = {};
