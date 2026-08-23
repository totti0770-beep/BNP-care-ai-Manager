import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { grantRolesFor } from "./authUser";
import { hashPassword, rejectWeakPassword } from "./password";

/**
 * Creates the first sign-in account on a fresh deployment.
 *
 * A new database has no users and no OIDC issuer to create one, so without this
 * a correctly deployed stack has no door. Driven entirely by environment:
 *
 *   BOOTSTRAP_ADMIN_EMAIL     the account to create
 *   BOOTSTRAP_ADMIN_PASSWORD  its password
 *
 * Both unset is the normal steady state and does nothing.
 *
 * Three rules, each there because the alternative has burned this project or
 * projects like it:
 *
 *  - **Never overwrites an existing account.** Otherwise leaving the variables
 *    set would silently reset the admin password on every restart, and anyone
 *    who saw the deploy config would own the account forever.
 *  - **Refuses a weak password** rather than accepting it with a warning. This
 *    repository already shipped `Admin@123` in a browser bundle once.
 *  - **Grants admin only through ADMIN_EMAILS**, via the same `grantRolesFor`
 *    the login path uses. The bootstrap does not get its own privilege rule, so
 *    setting BOOTSTRAP_ADMIN_EMAIL without listing it in ADMIN_EMAILS creates a
 *    plain user — and says so.
 */
export async function bootstrapAdmin(
  log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void },
): Promise<void> {
  const email = (process.env["BOOTSTRAP_ADMIN_EMAIL"] ?? "").trim().toLowerCase();
  const password = process.env["BOOTSTRAP_ADMIN_PASSWORD"] ?? "";

  if (!email && !password) return;

  if (!email || !password) {
    log.warn(
      { hasEmail: Boolean(email), hasPassword: Boolean(password) },
      "Admin bootstrap skipped: BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must both be set",
    );
    return;
  }

  const weak = rejectWeakPassword(password);
  if (weak) {
    // Refuse rather than start with a guessable admin. A deployment that will
    // not boot is louder, and safer, than one anybody can sign into.
    throw new Error(`BOOTSTRAP_ADMIN_PASSWORD rejected: ${weak}`);
  }

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (existing) {
    log.info({ email }, "Admin bootstrap skipped: the account already exists");
    return;
  }

  const roles = grantRolesFor(email);
  await db.insert(usersTable).values({
    email,
    passwordHash: await hashPassword(password),
    roles,
  });

  log.info(
    { email, roles, admin: roles.includes("admin") },
    roles.includes("admin")
      ? "Bootstrapped the first admin account"
      : "Bootstrapped a sign-in account — NOT an admin, because the address is not in ADMIN_EMAILS",
  );
}
