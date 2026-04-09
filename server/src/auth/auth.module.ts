import { Module } from "@nestjs/common";

import { MailModule } from "../mail/mail.module";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SocialAuthService } from "./social-auth.service";

@Module({
  imports: [UsersModule, MailModule],
  controllers: [AuthController],
  providers: [AuthService, SocialAuthService],
})
export class AuthModule {}
