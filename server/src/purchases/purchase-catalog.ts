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

export function findFakePurchaseProduct(productId: string) {
  return FAKE_PURCHASE_PRODUCTS.find((product) => product.productId === productId) ?? null;
}

export const findPurchaseProduct = findFakePurchaseProduct;
