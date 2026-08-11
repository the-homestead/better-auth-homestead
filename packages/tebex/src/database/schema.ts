import type { BetterAuthPluginDBSchema } from "better-auth/db";

/** Persistent Better Auth models owned by the Tebex plugin. */

const timestamps = {
  createdAt: { type: "date", required: true, input: false },
  updatedAt: { type: "date", required: true, input: false },
} as const;

const privateString = { type: "string", required: false, input: false, returned: false } as const;

export const tebexSchema = {
  tebexCustomer: {
    fields: {
      referenceId: { type: "string", required: true, index: true, input: false },
      customerType: { type: "string", required: true, input: false },
      email: privateString,
      ...timestamps,
    },
  },
  tebexPlayerIdentity: {
    fields: {
      userId: {
        type: "string",
        required: true,
        index: true,
        input: false,
        references: { model: "user", field: "id", onDelete: "cascade" },
      },
      usernameType: { type: "string", required: true, input: false },
      identifier: { type: "string", required: true, input: false, returned: false },
      displayName: { type: "string", required: false, input: false },
      source: { type: "string", required: true, input: false },
      verifiedAt: { type: "date", required: true, input: false },
      lastUsedAt: { type: "date", required: true, input: false },
      ...timestamps,
    },
  },
  tebexBasket: {
    fields: {
      ident: { type: "string", required: true, unique: true, input: false, returned: false },
      checkoutReference: {
        type: "string",
        required: true,
        unique: true,
        input: false,
        returned: false,
      },
      customerId: { type: "string", required: true, index: true, input: false },
      initiatedByUserId: { type: "string", required: true, index: true, input: false },
      beneficiaryUserId: { type: "string", required: false, input: false },
      playerIdentityId: { type: "string", required: false, input: false },
      status: { type: "string", required: true, input: false },
      packageSnapshot: { type: "json", required: true, input: false },
      currency: { type: "string", required: false, input: false },
      amount: { type: "number", required: false, input: false },
      completeURL: privateString,
      cancelURL: privateString,
      expiresAt: { type: "date", required: false, input: false },
      completedAt: { type: "date", required: false, input: false },
      ...timestamps,
    },
  },
  tebexPayment: {
    fields: {
      transactionId: { type: "string", required: true, unique: true, input: false },
      customerId: { type: "string", required: false, index: true, input: false },
      basketId: { type: "string", required: false, input: false },
      status: { type: "string", required: true, input: false },
      currency: { type: "string", required: false, input: false },
      amount: { type: "number", required: false, input: false },
      email: privateString,
      playerIdentity: privateString,
      packages: { type: "json", required: true, input: false },
      completedAt: { type: "date", required: false, input: false },
      refundedAt: { type: "date", required: false, input: false },
      ...timestamps,
    },
  },
  tebexRecurringPayment: {
    fields: {
      reference: { type: "string", required: true, unique: true, input: false },
      customerId: { type: "string", required: false, index: true, input: false },
      status: { type: "string", required: true, input: false },
      packageId: { type: "number", required: true, input: false },
      initialTransactionId: { type: "string", required: false, input: false },
      nextPaymentAt: { type: "date", required: false, input: false },
      cancelledAt: { type: "date", required: false, input: false },
      endedAt: { type: "date", required: false, input: false },
      ...timestamps,
    },
  },
  tebexEntitlement: {
    fields: {
      customerId: { type: "string", required: true, index: true, input: false },
      beneficiaryUserId: { type: "string", required: false, index: true, input: false },
      key: { type: "string", required: true, index: true, input: false },
      packageId: { type: "number", required: true, input: false },
      sourceType: { type: "string", required: true, input: false },
      sourceReference: { type: "string", required: true, index: true, input: false },
      status: { type: "string", required: true, input: false },
      quantity: { type: "number", required: true, input: false },
      startsAt: { type: "date", required: true, input: false },
      endsAt: { type: "date", required: false, input: false },
      metadata: { type: "json", required: false, input: false },
      ...timestamps,
    },
  },
  tebexWebhookDelivery: {
    fields: {
      deliveryId: { type: "string", required: true, unique: true, input: false },
      eventType: { type: "string", required: true, input: false },
      occurredAt: { type: "date", required: true, input: false },
      payload: { type: "string", required: true, input: false, returned: false },
      status: { type: "string", required: true, index: true, input: false },
      attempts: { type: "number", required: true, input: false },
      nextAttemptAt: { type: "date", required: false, input: false },
      processingLeaseId: privateString,
      processingLeaseExpiresAt: { type: "date", required: false, input: false },
      lastError: privateString,
      receivedAt: { type: "date", required: true, input: false },
      processedAt: { type: "date", required: false, input: false },
      ...timestamps,
    },
  },
} satisfies BetterAuthPluginDBSchema;
