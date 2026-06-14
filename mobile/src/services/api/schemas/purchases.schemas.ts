import { z } from "zod";

export const PurchaseProviderNameSchema = z.enum(["fake", "apple", "google"]);
export const PurchaseEnvironmentNameSchema = z.enum(["local", "sandbox", "production"]);
export const PurchaseBillingTypeSchema = z.enum(["none", "monthly", "yearly", "lifetime"]);
export const PurchaseResultSchema = z.enum(["success", "canceled_by_user", "declined", "pending", "failed"]);
export const PurchaseSubscriptionStatusSchema = z.enum(["active", "expired", "canceled", "lifetime"]);

export const PurchaseProductSchema = z.object({
  billingType: PurchaseBillingTypeSchema,
  description: z.string(),
  entitlements: z.array(z.string()),
  planCode: z.string(),
  priceLabel: z.string(),
  productId: z.string(),
  provider: PurchaseProviderNameSchema,
  title: z.string(),
});

export const PurchaseProductsResponseSchema = z.array(PurchaseProductSchema);

export const PurchaseAccessSchema = z.object({
  currentPeriodEndsAt: z.string().nullable(),
  entitlements: z.array(z.string()),
  environment: PurchaseEnvironmentNameSchema.optional(),
  planCode: z.string(),
  provider: PurchaseProviderNameSchema.optional(),
  subscriptionStatus: PurchaseSubscriptionStatusSchema,
});

export const PurchaseSimulationResultSchema = PurchaseAccessSchema.extend({
  purchaseResult: PurchaseResultSchema,
});
