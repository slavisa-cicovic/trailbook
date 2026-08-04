import type { PurchaseProduct } from "./purchase.types";

export const PAID_ENTITLEMENTS = [
  "cloud_backup",
  "photo_storage",
  "sharing",
  "sync",
] as const;

export const FAKE_PURCHASE_PRODUCTS: PurchaseProduct[] = [
  {
    billingType: "monthly",
    description: "Monthly Trailbook premium access for local purchase simulation.",
    entitlements: [...PAID_ENTITLEMENTS],
    planCode: "premium_monthly",
    priceLabel: "EUR 3.99 / month",
    productId: "trailbook_premium_monthly",
    provider: "fake",
    title: "Trailbook Premium Monthly",
  },
  {
    billingType: "yearly",
    description: "Yearly Trailbook premium access for local purchase simulation.",
    entitlements: [...PAID_ENTITLEMENTS],
    planCode: "premium_yearly",
    priceLabel: "$39.99 / year",
    productId: "trailbook_premium_yearly",
    provider: "fake",
    title: "Trailbook Premium Yearly",
  },
  {
    billingType: "lifetime",
    description: "Lifetime Trailbook premium access for local purchase simulation.",
    entitlements: [...PAID_ENTITLEMENTS],
    planCode: "premium_lifetime",
    priceLabel: "$99.99 once",
    productId: "trailbook_lifetime",
    provider: "fake",
    title: "Trailbook Lifetime",
  },
];

export function googlePurchaseProducts(): PurchaseProduct[] {
  const productId = process.env.GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID?.trim() || "trailbook_premium";
  return [
    {
      basePlanId: process.env.GOOGLE_PLAY_MONTHLY_BASE_PLAN_ID?.trim() || "monthly",
      billingType: "monthly",
      description: "Monthly Trailbook Premium subscription from Google Play.",
      entitlements: [...PAID_ENTITLEMENTS],
      planCode: "premium_monthly",
      priceLabel: "",
      productId,
      provider: "google",
      title: "Trailbook Premium Monthly",
    },
    {
      basePlanId: process.env.GOOGLE_PLAY_YEARLY_BASE_PLAN_ID?.trim() || "yearly",
      billingType: "yearly",
      description: "Yearly Trailbook Premium subscription from Google Play.",
      entitlements: [...PAID_ENTITLEMENTS],
      planCode: "premium_yearly",
      priceLabel: "",
      productId,
      provider: "google",
      title: "Trailbook Premium Yearly",
    },
  ];
}

export function findFakePurchaseProduct(productId: string) {
  return FAKE_PURCHASE_PRODUCTS.find((product) => product.productId === productId) ?? null;
}

export function findPurchaseProduct(
  productId: string,
  provider: PurchaseProduct["provider"] = "fake",
  basePlanId?: string,
) {
  if (provider === "google") {
    return googlePurchaseProducts().find(
      (product) => product.productId === productId && product.basePlanId === basePlanId,
    ) ?? null;
  }
  // Apple currently uses the same monthly/yearly product IDs as the internal
  // catalog. Its provider is validated independently by ApplePurchaseProvider.
  return findFakePurchaseProduct(productId);
}
