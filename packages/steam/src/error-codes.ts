export const STEAM_ERROR_CODES = {
  STEAM_ACCOUNT_ALREADY_LINKED: {
    code: "STEAM_ACCOUNT_ALREADY_LINKED",
    message: "This Steam account is already linked to another user",
  },
  STEAM_ACCOUNT_NOT_FOUND: {
    code: "STEAM_ACCOUNT_NOT_FOUND",
    message: "No Better Auth account is linked to this Steam account",
  },
  STEAM_FLOW_EXPIRED: {
    code: "STEAM_FLOW_EXPIRED",
    message: "The Steam authentication flow is missing, expired, or already used",
  },
  STEAM_PROFILE_UNAVAILABLE: {
    code: "STEAM_PROFILE_UNAVAILABLE",
    message: "The Steam profile could not be loaded",
  },
  STEAM_SESSION_REQUIRED: {
    code: "STEAM_SESSION_REQUIRED",
    message: "An active session is required to link a Steam account",
  },
  STEAM_SIGN_UP_DISABLED: {
    code: "STEAM_SIGN_UP_DISABLED",
    message: "Steam sign-up is disabled",
  },
  STEAM_VERIFICATION_FAILED: {
    code: "STEAM_VERIFICATION_FAILED",
    message: "Steam OpenID verification failed",
  },
} as const;
