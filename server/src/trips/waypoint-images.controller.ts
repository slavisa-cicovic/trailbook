import { Body, Controller, Get, Inject, Param, Post, Req } from "@nestjs/common";
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

  @Get(":waypointId/images")
  async getImages(@Param("waypointId") waypointId: string, @Req() request: Request) {
    await this.authService.requireAuthenticatedUser(request);
    return this.waypointImagesService.getImages(waypointId);
  }
}
