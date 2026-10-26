import { randomUUID, randomBytes } from "node:crypto";

export const uuid = () => randomUUID();

/** Short, non-identifying public id shown to staff instead of a phone number. */
export function anonId(prefix = "usr"): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(8);
  let s = "";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `${prefix}_${s}`;
}

export const nowIso = () => new Date().toISOString();
