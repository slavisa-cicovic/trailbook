import { Body, Controller, Get, Inject, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { SESSION_COOKIE_NAME } from "./auth.constants";
import { AuthService } from "./auth.service";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { RefreshSessionDto } from "./dto/refresh-session.dto";
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

  @Get("verify-email")
  async verifyEmail(@Query("token") token: string | undefined, @Res() response: Response) {
    if (!token) {
      return response.redirect(this.buildVerificationRedirectUrl("missing_token"));
    }

    try {
      await this.authService.verifyEmail(token);
      return response.redirect(this.buildVerificationRedirectUrl("verified"));
    } catch (error) {
      return response.redirect(this.buildVerificationRedirectUrl(this.toErrorReason(error)));
    }
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

  @Post("mobile/register")
  async registerMobile(@Body() input: RegisterDto) {
    return this.authService.register(input);
  }

  @Post("mobile/login")
  async loginMobile(@Body() input: LoginDto, @Req() request: Request) {
    const result = await this.authService.login(input, {
      ipAddress: request.ip,
      userAgent: request.get("user-agent") || null,
    });

    return this.toMobileAuthResponse(result);
  }

  @Post("mobile/refresh")
  async refreshMobile(@Body() input: RefreshSessionDto, @Req() request: Request) {
    const result = await this.authService.refreshMobileSession(input.refreshToken, {
      ipAddress: request.ip,
      userAgent: request.get("user-agent") || null,
    });

    return this.toMobileAuthResponse(result);
  }

  @Post("logout")
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    response.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return this.authService.logout(this.getSessionToken(request));
  }

  @Post("mobile/logout")
  async logoutMobile(@Req() request: Request) {
    return this.authService.logout(this.getSessionToken(request));
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
    return this.authService.getCurrentUser(this.getSessionToken(request));
  }

  @Get("mobile/me")
  meMobile(@Req() request: Request) {
    return this.authService.getCurrentUser(this.getSessionToken(request));
  }

  @Get("providers")
  providers() {
    return this.socialAuthService.getProviderAvailability();
  }

  @Get("google")
  google(@Res() response: Response) {
    return this.startSocialLogin("google", "web", response);
  }

  @Get("mobile/google")
  mobileGoogle(@Query("redirect_uri") redirectUri: string | undefined, @Res() response: Response) {
    return this.startSocialLogin("google", "mobile", response, redirectUri);
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
    return this.startSocialLogin("facebook", "web", response);
  }

  @Get("mobile/facebook")
  mobileFacebook(@Query("redirect_uri") redirectUri: string | undefined, @Res() response: Response) {
    return this.startSocialLogin("facebook", "mobile", response, redirectUri);
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
    return this.startSocialLogin("apple", "web", response);
  }

  @Get("mobile/apple")
  mobileApple(@Query("redirect_uri") redirectUri: string | undefined, @Res() response: Response) {
    return this.startSocialLogin("apple", "mobile", response, redirectUri);
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

  @Post("mobile/social/complete")
  completeMobileSocial(@Body("handoffCode") handoffCode: string) {
    return this.socialAuthService.consumeAuthHandoff(handoffCode);
  }

  private startSocialLogin(
    provider: SocialProvider,
    client: "web" | "mobile",
    response: Response,
    redirectUri?: string,
  ) {
    try {
      const authorizationRequest = this.socialAuthService.createAuthorizationRequest(provider, client, redirectUri);
      response.cookie(authorizationRequest.cookieName, authorizationRequest.stateContext, {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: `/api/auth/${provider}`,
        maxAge: 1000 * 60 * 10,
      });
      return response.redirect(authorizationRequest.authorizationUrl);
    } catch (error) {
      if (client === "mobile" && redirectUri) {
        const url = new URL(redirectUri);
        url.searchParams.set("provider", provider);
        url.searchParams.set("error", this.toErrorReason(error));
        return response.redirect(url.toString());
      }

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
    const stateContext = this.socialAuthService.decodeStateContext(expectedState);

    response.clearCookie(stateCookieName, { path: `/api/auth/${provider}` });

    try {
      const result = await this.socialAuthService.handleCallback(provider, input, expectedState, {
        ipAddress: request.ip,
        userAgent: request.get("user-agent") || null,
      });

      this.setSessionCookie(response, result.session.id);
      return response.redirect(result.redirectUrl);
    } catch (error) {
      if (stateContext?.client === "mobile" && stateContext.redirectUri) {
        return response.redirect(
          this.socialAuthService.getMobileErrorRedirectUrl(
            provider,
            stateContext.redirectUri,
            this.toErrorReason(error),
          ),
        );
      }

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

  private getSessionToken(request: Request) {
    const header = request.get("authorization");
    const bearerToken = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
    return bearerToken || request.cookies?.[SESSION_COOKIE_NAME];
  }

  private buildVerificationRedirectUrl(status: string) {
    const webAppUrl = process.env.WEB_APP_URL || "http://localhost:3000";
    const redirectUrl = new URL("/login", webAppUrl);
    redirectUrl.searchParams.set("verification", status);
    return redirectUrl.toString();
  }

  private toMobileAuthResponse(result: Awaited<ReturnType<AuthService["login"]>>) {
    return {
      sessionToken: result.accessToken.token,
      sessionExpiresAt: result.accessToken.expiresAt,
      refreshToken: result.session.id,
      refreshExpiresAt: result.session.expiresAt,
      user: result.user,
    };
  }

  private toErrorReason(error: unknown) {
    if (error instanceof Error) {
      return error.message.replace(/\s+/g, "_").toLowerCase();
    }

    return "social_auth_failed";
  }
}
