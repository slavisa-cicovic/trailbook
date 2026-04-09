import { Body, Controller, Get, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";

import { AuthService } from "./auth.service";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";

const SESSION_COOKIE_NAME = "trailbook_session";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  register(@Body() input: RegisterDto) {
    return this.authService.register(input);
  }

  @Post("login")
  login(@Body() input: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = this.authService.login(input);

    response.cookie(SESSION_COOKIE_NAME, result.session.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
    });

    return {
      user: result.user,
    };
  }

  @Post("logout")
  logout(@Query("sessionId") sessionId: string | undefined, @Res({ passthrough: true }) response: Response) {
    response.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return this.authService.logout(sessionId);
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
  me(@Query("sessionId") sessionId: string | undefined) {
    return this.authService.getCurrentUser(sessionId);
  }

  @Get("google")
  google() {
    return this.authService.beginSocialLogin("google");
  }

  @Get("google/callback")
  googleCallback() {
    return this.authService.beginSocialLogin("google");
  }

  @Get("facebook")
  facebook() {
    return this.authService.beginSocialLogin("facebook");
  }

  @Get("facebook/callback")
  facebookCallback() {
    return this.authService.beginSocialLogin("facebook");
  }

  @Get("apple")
  apple() {
    return this.authService.beginSocialLogin("apple");
  }

  @Get("apple/callback")
  appleCallback() {
    return this.authService.beginSocialLogin("apple");
  }
}
