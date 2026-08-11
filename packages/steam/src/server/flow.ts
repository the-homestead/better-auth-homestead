import type { GenericEndpointContext } from "better-auth";
import { APIError } from "better-auth/api";
import { z } from "zod";

const FLOW_PREFIX = "steam-flow:";

export type SteamFlowState = {
  callbackURL: string;
  errorCallbackURL: string;
  mode: "sign-in" | "link";
  newUserCallbackURL: string;
  requestSignUp: boolean;
  userId?: string;
};

type VerificationValue = Awaited<
  ReturnType<GenericEndpointContext["context"]["internalAdapter"]["findVerificationValue"]>
>;

type InternalAdapterWithConsume = GenericEndpointContext["context"]["internalAdapter"] & {
  consumeVerificationValue?: (identifier: string) => Promise<VerificationValue>;
};

const flowStateSchema = z.object({
  callbackURL: z.string(),
  errorCallbackURL: z.string(),
  mode: z.enum(["sign-in", "link"]),
  newUserCallbackURL: z.string(),
  requestSignUp: z.boolean(),
  userId: z.string().optional(),
});

export const initiateBodySchema = z.object({
  callbackURL: z.string().optional(),
  disableRedirect: z.boolean().optional(),
  errorCallbackURL: z.string().optional(),
  newUserCallbackURL: z.string().optional(),
  requestSignUp: z.boolean().optional(),
});

export const callbackQuerySchema = z.object({
  state: z.string().min(1),
  "openid.assoc_handle": z.string().optional(),
  "openid.claimed_id": z.string().optional(),
  "openid.identity": z.string().optional(),
  "openid.mode": z.string().optional(),
  "openid.ns": z.string().optional(),
  "openid.op_endpoint": z.string().optional(),
  "openid.response_nonce": z.string().optional(),
  "openid.return_to": z.string().optional(),
  "openid.sig": z.string().optional(),
  "openid.signed": z.string().optional(),
});

export const linkBodySchema = z.object({
  callbackURL: z.string().optional(),
  disableRedirect: z.boolean().optional(),
  errorCallbackURL: z.string().optional(),
});

function randomState(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function appendQuery(
  value: string,
  baseURL: string,
  entries: Record<string, string>,
): string {
  const url = new URL(value, baseURL);
  for (const [key, entry] of Object.entries(entries)) url.searchParams.set(key, entry);
  return url.toString();
}

export function trustedRedirect(
  ctx: GenericEndpointContext,
  value: string | undefined,
  fallback: string,
): string {
  const resolved = new URL(value ?? fallback, ctx.context.baseURL).toString();
  if (!ctx.context.isTrustedOrigin(resolved, { allowRelativePaths: false })) {
    throw new APIError("BAD_REQUEST", { message: "Untrusted Steam callback URL" });
  }
  return resolved;
}

export async function createFlow(
  ctx: GenericEndpointContext,
  state: SteamFlowState,
  ttlSeconds: number,
): Promise<string> {
  const stateId = randomState();
  await ctx.context.internalAdapter.createVerificationValue({
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    identifier: `${FLOW_PREFIX}${stateId}`,
    value: JSON.stringify(state),
  });
  return stateId;
}

export async function consumeFlow(
  ctx: GenericEndpointContext,
  stateId: string,
): Promise<SteamFlowState | null> {
  const identifier = `${FLOW_PREFIX}${stateId}`;
  const adapter = ctx.context.internalAdapter as InternalAdapterWithConsume;
  let verification: VerificationValue;
  if (typeof adapter.consumeVerificationValue === "function") {
    verification = await adapter.consumeVerificationValue(identifier);
  } else {
    verification = await adapter.findVerificationValue(identifier);
    if (verification) await adapter.deleteVerificationByIdentifier(identifier);
  }
  if (!verification || verification.expiresAt < new Date()) return null;
  return flowStateSchema.parse(JSON.parse(verification.value));
}

export function openIDParams(query: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith("openid.") && typeof value === "string") params.set(key, value);
  }
  return params;
}
