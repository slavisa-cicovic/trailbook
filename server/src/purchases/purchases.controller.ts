import { Body, Controller, Get, Inject, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";

import { AuthService } from "../auth/auth.service";
import { AppleNotificationService } from "./apple-notification.service";
import { ApplePurchaseProvider } from "./apple-purchase.provider";
import { PurchaseApplicationService } from "./purchase-application.service";
import { GooglePurchaseProvider } from "./google-purchase.provider";
import { GoogleNotificationService, type GooglePubsubPushBody } from "./google-notification.service";
import type { FakePurchaseScenario } from "./purchase.types";

interface SimulatePurchaseRequest {
  providerProductId?: string;
  scenario?: FakePurchaseScenario;
  transactionId?: string;
}

interface VerifyApplePurchaseRequest {
  appAccountToken?: string;
  productId?: string;
  transactionId?: string;
}

interface AppleNotificationRequest {
  signedPayload?: string;
}

interface VerifyGooglePurchaseRequest {
  basePlanId?: string;
  productId?: string;
  purchaseToken?: string;
}

interface RecoverAppleNotificationsRequest {
  endDate?: string;
  environment?: string;
  onlyFailures?: boolean;
  startDate?: string;
}

@Controller("purchases")
export class PurchasesController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(PurchaseApplicationService)
    private readonly purchaseApplication: PurchaseApplicationService,
    @Inject(ApplePurchaseProvider)
    private readonly applePurchaseProvider: ApplePurchaseProvider,
    @Inject(AppleNotificationService)
    private readonly appleNotificationService: AppleNotificationService,
    @Inject(GooglePurchaseProvider)
    private readonly googlePurchaseProvider: GooglePurchaseProvider,
    @Inject(GoogleNotificationService)
    private readonly googleNotificationService: GoogleNotificationService,
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

  @Get("local-test-trip")
  async getLocalTestTripAllowance(@Req() request: Request) {
    const user = await this.authService.requireAuthenticatedUser(request);
    return this.purchaseApplication.getLocalTestTripAllowance(user.id);
  }

  @Post("local-test-trip/consume")
  async consumeLocalTestTripAllowance(
    @Body() input: { clientTripId?: string },
    @Req() request: Request,
  ) {
    const user = await this.authService.requireAuthenticatedUser(request);
    return this.purchaseApplication.consumeLocalTestTripAllowance(
      user.id,
      input.clientTripId ?? "",
    );
  }

  @Post("fake/simulate")
  async simulate(@Body() input: SimulatePurchaseRequest, @Req() request: Request) {
    const user = await this.authService.requireAuthenticatedUser(request);
    return this.purchaseApplication.simulateFakePurchase(user, input);
  }

  @Get("apple/account-token")
  async getAppleAccountToken(@Req() request: Request) {
    const user = await this.authService.requireAuthenticatedUser(request);
    return this.applePurchaseProvider.getAccountToken(user.id);
  }

  @Post("apple/verify")
  async verifyApplePurchase(@Body() input: VerifyApplePurchaseRequest, @Req() request: Request) {
    const user = await this.authService.requireAuthenticatedUser(request);
    return this.applePurchaseProvider.verifyPurchase({
      appAccountToken: input.appAccountToken ?? "",
      productId: input.productId ?? "",
      transactionId: input.transactionId ?? "",
      userId: user.id,
    });
  }

  @Get("google/account-id")
  async getGoogleAccountId(@Req() request: Request) {
    const user = await this.authService.requireAuthenticatedUser(request);
    return this.googlePurchaseProvider.getAccountId(user.id);
  }

  @Post("google/verify")
  async verifyGooglePurchase(@Body() input: VerifyGooglePurchaseRequest, @Req() request: Request) {
    const user = await this.authService.requireAuthenticatedUser(request);
    return this.googlePurchaseProvider.verifyPurchase({
      basePlanId: input.basePlanId ?? "",
      productId: input.productId ?? "",
      purchaseToken: input.purchaseToken ?? "",
      userId: user.id,
    });
  }

  @Post("google/notifications")
  async receiveGoogleNotification(@Body() input: GooglePubsubPushBody, @Req() request: Request) {
    return this.googleNotificationService.handlePush(request.header("authorization"), input);
  }

  @Post("apple/notifications")
  async receiveAppleNotification(@Body() input: AppleNotificationRequest) {
    return this.appleNotificationService.handleSignedPayload(input.signedPayload ?? "");
  }

  @Post("apple/notifications/recover")
  async recoverAppleNotifications(
    @Body() input: RecoverAppleNotificationsRequest,
    @Req() request: Request,
  ) {
    const user = await this.authService.requireAuthenticatedUser(request);
    return this.appleNotificationService.recoverHistory(user, input);
  }

  @Post("apple/notifications/reprocess-failed")
  async reprocessFailedAppleNotifications(@Query("limit") limit: string | undefined, @Req() request: Request) {
    const user = await this.authService.requireAuthenticatedUser(request);
    return this.appleNotificationService.reprocessFailed(user, Number(limit || 50));
  }

  @Post("apple/notifications/request-test")
  async requestAppleTestNotification(
    @Body() input: { environment?: string },
    @Req() request: Request,
  ) {
    const user = await this.authService.requireAuthenticatedUser(request);
    return this.appleNotificationService.requestTestNotification(user, input.environment);
  }
}
