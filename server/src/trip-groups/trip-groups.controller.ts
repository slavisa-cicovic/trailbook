import { Body, Controller, Get, Inject, Post, Req } from "@nestjs/common";
import type { Request } from "express";

import { AuthService } from "../auth/auth.service";
import { PurchaseApplicationService } from "../purchases/purchase-application.service";
import type { SyncTripGroupsRequestDto } from "./dto/trip-groups.dto";
import { TripGroupsService } from "./trip-groups.service";

@Controller("trip-groups")
export class TripGroupsController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(PurchaseApplicationService)
    private readonly purchaseApplication: PurchaseApplicationService,
    @Inject(TripGroupsService) private readonly tripGroupsService: TripGroupsService,
  ) {}

  @Get()
  async list(@Req() request: Request) {
    const user = await this.authService.requireAuthenticatedUser(request);
    await this.purchaseApplication.requirePremium(user);
    return this.tripGroupsService.list(user.id);
  }

  @Post("sync")
  async sync(@Body() body: SyncTripGroupsRequestDto, @Req() request: Request) {
    const user = await this.authService.requireAuthenticatedUser(request);
    await this.purchaseApplication.requirePremium(user);
    return this.tripGroupsService.sync(user.id, body);
  }
}
