import type { PurchaseProductDefinition } from "./purchase.types";

export const PAID_ENTITLEMENTS = ["sync", "sharing", "photo_storage", "cloud_backup"] as const;

export const FAKE_PURCHASE_PRODUCTS: PurchaseProductDefinition[] = [
  {
    billingType: "monthly",
    description: "Monthly Trailbook premium access for local purchase simulation.",
    entitlements: [...PAID_ENTITLEMENTS],
    internalProductCode: "trailbook_premium_monthly",
    name: "Trailbook Premium Monthly",
    planCode: "premium_monthly",
    priceLabel: "$4.99 / month",
    provider: "fake",
    providerProductId: "trailbook_premium_monthly",
  },
  {
    billingType: "yearly",
    description: "Yearly Trailbook premium access for local purchase simulation.",
    entitlements: [...PAID_ENTITLEMENTS],
    internalProductCode: "trailbook_premium_yearly",
    name: "Trailbook Premium Yearly",
    planCode: "premium_yearly",
    priceLabel: "$39.99 / year",
    provider: "fake",
    providerProductId: "trailbook_premium_yearly",
  },
  {
    billingType: "lifetime",
    description: "Lifetime Trailbook premium access for local purchase simulation.",
    entitlements: [...PAID_ENTITLEMENTS],
    internalProductCode: "trailbook_lifetime",
    name: "Trailbook Lifetime",
    planCode: "premium_lifetime",
    priceLabel: "$99.99 once",
    provider: "fake",
    providerProductId: "trailbook_lifetime",
  },
];

export function getFakeProductDefinition(providerProductId: string) {
  return FAKE_PURCHASE_PRODUCTS.find((product) => product.providerProductId === providerProductId) ?? null;
}
