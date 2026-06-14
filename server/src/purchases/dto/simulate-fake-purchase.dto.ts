import { IsIn, IsOptional, IsString } from "class-validator";

import type { FakePurchaseScenario } from "../purchase.types";

const fakePurchaseScenarios: FakePurchaseScenario[] = [
  "success",
  "renew",
  "subscription_canceled",
  "expired",
  "refund",
  "revoke",
  "decline",
  "cancel",
  "pending",
  "restore",
];

export class SimulateFakePurchaseDto {
  @IsString()
  providerProductId: string;

  @IsOptional()
  @IsString()
  purchaseToken?: string;

  @IsOptional()
  @IsIn(fakePurchaseScenarios)
  scenario?: FakePurchaseScenario;

  @IsOptional()
  @IsString()
  transactionId?: string;
}
