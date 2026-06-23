import { Body, Controller, Get, HttpStatus, Inject, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { AuthService } from "../auth/auth.service";
import type { TripBundleDto } from "./dto/sync-trip.dto";
import { TripsService } from "./trips.service";

@Controller("trips")
export class TripsController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(TripsService) private readonly tripsService: TripsService,
  ) {}

  @Get()
  async list(@Req() request: Request) {
    const user = await this.authService.requireAuthenticatedUser(request);
    return this.tripsService.listForUser(user.id);
  }

  @Post()
  async upload(@Body() bundle: TripBundleDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const user = await this.authService.requireAuthenticatedUser(request);
    const created = await this.tripsService.save(user.id, bundle);
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return {
      accepted: true,
      created,
      clientTripId: bundle.trip.clientTripId,
    };
  }

  @Get(":clientTripId")
  async get(@Param("clientTripId") clientTripId: string, @Req() request: Request) {
    const user = await this.authService.requireAuthenticatedUser(request);
    return this.tripsService.get(clientTripId, user.id);
  }
}
