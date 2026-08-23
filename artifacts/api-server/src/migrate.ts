/**
 * Applies the SQL migrations in lib/db/drizzle, then exits.
 *
 * Run as a one-shot job before the server starts — see the `migrate` service in
 * docker-compose.yml. Schema changes must not be applied from inside a
 * long-running app process: several replicas booting at once would race, and
 * there would be no ordering between them.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "@workspace/db";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "drizzle",
);

async function main() {
  // @workspace/db already throws on a missing DATABASE_URL at import time.
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  console.log("Migrations applied.");
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("Migration failed:", err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
