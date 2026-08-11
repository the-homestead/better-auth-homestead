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

export const tebexAuthLinkSchema = z.object({
  name: z.string().optional(),
  url: z.string().url(),
});

export type TebexPackage = z.infer<typeof tebexPackageSchema>;
export type TebexCategory = z.infer<typeof tebexCategorySchema>;
export type TebexWebstore = z.infer<typeof tebexWebstoreSchema>;
export type TebexBasket = z.infer<typeof tebexBasketSchema>;
export type TebexAuthLink = z.infer<typeof tebexAuthLinkSchema>;
