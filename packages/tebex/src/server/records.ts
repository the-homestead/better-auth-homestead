export type CustomerRecord = {
  id: string;
  referenceId: string;
  customerType: string;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type BasketRecord = {
  id: string;
  ident: string;
  checkoutReference: string;
  customerId: string;
  initiatedByUserId: string;
  beneficiaryUserId?: string;
  packageSnapshot: Array<{ packageId: number; quantity: number }>;
  status: string;
};

export type PlayerIdentityRecord = {
  id: string;
  userId: string;
  usernameType: string;
  identifier: string;
  source: string;
  verifiedAt: Date;
  lastUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type EntityRecord = { id: string } & Record<string, unknown>;
