import { Body, Controller, Get, Inject, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { SESSION_COOKIE_NAME } from "./auth.constants";
import { AuthService } from "./auth.service";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

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
