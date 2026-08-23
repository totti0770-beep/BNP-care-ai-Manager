import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const usersTable = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  // Set only for accounts that sign in with a password. OIDC accounts leave it
  // null and can never be password-authenticated, because verifyPassword()
  // treats a null hash as a failure rather than as "no password required".
  // Format and hashing live in artifacts/api-server/src/lib/password.ts.
  passwordHash: varchar("password_hash"),
  // Authorization roles. Never assigned from client input — see grantRolesFor()
  // in artifacts/api-server/src/routes/auth.ts.
  roles: text("roles")
    .array()
    .notNull()
    .default(sql`ARRAY['user']::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type UpsertUser = typeof usersTable.$inferInsert;
export type User = typeof usersTable.$inferSelect;
