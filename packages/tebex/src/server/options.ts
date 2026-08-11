import type { TebexPackageMapping, TebexProjection } from "../billing/projection.js";
import type { TebexClientOptions, TebexCreateBasketInput } from "../provider/client.js";
import type { TebexWebhook } from "../webhooks/signature.js";

export const DEFAULT_TEBEX_WEBHOOK_IPS = ["18.209.80.3", "54.87.231.232"] as const;

export interface TebexPlayerIdentifier {
  field: TebexCreateBasketInput["userIdentifier"] extends infer Identifier
    ? Identifier extends { field: infer Field }
      ? Field
      : never
    : never;
  value: string;
}

export interface TebexCheckoutContext {
  packageId: number;
  quantity: number;
  user: { id: string; email: string; name: string };
}

export interface TebexEntitlementChange {
  customerId: string;
  event: TebexWebhook;
  projection: TebexProjection;
}

export interface TebexPluginOptions extends Pick<
  TebexClientOptions,
  "baseURL" | "fetch" | "privateKey" | "publicToken" | "timeoutMs"
> {
  webhookSecret: string;
  /** Allowed Tebex webhook source IPs. Set false only when upstream filtering is enforced. */
  webhookAllowedIPs?: readonly string[] | false;
  packageMappings: readonly TebexPackageMapping[];
  basketTTLSeconds?: number;
  resolvePlayer?: (
    context: TebexCheckoutContext,
  ) => Promise<TebexPlayerIdentifier | null> | TebexPlayerIdentifier | null;
  onEntitlementChanged?: (change: TebexEntitlementChange) => Promise<void> | void;
}

function required(value: string, name: string): void {
  if (!value.trim()) throw new TypeError(`${name} is required`);
}

export function validateTebexOptions(options: TebexPluginOptions): void {
  required(options.publicToken, "publicToken");
  required(options.privateKey, "privateKey");
  required(options.webhookSecret, "webhookSecret");
  if (options.packageMappings.length === 0) {
    throw new TypeError("packageMappings must contain at least one package");
  }
  const packageIds = new Set<number>();
  for (const mapping of options.packageMappings) {
    if (!Number.isInteger(mapping.packageId) || mapping.packageId <= 0) {
      throw new TypeError("packageMappings packageId must be a positive integer");
    }
    if (packageIds.has(mapping.packageId)) {
      throw new TypeError(`packageMappings contains duplicate packageId ${mapping.packageId}`);
    }
    packageIds.add(mapping.packageId);
    if (mapping.entitlements.length === 0 || mapping.entitlements.some((key) => !key.trim())) {
      throw new TypeError(`packageMappings ${mapping.packageId} must define entitlements`);
    }
  }
}
