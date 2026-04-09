import { Body, Controller, Get, Inject, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { SESSION_COOKIE_NAME } from "./auth.constants";
import { AuthService } from "./auth.service";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { SocialAuthService } from "./social-auth.service";

type SocialProvider = "google" | "facebook" | "apple";

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(SocialAuthService) private readonly socialAuthService: SocialAuthService,
  ) {}

  @Post("register")
  register(@Body() input: RegisterDto) {
    return this.authService.register(input);
  }

  @Post("login")
  async login(@Body() input: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(input, {
      ipAddress: request.ip,
      userAgent: request.get("user-agent") || null,
    });

    this.setSessionCookie(response, result.session.id);

    return {
      user: result.user,
    };
  }

  @Post("logout")
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    response.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return this.authService.logout(request.cookies?.[SESSION_COOKIE_NAME]);
  }

  @Post("forgot-password")
  forgotPassword(@Body() input: ForgotPasswordDto) {
    return this.authService.forgotPassword(input);
  }

  @Post("reset-password")
  resetPassword(@Body() input: ResetPasswordDto) {
    return this.authService.resetPassword(input);
  }

  @Get("me")
  me(@Req() request: Request) {
    return this.authService.getCurrentUser(request.cookies?.[SESSION_COOKIE_NAME]);
  }

  @Get("providers")
  providers() {
    return this.socialAuthService.getProviderAvailability();
  }

  @Get("google")
  google(@Res() response: Response) {
    return this.startSocialLogin("google", response);
  }

  @Get("google/callback")
  googleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    return this.finishSocialLogin("google", { code, state, error }, request, response);
  }

  @Get("facebook")
  facebook(@Res() response: Response) {
    return this.startSocialLogin("facebook", response);
  }

  @Get("facebook/callback")
  facebookCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    return this.finishSocialLogin("facebook", { code, state, error }, request, response);
  }

  @Get("apple")
  apple(@Res() response: Response) {
    return this.startSocialLogin("apple", response);
  }

  @Get("apple/callback")
  appleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Query("user") user: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    return this.finishSocialLogin("apple", { code, state, error, user }, request, response);
  }

  private startSocialLogin(provider: SocialProvider, response: Response) {
    try {
      const authorizationRequest = this.socialAuthService.createAuthorizationRequest(provider);
      response.cookie(authorizationRequest.cookieName, authorizationRequest.state, {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: `/api/auth/${provider}`,
        maxAge: 1000 * 60 * 10,
      });
      return response.redirect(authorizationRequest.authorizationUrl);
    } catch (error) {
      return response.redirect(this.socialAuthService.getErrorRedirectUrl(provider, this.toErrorReason(error)));
    }
  }

  private async finishSocialLogin(
    provider: SocialProvider,
    input: { code?: string; state?: string; error?: string; user?: string },
    request: Request,
    response: Response,
  ) {
    const stateCookieName = this.socialAuthService.getStateCookieName(provider);
    const expectedState = request.cookies?.[stateCookieName];

    response.clearCookie(stateCookieName, { path: `/api/auth/${provider}` });

    try {
      const result = await this.socialAuthService.handleCallback(provider, input, expectedState, {
        ipAddress: request.ip,
        userAgent: request.get("user-agent") || null,
      });

      this.setSessionCookie(response, result.session.id);
      return response.redirect(this.socialAuthService.getSuccessRedirectUrl());
    } catch (error) {
      return response.redirect(this.socialAuthService.getErrorRedirectUrl(provider, this.toErrorReason(error)));
    }
  }

  private setSessionCookie(response: Response, sessionToken: string) {
    response.cookie(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
    });
  }

  private toErrorReason(error: unknown) {
    if (error instanceof Error) {
      return error.message.replace(/\s+/g, "_").toLowerCase();
    }

    return "social_auth_failed";
  }
}
