import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from "@nestjs/common";

import { AuthService } from "./auth.service";

export interface SocialLoginRequest {
  provider: string;
  idToken: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("social")
  loginWithSocial(@Body() input: SocialLoginRequest) {
    return this.authService.loginWithSocial(input);
  }

  @Post("refresh")
  refresh(@Body() input: RefreshRequest) {
    return this.authService.refresh(input.refreshToken);
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() input: RefreshRequest) {
    await this.authService.logout(input.refreshToken);
  }
}
