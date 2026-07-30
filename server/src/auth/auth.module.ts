import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { AccountDeletionService } from "./account-deletion.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [AccountDeletionService, AuthService],
  exports: [AuthService],
})
export class AuthModule {}
