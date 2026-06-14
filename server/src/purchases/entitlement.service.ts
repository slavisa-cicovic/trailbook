import { ForbiddenException, Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { PurchaseApplicationService } from "./purchase-application.service";
import type { EntitlementCode, PurchaseAccessResponse } from "./purchase.types";

function isEntitlementEnforcementDisabled() {
  return process.env.DISABLE_PURCHASE_ENTITLEMENT_ENFORCEMENT === "true";
}

@Injectable()
export class EntitlementService {
  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(PurchaseApplicationService) private readonly purchaseApplicationService: PurchaseApplicationService,
  ) {}

  getCurrentAccess(userId: string): Promise<PurchaseAccessResponse> {
    return this.purchaseApplicationService.getCurrentAccess(userId);
  }

  async hasEntitlement(userId: string, entitlementCode: EntitlementCode): Promise<boolean> {
    if (isEntitlementEnforcementDisabled()) {
      return true;
    }

    const now = new Date();
    const entitlement = await this.databaseService.userEntitlement.findFirst({
      where: {
        active: true,
        entitlementCode,
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
      },
    });

    return entitlement !== null;
  }

  async requireEntitlement(userId: string, entitlementCode: EntitlementCode): Promise<void> {
    if (await this.hasEntitlement(userId, entitlementCode)) {
      return;
    }

    throw new ForbiddenException(`Trailbook Premium required for ${entitlementCode}.`);
  }
}
