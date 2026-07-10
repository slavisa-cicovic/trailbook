import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { AuthService } from "./auth.service";

export interface SocialLoginRequest {
  provider: string;
  idToken: string;
}

export interface RefreshRequest {
  refreshToken?: string;
}

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Get("providers")
  providers() {
    return this.authService.getProviderAvailability();
  }

  @Get("me")
  async me(@Req() request: Request) {
    const user = await this.authService.getCurrentUser(request);
    return {
      user: user
        ? {
            ...user,
            providers: [],
          }
        : null,
    };
  }

  @Get(":provider")
  async startOAuth(
    @Param("provider") provider: string,
    @Query("returnTo") returnTo: string | undefined,
    @Res() response: Response,
  ) {
    const url = await this.authService.buildOAuthAuthorizationUrl(provider, returnTo);
    response.redirect(url);
  }

  @Get(":provider/callback")
  async completeOAuth(
    @Param("provider") provider: string,
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Res() response: Response,
  ) {
    await this.completeOAuthResponse(provider, code, state, response);
  }

  @Post(":provider/callback")
  async completeOAuthPost(
    @Param("provider") provider: string,
    @Body("code") code: string | undefined,
    @Body("state") state: string | undefined,
    @Res() response: Response,
  ) {
    await this.completeOAuthResponse(provider, code, state, response);
  }

  private async completeOAuthResponse(
    provider: string,
    code: string | undefined,
    state: string | undefined,
    response: Response,
  ) {
    const result = await this.authService.completeOAuthCallback(provider, code, state);

    if (result.returnTo) {
      const redirectUrl = new URL(result.returnTo);
      redirectUrl.searchParams.set("accessToken", result.accessToken);
      redirectUrl.searchParams.set("refreshToken", result.refreshToken);
      redirectUrl.searchParams.set("userId", result.user.id);
      redirectUrl.searchParams.set("email", result.user.email);
      redirectUrl.searchParams.set("displayName", result.user.displayName);
      redirectUrl.searchParams.set("role", result.user.role);
      response.redirect(redirectUrl.toString());
      return;
    }

    response.cookie(
      this.authService.getSessionCookieName(),
      result.refreshToken,
      this.authService.getSessionCookieOptions(),
    );
    response.redirect(result.webRedirectUrl);
  }

  @Post("social")
  loginWithSocial(@Body() input: SocialLoginRequest) {
    return this.authService.loginWithSocial(input);
  }

  @Post("refresh")
  refresh(@Body() input: RefreshRequest) {
    return this.authService.refresh(input.refreshToken ?? "");
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() input: RefreshRequest, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = input.refreshToken || this.authService.getSessionRefreshToken(request) || undefined;
    await this.authService.logout(refreshToken);
    response.clearCookie(this.authService.getSessionCookieName(), { path: "/" });
  }
}
