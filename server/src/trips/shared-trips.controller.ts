import { Body, Controller, Get, Inject, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";

import type { TripBundleDto } from "./dto/sync-trip.dto";
import { TripsService } from "./trips.service";
import { WaypointImagesService } from "./waypoint-images.service";

interface SharedWaypointImage {
  capturedAt: string | null;
  getUrl: string;
  imageId: string;
  objectKey: string;
  photoLatitude: number | null;
  photoLongitude: number | null;
}

type ImagesByWaypointId = Record<string, SharedWaypointImage[]>;

interface SharedTripAccessRequestDto {
  pin?: string;
}

interface SharedTripResponseDto {
  bundle: TripBundleDto;
  imagesByWaypointId: ImagesByWaypointId;
}

@Controller("shared/trips")
export class SharedTripsController {
  constructor(
    @Inject(TripsService) private readonly tripsService: TripsService,
    @Inject(WaypointImagesService) private readonly waypointImagesService: WaypointImagesService,
  ) {}

  @Get(":token")
  page(@Res() response: Response) {
    response.type("html").send(renderPinProtectedStub());
  }

  @Post(":token/access")
  async access(
    @Param("token") token: string,
    @Body() input: SharedTripAccessRequestDto,
  ): Promise<SharedTripResponseDto> {
    const bundle = await this.tripsService.getShared(token, input.pin ?? "");
    const imagesByWaypointId = await this.getImagesByWaypointId(bundle);
    return { bundle, imagesByWaypointId };
  }

  private async getImagesByWaypointId(bundle: TripBundleDto): Promise<ImagesByWaypointId> {
    const entries = await Promise.all(
      bundle.waypoints.map(async (waypoint) => {
        const images = await this.waypointImagesService.getImages(waypoint.id);
        return [waypoint.id, images] as const;
      }),
    );

    return Object.fromEntries(entries);
  }
}

function renderPinProtectedStub(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Trailbook shared trip</title>
    <meta name="description" content="A PIN-protected Trailbook shared trip." />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="Trailbook shared trip" />
    <meta property="og:description" content="Open this PIN-protected shared trip in Trailbook web." />
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 32px;">
    <h1>Trailbook shared trip</h1>
    <p>This shared trip is PIN protected. Open the web link and enter the PIN sent by the trip owner.</p>
  </body>
</html>`;
}
