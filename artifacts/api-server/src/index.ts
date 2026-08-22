import app from "./app";
import { logger } from "./lib/logger";
import { bootstrapAdmin } from "./lib/bootstrapAdmin";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Create the first sign-in account before accepting traffic, so a fresh
// deployment is reachable. Failing here is fatal on purpose: the only way it
// throws is a rejected weak password, and starting anyway would mean serving
// with an admin anyone could guess.
bootstrapAdmin(logger)
  .catch((err: unknown) => {
    logger.error({ err }, "Admin bootstrap failed — refusing to start");
    process.exit(1);
  })
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
    });
  });
