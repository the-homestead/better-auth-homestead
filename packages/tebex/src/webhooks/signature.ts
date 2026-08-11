import crypto from "node:crypto";

/** Tebex webhook envelope parsing and signature verification. */

import { z } from "zod";

const webhookEnvelopeSchema = z.object({
  date: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid webhook date"),
  id: z.string().min(1),
  subject: z.record(z.string(), z.unknown()),
  type: z.string().min(1),
});

export interface TebexWebhook {
  date: Date;
  id: string;
  subject: Record<string, unknown>;
  type: string;
}

export function createTebexSignature(rawBody: string, secret: string): string {
  const bodyHash = crypto.createHash("sha256").update(rawBody, "utf8").digest("hex");
  return crypto.createHmac("sha256", secret).update(bodyHash, "utf8").digest("hex");
}

export function verifyTebexSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(createTebexSignature(rawBody, secret), "hex");
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

export function parseTebexWebhook(rawBody: string): TebexWebhook {
  const value = webhookEnvelopeSchema.parse(JSON.parse(rawBody));
  return { ...value, date: new Date(value.date) };
}
