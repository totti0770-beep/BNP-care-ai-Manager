import type { AuthUser } from "@workspace/api-zod";

/** The subset of the users row these helpers read. */
export interface UserRecord {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  roles: string[];
}

/**
 * Roles are never taken from client input or from OIDC claims. The only way to
 * become an admin is to be listed in ADMIN_EMAILS, which is operator-controlled.
 */
export function grantRolesFor(email: string | null): string[] {
  const admins = (process.env["ADMIN_EMAILS"] ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (email && admins.includes(email.toLowerCase())) {
    return ["user", "admin"];
  }
  return ["user"];
}

export function toAuthUser(user: UserRecord): AuthUser {
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email ||
    user.id;

  return {
    id: user.id,
    name,
    roles: user.roles,
    // These are optional in the contract, so omit rather than send null.
    ...(user.email ? { email: user.email } : {}),
    ...(user.profileImageUrl ? { profileImageUrl: user.profileImageUrl } : {}),
  };
}
