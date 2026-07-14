import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { AuthService } from "../auth/auth.service";
import { PurchaseApplicationService } from "../purchases/purchase-application.service";
import type { TripBundleDto } from "./dto/sync-trip.dto";
import { TripsService } from "./trips.service";

interface ShareWithUserRequestDto {
  email?: string;
}

@Controller("trips")
export class TripsController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(PurchaseApplicationService)
    private readonly purchaseApplication: PurchaseApplicationService,
    @Inject(TripsService) private readonly tripsService: TripsService,
  ) {}

  @Get()
  async list(@Req() request: Request) {
    const user = await this.authService.requireAuthenticatedUser(request);
    await this.purchaseApplication.requirePremium(user);
    return this.tripsService.listForUser(user.id);
  }

  @Post()
  async upload(@Body() bundle: TripBundleDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const user = await this.authService.requireAuthenticatedUser(request);
    await this.purchaseApplication.requirePremium(user);
    const created = await this.tripsService.save(user.id, bundle);
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return {
      accepted: true,
      created,
      clientTripId: bundle.trip.clientTripId,
    };
  }

  @Get("shared-with-me")
  async sharedWithMe(@Req() request: Request) {
    const user = await this.authService.requireAuthenticatedUser(request);
    await this.purchaseApplication.requirePremium(user);
    return this.tripsService.listSharedWithUser(user.id);
  }

  @Get("shared-with-me/:clientTripId")
  async sharedWithMeDetail(@Param("clientTripId") clientTripId: string, @Req() request: Request) {
    const user = await this.authService.requireAuthenticatedUser(request);
    await this.purchaseApplication.requirePremium(user);
    return this.tripsService.getSharedWithUser(clientTripId, user.id);
  }

  @Get(":clientTripId")
  async get(@Param("clientTripId") clientTripId: string, @Req() request: Request) {
    const user = await this.authService.requireAuthenticatedUser(request);
    await this.purchaseApplication.requirePremium(user);
    return this.tripsService.get(clientTripId, user.id);
  }

  @Post(":clientTripId/share/users")
  async shareWithUser(
    @Param("clientTripId") clientTripId: string,
    @Body() input: ShareWithUserRequestDto,
    @Req() request: Request,
  ) {
    const user = await this.authService.requireAuthenticatedUser(request);
    await this.purchaseApplication.requirePremium(user);
    return this.tripsService.shareWithUser(clientTripId, user.id, input.email ?? "");
  }

  @Post(":clientTripId/share")
  async share(@Param("clientTripId") clientTripId: string, @Req() request: Request) {
    const user = await this.authService.requireAuthenticatedUser(request);
    await this.purchaseApplication.requirePremium(user);
    return this.tripsService.createShareLink(clientTripId, user.id);
  }

  @Delete(":clientTripId")
  @HttpCode(204)
  async delete(@Param("clientTripId") clientTripId: string, @Req() request: Request) {
    const user = await this.authService.requireAuthenticatedUser(request);
    await this.tripsService.delete(clientTripId, user.id);
  }
}
