import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

import { AuthService } from "../auth/auth.service";
import { SimulateFakePurchaseDto } from "./dto/simulate-fake-purchase.dto";
import { VerifyPurchaseDto } from "./dto/verify-purchase.dto";
import { PurchaseApplicationService } from "./purchase-application.service";
import type { PurchaseProviderName } from "./purchase.types";

@Controller("purchases")
export class PurchasesController {
  constructor(
    @Inject(PurchaseApplicationService) private readonly purchaseApplicationService: PurchaseApplicationService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  @Get("products")
  async listProducts(
    @Query("provider") provider: PurchaseProviderName | undefined,
    @Query("platform") platform: "android" | "ios" | "web" | undefined,
    @Req() request: Request,
  ) {
    const user = await this.requireAuthenticatedUser(request);

    return this.purchaseApplicationService.listProducts({
      platform,
      provider,
      userId: user.id,
    });
  }

  @Get("me")
  async getCurrentAccess(@Req() request: Request) {
    const user = await this.requireAuthenticatedUser(request);
    return this.purchaseApplicationService.getCurrentAccess(user.id);
  }

  @Post("fake/simulate")
  async simulateFakePurchase(@Body() input: SimulateFakePurchaseDto, @Req() request: Request) {
    const user = await this.requireAuthenticatedUser(request);
    return this.purchaseApplicationService.simulateFakePurchase(user, input);
  }

  @Post("verify")
  async verifyPurchase(@Body() input: VerifyPurchaseDto, @Req() request: Request) {
    const user = await this.requireAuthenticatedUser(request);
    return this.purchaseApplicationService.verifyPurchase(user, input);
  }

  @Post("apple/notifications")
  async receiveAppleNotification(@Body() input: unknown) {
    if (process.env.ENABLE_APPLE_PURCHASE_NOTIFICATIONS !== "true") {
      throw new ServiceUnavailableException("Apple purchase notifications are not enabled.");
    }

    return {
      accepted: true,
      processed: false,
      provider: "apple",
      receivedPayloadType: typeof input,
    };
  }

  private getSessionToken(request: Request) {
    const header = request.get("authorization");
    const bearerToken = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
    const queryToken =
      typeof request.query?.token === "string" && request.query.token.trim().length > 0
        ? request.query.token.trim()
        : null;
    return bearerToken || request.cookies?.trailbook_session || queryToken;
  }

  private async requireAuthenticatedUser(request: Request) {
    const currentUser = await this.authService.getCurrentUser(this.getSessionToken(request));

    if (!currentUser.user) {
      throw new UnauthorizedException("Authentication required.");
    }

    return currentUser.user;
  }
}
