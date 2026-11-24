import type { Request } from "express";

/** Express 5 params are `string | string[]`; normalize to a single string. */
export function param(req: Request, name: string): string {
  const raw = req.params[name];
  return Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
}

/** A short random member key for placeholder/pending members. */
export function randomKey(prefix = "m"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** An opaque invitation token. */
export function randomToken(): string {
  return `inv_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}
