import { z } from "zod";

const packageCategorySchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string().nullable().optional(),
});

export const tebexPackageSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().optional(),
  image: z.string().nullable().optional(),
  type: z.string().optional(),
  category: packageCategorySchema.optional(),
  base_price: z.number().optional(),
  sales_tax: z.number().optional(),
  total_price: z.number().optional(),
  currency: z.string().optional(),
  disable_quantity: z.boolean().optional(),
  disable_gifting: z.boolean().optional(),
  expiration_date: z.string().nullable().optional(),
});

export const tebexCategorySchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string().nullable().optional(),
  description: z.string().optional(),
  tiered: z.boolean().optional(),
  packages: z.array(tebexPackageSchema).nullable().optional(),
});

export const tebexWebstoreSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().optional(),
  webstore_url: z.string().optional(),
  currency: z.string().optional(),
  logo: z.string().nullable().optional(),
  platform_type: z.string().optional(),
});

const basketLinksSchema = z.union([
  z.object({ checkout: z.string().url().optional() }).loose(),
  z.array(z.record(z.string(), z.unknown())),
]);

export const tebexBasketSchema = z
  .object({
    ident: z.string(),
    complete: z.boolean().optional(),
    email: z.string().nullable().optional(),
    username: z.string().nullable().optional(),
    user_id: z.string().nullable().optional(),
    discord_id: z.string().nullable().optional(),
    base_price: z.number().optional(),
    total_price: z.number().optional(),
    currency: z.string().optional(),
    custom: z.record(z.string(), z.unknown()).nullable().optional(),
    links: basketLinksSchema.optional(),
  })
  .loose();

const authLinkSchema = z.object({ name: z.string().optional(), url: z.string().url() });

export type TebexPackage = z.infer<typeof tebexPackageSchema>;
export type TebexCategory = z.infer<typeof tebexCategorySchema>;
export type TebexWebstore = z.infer<typeof tebexWebstoreSchema>;
export type TebexBasket = z.infer<typeof tebexBasketSchema>;
export type TebexAuthLink = z.infer<typeof authLinkSchema>;

export type TebexFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface TebexCreateBasketInput {
  completeURL: string;
  cancelURL: string;
  custom: Record<string, unknown>;
  ipAddress?: string;
  userIdentifier?: { field: "username" | "user_id" | "discord_id"; value: string };
}

export interface TebexAddPackageInput {
  packageId: number;
  quantity?: number;
  variableData?: Record<string, string>;
}

export interface TebexClientOptions {
  publicToken: string;
  privateKey: string;
  baseURL?: string;
  fetch?: TebexFetch;
  timeoutMs?: number;
}

export class TebexProviderError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Tebex request failed with status ${status}`);
    this.name = "TebexProviderError";
    this.status = status;
  }
}

type RequestOptions = {
  body?: unknown;
  method?: "GET" | "POST";
  query?: Record<string, string>;
};

function unwrap<T>(value: { data: T } | T): T {
  return typeof value === "object" && value !== null && "data" in value ? value.data : value;
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${name} must be positive`);
}

export function getBasketCheckoutURL(basket: TebexBasket): string | undefined {
  const links = basket.links;
  if (!links) return undefined;
  if (!Array.isArray(links)) return links.checkout;
  for (const link of links) {
    for (const field of ["checkout", "href", "url", "uri"] as const) {
      if (typeof link[field] === "string") return link[field];
    }
  }
  return undefined;
}

export function createTebexClient(options: TebexClientOptions) {
  const publicToken = options.publicToken.trim();
  const privateKey = options.privateKey.trim();
  if (!publicToken) throw new TypeError("publicToken is required");
  if (!privateKey) throw new TypeError("privateKey is required");

  const baseURL = new URL(options.baseURL ?? "https://headless.tebex.io/api/");
  if (baseURL.protocol !== "https:" && baseURL.hostname !== "localhost") {
    throw new TypeError("Tebex baseURL must use HTTPS");
  }
  const requestFetch: TebexFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const authorization = `Basic ${Buffer.from(`${publicToken}:${privateKey}`).toString("base64")}`;
  const accountPath = `accounts/${encodeURIComponent(publicToken)}`;

  async function request(path: string, requestOptions: RequestOptions = {}): Promise<unknown> {
    const url = new URL(path.replace(/^\//, ""), baseURL);
    for (const [key, value] of Object.entries(requestOptions.query ?? {})) {
      url.searchParams.set(key, value);
    }
    const response = await requestFetch(url, {
      body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body),
      headers: {
        accept: "application/json",
        authorization,
        "content-type": "application/json",
      },
      method: requestOptions.method ?? "GET",
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
    if (!response.ok) throw new TebexProviderError(response.status);
    return response.json();
  }

  return {
    async getWebstore(): Promise<TebexWebstore> {
      return tebexWebstoreSchema.parse(unwrap(await request(accountPath)));
    },
    async listCategories(includePackages = false): Promise<TebexCategory[]> {
      const value = unwrap(
        await request(`${accountPath}/categories`, {
          query: includePackages ? { includePackages: "1" } : undefined,
        }),
      );
      return z.array(tebexCategorySchema).parse(value);
    },
    async listPackages(): Promise<TebexPackage[]> {
      return z.array(tebexPackageSchema).parse(unwrap(await request(`${accountPath}/packages`)));
    },
    async getPackage(packageId: number): Promise<TebexPackage> {
      assertPositiveInteger(packageId, "packageId");
      const value = unwrap(await request(`${accountPath}/packages/${packageId}`));
      if (Array.isArray(value)) return tebexPackageSchema.parse(value[0]);
      return tebexPackageSchema.parse(value);
    },
    async createBasket(input: TebexCreateBasketInput): Promise<TebexBasket> {
      const body: Record<string, unknown> = {
        cancel_url: input.cancelURL,
        complete_auto_redirect: true,
        complete_url: input.completeURL,
        custom: input.custom,
      };
      if (input.ipAddress) body.ip_address = input.ipAddress;
      if (input.userIdentifier) {
        body[input.userIdentifier.field] = input.userIdentifier.value;
      }
      return tebexBasketSchema.parse(
        unwrap(await request(`${accountPath}/baskets`, { body, method: "POST" })),
      );
    },
    async getBasket(ident: string): Promise<TebexBasket> {
      return tebexBasketSchema.parse(
        unwrap(await request(`${accountPath}/baskets/${encodeURIComponent(ident)}`)),
      );
    },
    async getAuthLinks(ident: string, returnURL: string): Promise<TebexAuthLink[]> {
      return z.array(authLinkSchema).parse(
        unwrap(
          await request(`${accountPath}/baskets/${encodeURIComponent(ident)}/auth`, {
            query: { returnUrl: returnURL },
          }),
        ),
      );
    },
    async getAuthURL(ident: string, returnURL: string): Promise<string> {
      const links = await this.getAuthLinks(ident, returnURL);
      const url = links[0]?.url;
      if (!url) throw new TebexProviderError(502);
      return url;
    },
    async addPackage(ident: string, input: TebexAddPackageInput): Promise<TebexBasket> {
      assertPositiveInteger(input.packageId, "packageId");
      const quantity = input.quantity ?? 1;
      assertPositiveInteger(quantity, "quantity");
      return tebexBasketSchema.parse(
        unwrap(
          await request(`baskets/${encodeURIComponent(ident)}/packages`, {
            body: {
              package_id: String(input.packageId),
              quantity,
              ...(input.variableData ? { variable_data: input.variableData } : {}),
            },
            method: "POST",
          }),
        ),
      );
    },
  };
}

export type TebexClient = ReturnType<typeof createTebexClient>;
