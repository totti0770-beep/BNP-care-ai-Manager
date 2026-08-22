import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import gatewayRouter from "./routes/gateway";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

const app: Express = express();

// Railway, Replit and Docker all put exactly one reverse proxy in front of this
// process. Without this, req.ip is the proxy's address for every request, which
// would make the login rate limiter share a single bucket across all clients —
// locking out everyone once any one caller misbehaves. One hop, not `true`:
// trusting the whole chain would let a client spoof X-Forwarded-For and get a
// fresh budget per request.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(authMiddleware);

// Mounted before the body parsers so request bodies (notably multipart PDF
// uploads) reach the engine as an unbuffered stream.
app.use("/bnp-api", gatewayRouter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Errors must never reach Express's default HTML handler: clients parse JSON,
// and the default handler leaks stack traces.
app.use(
  (
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    req.log?.error({ err }, "Unhandled request error");
    if (res.headersSent) return;
    res.status(500).json({ error: "Internal server error" });
  },
);

export default app;
