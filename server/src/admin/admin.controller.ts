import { Controller, ForbiddenException, Get, Inject, Query, Req, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";

import { AuthService } from "../auth/auth.service";
import { AdminDashboardService } from "./admin-dashboard.service";

@Controller("admin")
export class AdminController {
  constructor(
    @Inject(AdminDashboardService) private readonly adminDashboardService: AdminDashboardService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  @Get("dashboard")
  async getDashboard(@Query("from") from: string | undefined, @Query("to") to: string | undefined, @Req() request: Request) {
    await this.requireAdminUser(request);
    return this.adminDashboardService.getDashboardMetrics(from, to);
  }

  private getSessionToken(request: Request) {
    const header = request.get("authorization");
    const bearerToken = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
    return bearerToken || request.cookies?.trailbook_session;
  }

  private async requireAdminUser(request: Request) {
    const currentUser = await this.authService.getCurrentUser(this.getSessionToken(request));

    if (!currentUser.user) {
      throw new UnauthorizedException("Authentication required.");
    }

    if (currentUser.user.role !== "admin") {
      throw new ForbiddenException("Admin access required.");
    }

    return currentUser.user;
  }
}
