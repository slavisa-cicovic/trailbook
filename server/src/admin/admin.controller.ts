import { Controller, Get, Inject, Query, Req } from "@nestjs/common";
import type { Request } from "express";

import { AuthService } from "../auth/auth.service";
import { AdminService } from "./admin.service";

@Controller("admin")
export class AdminController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(AdminService) private readonly adminService: AdminService,
  ) {}

  @Get("dashboard")
  async getDashboard(@Query("from") from: string | undefined, @Query("to") to: string | undefined, @Req() request: Request) {
    const user = await this.authService.requireAuthenticatedUser(request);
    return this.adminService.getDashboardMetrics(user, { from, to });
  }
}
