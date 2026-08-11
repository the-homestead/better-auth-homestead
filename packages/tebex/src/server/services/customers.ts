import type { GenericEndpointContext } from "better-auth";
import { APIError } from "better-auth/api";

import { TEBEX_ERROR_CODES } from "../../shared/error-codes.js";
import type { CustomerRecord } from "../records.js";

export async function customerForUser(
  ctx: GenericEndpointContext,
  user: { id: string; email: string },
): Promise<CustomerRecord> {
  const existing = await ctx.context.adapter.findOne<CustomerRecord>({
    model: "tebexCustomer",
    where: [
      { field: "referenceId", value: user.id },
      { field: "customerType", value: "user" },
    ],
  });
  if (existing) return existing;
  const now = new Date();
  return ctx.context.adapter.create<CustomerRecord>({
    model: "tebexCustomer",
    data: {
      referenceId: user.id,
      customerType: "user",
      email: user.email,
      createdAt: now,
      updatedAt: now,
    },
  });
}

export async function customerForSession(ctx: GenericEndpointContext): Promise<CustomerRecord> {
  const session = ctx.context.session;
  if (!session) throw new APIError("UNAUTHORIZED");
  const customer = await ctx.context.adapter.findOne<CustomerRecord>({
    model: "tebexCustomer",
    where: [
      { field: "referenceId", value: session.user.id },
      { field: "customerType", value: "user" },
    ],
  });
  if (!customer) {
    throw new APIError("NOT_FOUND", {
      message: TEBEX_ERROR_CODES.TEBEX_CUSTOMER_NOT_FOUND.message,
    });
  }
  return customer;
}
