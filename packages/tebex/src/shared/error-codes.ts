export const TEBEX_ERROR_CODES = {
  TEBEX_CHECKOUT_FAILED: {
    code: "TEBEX_CHECKOUT_FAILED",
    message: "Tebex checkout could not be created",
  },
  TEBEX_CUSTOMER_NOT_FOUND: {
    code: "TEBEX_CUSTOMER_NOT_FOUND",
    message: "Tebex customer was not found",
  },
  TEBEX_INVALID_SIGNATURE: {
    code: "TEBEX_INVALID_SIGNATURE",
    message: "Tebex webhook signature is invalid",
  },
  TEBEX_UNTRUSTED_REDIRECT: {
    code: "TEBEX_UNTRUSTED_REDIRECT",
    message: "Tebex redirect URL is not trusted",
  },
} as const;
