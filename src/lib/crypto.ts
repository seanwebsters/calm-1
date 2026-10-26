/**
 * Application-level field encryption (AES-256-GCM) for sensitive text:
 * message bodies, memories, journal entries, summaries and phone numbers.
 * This sits on top of the database provider's encryption at rest so a
 * database dump or a misconfigured policy does not expose conversations.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env";
import { log } from "./log";

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const configured = env.encryptionKey;
  if (configured) {
    const key = Buffer.from(configured, "base64");
    if (key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32).");
    cachedKey = key;
    return key;
  }
  if (env.isProduction) throw new Error("DATA_ENCRYPTION_KEY is required in production.");
  // Development only: persist a generated key next to the local data file.
  const file = path.join(env.dataDir, ".dev-encryption-key");
  try {
    cachedKey = Buffer.from(fs.readFileSync(file, "utf8").trim(), "base64");
  } catch {
    fs.mkdirSync(env.dataDir, { recursive: true });
    cachedKey = randomBytes(32);
    fs.writeFileSync(file, cachedKey.toString("base64"), { mode: 0o600 });
    log.warn("Generated a development encryption key. Set DATA_ENCRYPTION_KEY for any shared environment.");
  }
  return cachedKey;
}

export function seal(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", loadKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ct.toString("base64url")}`;
}

export function open(sealed: string | null | undefined): string {
  if (!sealed) return "";
  const [v, iv, tag, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || ct === undefined) throw new Error("Unrecognised ciphertext format");
  const decipher = createDecipheriv("aes-256-gcm", loadKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/** Keyed hash for looking a user up by phone number without storing it in clear. */
export function phoneHash(phone: string): string {
  const pepper = env.phoneHashPepper || (env.isProduction ? "" : "dev-pepper");
  if (!pepper) throw new Error("PHONE_HASH_PEPPER is required in production.");
  return createHmac("sha256", pepper).update(normalisePhone(phone)).digest("hex");
}

export function normalisePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

export function maskPhone(last4: string | null | undefined): string {
  return last4 ? `•••• •••${last4.slice(-2)}` : "—";
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}
