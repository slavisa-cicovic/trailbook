import { z } from "zod";

const AuthProviderSchema = z.enum(["local", "google", "facebook", "apple"]);
const UserRoleSchema = z.enum(["user", "web_user", "test_user", "admin"]);

export const AuthenticatedUserSummarySchema = z.object({
  displayName: z.string(),
  email: z.string(),
  id: z.string(),
  providers: z.array(AuthProviderSchema),
  role: UserRoleSchema,
});

export const MobileAuthResultSchema = z.object({
  sessionToken: z.string(),
  sessionExpiresAt: z.string(),
  refreshToken: z.string(),
  refreshExpiresAt: z.string(),
  user: AuthenticatedUserSummarySchema,
});

export const GetCurrentUserResponseSchema = z.object({
  user: AuthenticatedUserSummarySchema.nullable(),
});
