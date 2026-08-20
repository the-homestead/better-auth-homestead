import { cfx } from "@homestead/ba-cfx";
import { steam } from "@homestead/ba-steam";
import { tebex } from "@homestead/ba-tebex";

export interface TestbedProviderURLs {
  cfx: string;
  steamOpenID?: string;
  steamProfile?: string;
  tebex: string;
}

const defaultProviderURLs: TestbedProviderURLs = {
  cfx: "http://localhost:43111",
  tebex: "http://localhost:43112/api/",
};

export function createTestbedPlugins(providerURLs: TestbedProviderURLs = defaultProviderURLs) {
  return [
    cfx({
      applicationName: "Homestead Better Auth Testbed",
      forumUrl: providerURLs.cfx,
      revokeKeyOnUnlink: true,
    }),
    steam({
      accountLinking: true,
      profileFailureMode: "reject",
      provider: {
        openIDURL: providerURLs.steamOpenID,
        profileURL: providerURLs.steamProfile,
      },
      steamApiKey: "testbed-steam-api-key",
    }),
    tebex({
      baseURL: providerURLs.tebex,
      packageMappings: [{ entitlements: ["testbed.vip"], packageId: 1001 }],
      privateKey: "testbed-private-key",
      publicToken: "testbed-public-token",
      webhookAllowedIPs: false,
      webhookSecret: "testbed-webhook-secret",
    }),
  ] as const;
}
