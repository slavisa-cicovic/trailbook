import { Body, Controller, Get, Inject, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";

import { AuthService } from "../auth/auth.service";
import { PurchaseApplicationService } from "./purchase-application.service";
import type { FakePurchaseScenario } from "./purchase.types";

interface SimulatePurchaseRequest {
  providerProductId?: string;
  scenario?: FakePurchaseScenario;
  transactionId?: string;
}

@Controller("purchases")
export class PurchasesController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(PurchaseApplicationService)
    private readonly purchaseApplication: PurchaseApplicationService,
  ) {}

  @Get("products")
  async listProducts(@Query("provider") provider: string | undefined, @Req() request: Request) {
    await this.authService.requireAuthenticatedUser(request);
    if (provider && provider !== "fake") return [];
    return this.purchaseApplication.listFakeProducts();
  }

  @Get("me")
  async getCurrentAccess(@Req() request: Request) {
    const user = await this.authService.requireAuthenticatedUser(request);
    return this.purchaseApplication.getCurrentAccess(user.id);
  }

  @Post("fake/simulate")
  async simulate(@Body() input: SimulatePurchaseRequest, @Req() request: Request) {
    const user = await this.authService.requireAuthenticatedUser(request);
    return this.purchaseApplication.simulateFakePurchase(user, input);
  }
}
