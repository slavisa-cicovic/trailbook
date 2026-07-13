import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { Environment } from "@apple/app-store-server-library";

@Injectable()
export class ApplePurchaseConfig {
  get bundleId() {
    return this.required("APPLE_BUNDLE_ID");
  }

  get appAppleId() {
    const value = process.env.APPLE_APP_ID;
    if (!value || !/^\d+$/.test(value)) {
      throw this.configurationError("APPLE_APP_ID");
    }
    return Number(value);
  }

  get issuerId() {
    return this.required("APPLE_APP_STORE_ISSUER_ID");
  }

  get keyId() {
    return this.required("APPLE_APP_STORE_KEY_ID");
  }

  get privateKey() {
    return this.required("APPLE_APP_STORE_PRIVATE_KEY").replace(/\\n/g, "\n");
  }

  get productIds() {
    return new Set([
      this.required("APPLE_PREMIUM_MONTHLY_PRODUCT_ID"),
      this.required("APPLE_PREMIUM_YEARLY_PRODUCT_ID"),
    ]);
  }

  get allowedEnvironments(): Environment[] {
    const environments: Environment[] = [];
    if (process.env.APPLE_APP_STORE_ALLOW_SANDBOX !== "false") {
      environments.push(Environment.SANDBOX);
    }
    if (process.env.APPLE_APP_STORE_ALLOW_PRODUCTION === "true") {
      environments.push(Environment.PRODUCTION);
    }
    if (environments.length === 0) {
      throw new ServiceUnavailableException({
        code: "APPLE_PURCHASE_VERIFICATION_FAILED",
        message: "No Apple App Store environment is enabled.",
      });
    }

    const defaultEnvironment =
      process.env.APPLE_APP_STORE_DEFAULT_ENVIRONMENT === "production"
        ? Environment.PRODUCTION
        : Environment.SANDBOX;
    return environments.includes(defaultEnvironment)
      ? [defaultEnvironment, ...environments.filter((value) => value !== defaultEnvironment)]
      : environments;
  }

  private required(name: string) {
    const value = process.env[name]?.trim();
    if (!value) throw this.configurationError(name);
    return value;
  }

  private configurationError(name: string) {
    return new ServiceUnavailableException({
      code: "APPLE_PURCHASE_VERIFICATION_FAILED",
      message: `Apple purchase configuration is missing ${name}.`,
    });
  }
}
