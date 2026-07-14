import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";

import { AuthService } from "../auth/auth.service";
import { PurchaseApplicationService } from "../purchases/purchase-application.service";
import { WaypointImagesService } from "./waypoint-images.service";

export interface ImageUploadRequestDto {
  imageId: string;
  contentType?: string | null;
  sizeBytes?: number | null;
}

export interface CompleteImageUploadRequestDto {
  contentType?: string | null;
  sizeBytes?: number | null;
  storageKey?: string | null;
}

@Controller("waypoints")
export class WaypointImagesController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(PurchaseApplicationService)
    private readonly purchaseApplication: PurchaseApplicationService,
    @Inject(WaypointImagesService) private readonly waypointImagesService: WaypointImagesService,
  ) {}

  @Post(":waypointId/images")
  async requestImageUpload(
    @Param("waypointId") waypointId: string,
    @Body() input: ImageUploadRequestDto,
    @Req() request: Request,
  ) {
    const user = await this.authService.requireAuthenticatedUser(request);
    await this.purchaseApplication.requirePremium(user);
    return this.waypointImagesService.requestUpload(user.id, {
      contentType: input.contentType ?? "image/jpeg",
      imageId: input.imageId,
      sizeBytes: input.sizeBytes ?? null,
      waypointId,
    });
  }

  @Post(":waypointId/images/:imageId/complete")
  async completeImageUpload(
    @Param("waypointId") waypointId: string,
    @Param("imageId") imageId: string,
    @Body() input: CompleteImageUploadRequestDto,
    @Req() request: Request,
  ) {
    const user = await this.authService.requireAuthenticatedUser(request);
    await this.purchaseApplication.requirePremium(user);
    return this.waypointImagesService.completeUpload(user.id, {
      contentType: input.contentType ?? null,
      imageId,
      sizeBytes: input.sizeBytes ?? null,
      storageKey: input.storageKey ?? null,
      waypointId,
    });
  }

  @Get(":waypointId/images")
  async getImages(@Param("waypointId") waypointId: string, @Req() request: Request) {
    const user = await this.authService.requireAuthenticatedUser(request);
    await this.purchaseApplication.requirePremium(user);
    await this.waypointImagesService.assertWaypointOwnedByUser(user.id, waypointId);
    return this.waypointImagesService.getImages(waypointId);
  }

  @Delete(":waypointId/images/:imageId")
  @HttpCode(204)
  async deleteImage(
    @Param("waypointId") waypointId: string,
    @Param("imageId") imageId: string,
    @Req() request: Request,
  ) {
    const user = await this.authService.requireAuthenticatedUser(request);
    await this.waypointImagesService.deleteImage(user.id, waypointId, imageId);
  }
}
