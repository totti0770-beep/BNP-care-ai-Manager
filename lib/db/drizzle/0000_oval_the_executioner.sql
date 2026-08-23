-- Baseline.
--
-- Written to be idempotent rather than left as drizzle generated it, because
-- these tables already exist in deployed databases that predate any migration
-- history (they were created by `drizzle-kit push`). A plain CREATE TABLE would
-- fail there on "relation already exists"; this applies cleanly to both a fresh
-- database and an existing one.
--
-- Everything after this migration is ordinary generated SQL.

CREATE TABLE IF NOT EXISTS "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
-- Added after `users` shipped. Postgres 11+ applies a non-volatile default
-- without rewriting the table, so existing rows become {user}. Note that any
-- pre-existing admin is granted admin again on their next sign-in, when
-- upsertUser re-derives roles from ADMIN_EMAILS — there is deliberately no
-- backfill here, because the allowlist is the single source of truth.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "roles" text[] DEFAULT ARRAY['user']::text[] NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" USING btree ("expire");
