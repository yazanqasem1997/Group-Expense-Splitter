import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

/** When you last looked at each group, so new activity can show a red dot. */
type SeenState = { base: number; seen: Record<string, number> };
const KEY = "groupSeen:v1";
let state: SeenState = { base: Date.now(), seen: {} };
let loaded = false;
const subs = new Set<() => void>();

function emit() { subs.forEach(f => f()); }
function save() { AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {}); }

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then(v => {
      if (v) state = JSON.parse(v) as SeenState;
      else save(); // first run: only activity from now on counts as new
      emit();
    })
    .catch(() => {});
}

export function markGroupSeen(groupId: string) {
  state = { ...state, seen: { ...state.seen, [groupId]: Date.now() } };
  save();
  emit();
}

export function useGroupSeen(): SeenState {
  const [, bump] = useState(0);
  useEffect(() => {
    load();
    const f = () => bump(x => x + 1);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  return state;
}

type Item = { groupId?: string | null; createdAt?: string };
/** Groups with expenses or settlements someone else added since you last opened them. */
export function unseenGroupIds(
  s: SeenState,
  expenses: (Item & { addedBy?: string; paidById?: string })[],
  settlements: (Item & { fromId?: string })[],
  meId: string,
): Set<string> {
  const out = new Set<string>();
  const newer = (gid: string, at?: string) => !!at && new Date(at).getTime() > (s.seen[gid] ?? s.base);
  for (const e of expenses) {
    const by = e.addedBy ?? e.paidById;
    if (e.groupId && by !== meId && newer(e.groupId, e.createdAt)) out.add(e.groupId);
  }
  for (const t of settlements) {
    if (t.groupId && t.fromId !== meId && newer(t.groupId, t.createdAt)) out.add(t.groupId);
  }
  return out;
}
