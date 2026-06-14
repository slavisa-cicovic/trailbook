import { IsIn, IsOptional, IsString } from "class-validator";

import type { PurchaseProviderName } from "../purchase.types";

const supportedVerifyProviders: PurchaseProviderName[] = ["apple", "google"];

export class VerifyPurchaseDto {
  @IsIn(supportedVerifyProviders)
  provider: PurchaseProviderName;

  @IsString()
  productId: string;

  @IsOptional()
  @IsString()
  purchaseToken?: string;

  @IsOptional()
  @IsString()
  transactionId?: string;
}
