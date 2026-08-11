import { createAuthEndpoint } from "better-auth/api";
import { z } from "zod";

import type { TebexClient } from "../../provider/client.js";

const catalogQuerySchema = z.object({
  includePackages: z
    .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
    .optional(),
});
const packageQuerySchema = z.object({ packageId: z.coerce.number().int().positive() });

export function createCatalogEndpoints(client: TebexClient) {
  return {
    getTebexStore: createAuthEndpoint("/tebex/store", { method: "GET" }, async (ctx) =>
      ctx.json(await client.getWebstore()),
    ),
    listTebexCategories: createAuthEndpoint(
      "/tebex/categories",
      { method: "GET", query: catalogQuerySchema },
      async (ctx) =>
        ctx.json(
          await client.listCategories(
            ctx.query?.includePackages === "true" || ctx.query?.includePackages === "1",
          ),
        ),
    ),
    listTebexPackages: createAuthEndpoint("/tebex/packages", { method: "GET" }, async (ctx) =>
      ctx.json(await client.listPackages()),
    ),
    getTebexPackage: createAuthEndpoint(
      "/tebex/package",
      { method: "GET", query: packageQuerySchema },
      async (ctx) => ctx.json(await client.getPackage(ctx.query.packageId)),
    ),
  };
}
