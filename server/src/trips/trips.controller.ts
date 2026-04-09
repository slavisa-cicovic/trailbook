import { Body, Controller, Delete, Get, Inject, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";

import { AuthService } from "../auth/auth.service";
import type { ShareTripDto } from "./dto/share-trip.dto";
import type { SyncTripDto } from "./dto/sync-trip.dto";
import { TripsService } from "./trips.service";

@Controller("trips")
export class TripsController {
  constructor(
    @Inject(TripsService) private readonly tripsService: TripsService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  @Post("sync")
  async syncTrip(@Body() payload: SyncTripDto, @Req() request: Request) {
    const user = await this.requireAuthenticatedUser(request);
    return this.tripsService.syncTrip(user.id, payload);
  }

  @Post(":tripId/shares")
  async shareTrip(@Param("tripId") tripId: string, @Body() input: ShareTripDto, @Req() request: Request) {
    const user = await this.requireAuthenticatedUser(request);
    return this.tripsService.shareTrip(user.id, tripId, input);
  }

  @Get(":tripId/shares")
  async listTripShares(@Param("tripId") tripId: string, @Req() request: Request) {
    const user = await this.requireAuthenticatedUser(request);
    return this.tripsService.listTripShares(user.id, tripId);
  }

  @Delete(":tripId/shares/:shareId")
  async revokeTripShare(
    @Param("tripId") tripId: string,
    @Param("shareId") shareId: string,
    @Req() request: Request,
  ) {
    const user = await this.requireAuthenticatedUser(request);
    return this.tripsService.revokeTripShare(user.id, tripId, shareId);
  }

  @Get("shared/list")
  async listSharedTrips(@Req() request: Request) {
    const user = await this.requireAuthenticatedUser(request);
    return this.tripsService.listSharedTrips(user.id);
  }

  @Get("shared/:shareId")
  async getSharedTrip(@Param("shareId") shareId: string, @Req() request: Request) {
    const user = await this.requireAuthenticatedUser(request);
    return this.tripsService.getSharedTrip(user.id, shareId);
  }

  private getSessionToken(request: Request) {
    const header = request.get("authorization");
    const bearerToken = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
    return bearerToken || request.cookies?.trailbook_session;
  }

  private async requireAuthenticatedUser(request: Request) {
    const currentUser = await this.authService.getCurrentUser(this.getSessionToken(request));

    if (!currentUser.user) {
      throw new UnauthorizedException("Authentication required.");
    }

    return currentUser.user;
  }
}
