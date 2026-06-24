import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";

import { AuthService } from "../auth/auth.service";
import { WaypointImagesService } from "./waypoint-images.service";

export interface ImageUploadRequestDto {
  imageId: string;
  contentType?: string | null;
}

@Controller("waypoints")
export class WaypointImagesController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(WaypointImagesService) private readonly waypointImagesService: WaypointImagesService,
  ) {}

  @Post(":waypointId/images")
  async requestImageUpload(
    @Param("waypointId") waypointId: string,
    @Body() input: ImageUploadRequestDto,
    @Req() request: Request,
  ) {
    await this.authService.requireAuthenticatedUser(request);
    return this.waypointImagesService.requestUpload(waypointId, input.imageId, input.contentType ?? "image/jpeg");
  }

  @Post(":waypointId/images/:imageId/complete")
  async completeImageUpload(
    @Param("waypointId") waypointId: string,
    @Param("imageId") imageId: string,
    @Req() request: Request,
  ) {
    await this.authService.requireAuthenticatedUser(request);
    return this.waypointImagesService.completeUpload(waypointId, imageId);
  }

  @Get(":waypointId/images")
  async getImages(@Param("waypointId") waypointId: string, @Req() request: Request) {
    await this.authService.requireAuthenticatedUser(request);
    return this.waypointImagesService.getImages(waypointId);
  }

  @Delete(":waypointId/images/:imageId")
  @HttpCode(204)
  async deleteImage(
    @Param("waypointId") waypointId: string,
    @Param("imageId") imageId: string,
    @Req() request: Request,
  ) {
    await this.authService.requireAuthenticatedUser(request);
    await this.waypointImagesService.deleteImage(waypointId, imageId);
  }
}
