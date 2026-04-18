import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";

import { AuthService } from "../auth/auth.service";
import type { ShareTripDto } from "./dto/share-trip.dto";
import type { SyncTripDto } from "./dto/sync-trip.dto";
import { UpdateTripDto } from "./dto/update-trip.dto";
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

  @Get("overview")
  async getTripOverview(
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Req() request: Request,
  ) {
    const user = await this.requireAuthenticatedUser(request);
    return this.tripsService.getTripOverview(user.id, from, to);
  }

  @Get("mine")
  async listOwnedTrips(@Req() request: Request) {
    const user = await this.requireAuthenticatedUser(request);
    return this.tripsService.listOwnedTrips(user.id);
  }

  @Get("mine/:tripId")
  async getOwnedTrip(@Param("tripId") tripId: string, @Req() request: Request) {
    const user = await this.requireAuthenticatedUser(request);
    return this.tripsService.getOwnedTrip(user.id, tripId);
  }

  @Get(":tripId")
  async getTripDetail(@Param("tripId") tripId: string, @Req() request: Request) {
    const user = await this.requireAuthenticatedUser(request);
    return this.tripsService.getTripDetail(user.id, tripId);
  }

  @Patch(":tripId")
  async updateTrip(@Param("tripId") tripId: string, @Body() input: UpdateTripDto, @Req() request: Request) {
    const user = await this.requireAuthenticatedUser(request);
    return this.tripsService.updateTrip(user.id, tripId, input);
  }

  @Post(":tripId/shares")
  async shareTrip(@Param("tripId") tripId: string, @Body() input: ShareTripDto, @Req() request: Request) {
    const user = await this.requireAuthenticatedUser(request);
    return this.tripsService.shareTrip(user.id, tripId, input);
  }

  @Get("shares/recipients")
  async listShareRecipients(@Req() request: Request) {
    const user = await this.requireAuthenticatedUser(request);
    return this.tripsService.listShareRecipients(user.id);
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

  @Post(":tripId/attachments/upload")
  @UseInterceptors(FileInterceptor("file"))
  async uploadTripAttachment(
    @Param("tripId") tripId: string,
    @Body("attachmentLocalId") attachmentLocalId: string,
    @UploadedFile()
    uploadedFile:
      | {
          buffer: Buffer;
          mimetype?: string;
          originalname?: string;
          size?: number;
        }
      | undefined,
    @Req() request: Request,
  ) {
    const user = await this.requireAuthenticatedUser(request);
    return this.tripsService.uploadTripAttachment(user.id, tripId, attachmentLocalId, uploadedFile ?? null);
  }

  @Get("attachments/:attachmentId/content")
  async getAttachmentContent(
    @Param("attachmentId") attachmentId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const user = await this.requireAuthenticatedUser(request);
    const attachment = await this.tripsService.getAttachmentContent(user.id, attachmentId);

    if (attachment.mimeType) {
      response.type(attachment.mimeType);
    }

    response.sendFile(attachment.absolutePath);
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
