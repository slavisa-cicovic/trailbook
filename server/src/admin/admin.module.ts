import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { AdminController } from "./admin.controller";
import { AdminDashboardService } from "./admin-dashboard.service";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [AdminController],
  providers: [AdminDashboardService],
})
export class AdminModule {}
