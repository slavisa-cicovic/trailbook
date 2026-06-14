import { API_ROUTES } from "../../constants/api-routes";
import type { FakePurchaseScenario } from "../../domain/purchases";
import { requestFromBackend } from "../api/mobile-api.service";
import {
  PurchaseAccessSchema,
  PurchaseProductsResponseSchema,
  PurchaseSimulationResultSchema,
} from "../api/schemas/purchases.schemas";

export async function listPurchaseProducts(sessionToken: string) {
  return requestFromBackend(
    `${API_ROUTES.purchases.products}?provider=fake`,
    { method: "GET" },
    sessionToken,
    PurchaseProductsResponseSchema,
  );
}

export async function getPurchaseAccess(sessionToken: string) {
  return requestFromBackend(
    API_ROUTES.purchases.me,
    { method: "GET" },
    sessionToken,
    PurchaseAccessSchema,
  );
}

export async function simulateFakePurchase(
  sessionToken: string,
  input: {
    productId: string;
    scenario?: FakePurchaseScenario;
  },
) {
  return requestFromBackend(
    API_ROUTES.purchases.fakeSimulate,
    {
      method: "POST",
      body: JSON.stringify({
        providerProductId: input.productId,
        scenario: input.scenario,
      }),
    },
    sessionToken,
    PurchaseSimulationResultSchema,
  );
}
