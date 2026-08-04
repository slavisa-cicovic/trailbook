import { Injectable, UnauthorizedException } from "@nestjs/common";
import { OAuth2Client } from "google-auth-library";

import { GooglePurchaseConfig } from "./google-purchase.config";

export const GOOGLE_PUBSUB_AUTH = Symbol("GOOGLE_PUBSUB_AUTH");

export interface GooglePubsubAuth {
  verify(authorization: string | undefined): Promise<void>;
}

@Injectable()
export class GoogleOidcPubsubAuth implements GooglePubsubAuth {
  private readonly client = new OAuth2Client();

  constructor(private readonly config: GooglePurchaseConfig) {}

  async verify(authorization: string | undefined) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization?.trim() ?? "");
    if (!match) throw this.unauthorized();
    try {
      const ticket = await this.client.verifyIdToken({
        audience: this.config.pubsubAudience,
        idToken: match[1],
      });
      const payload = ticket.getPayload();
      if (
        payload?.email_verified !== true ||
        payload.email?.toLowerCase() !== this.config.pubsubServiceAccountEmail
      ) {
        throw this.unauthorized();
      }
    } catch {
      throw this.unauthorized();
    }
  }

  private unauthorized() {
    return new UnauthorizedException("Invalid Google Pub/Sub identity.");
  }
}
