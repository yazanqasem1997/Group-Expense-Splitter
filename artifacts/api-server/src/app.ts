import express, { type Express } from "express";
import cors, { type CorsOptions } from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

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

// The Clerk proxy streams raw bytes, so it must be mounted before body parsers.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// ---------------------------------------------------------------------------
// CORS – strict trusted-origin policy
//
// Rules:
//  1. Native mobile / bearer-token clients send no Origin header at all; they
//     must NOT be blocked. cors() only runs when Origin is present, so they
//     pass through untouched.
//  2. Browser-based web clients (Replit preview + deployed domain) are
//     allowed explicitly.  We NEVER reflect arbitrary origins with
//     credentials:true because that would let any site make credentialed
//     cross-origin requests on behalf of a logged-in user.
//  3. In development, *.replit.dev and *.picard.replit.dev previews are
//     trusted in addition to localhost variants.
//
// The TRUSTED_ORIGINS env var (comma-separated) can extend the list at
// runtime without a code change, e.g. for custom domains in production.
// ---------------------------------------------------------------------------
function buildTrustedOrigins(): (string | RegExp)[] {
  const origins: (string | RegExp)[] = [];

  // In development/preview only: allow regex patterns for Replit preview and
  // local dev origins.  These patterns are intentionally NOT included in
  // production because they cover multi-tenant domains shared by all Replit
  // users; scoping them to dev ensures we never allow credentialed requests
  // from an arbitrary tenant in production.
  if (process.env.NODE_ENV !== "production") {
    origins.push(
      /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]+\.replit\.dev$/,
      /^https:\/\/[a-z0-9-]+\.replit\.dev$/,
      /^https:\/\/[a-z0-9-]+\.replit\.app$/,
      /^http:\/\/localhost(:\d+)?$/,
      /^http:\/\/127\.0\.0\.1(:\d+)?$/,
    );
  }

  // Explicit allowlist from REPLIT_DOMAINS (the app's own canonical domain).
  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains) {
    for (const d of replitDomains.split(",")) {
      const domain = d.trim();
      if (domain) {
        origins.push(`https://${domain}`);
      }
    }
  }

  // Additional origins from TRUSTED_ORIGINS for custom production domains.
  const extra = process.env.TRUSTED_ORIGINS;
  if (extra) {
    for (const o of extra.split(",")) {
      const origin = o.trim();
      if (origin) origins.push(origin);
    }
  }

  return origins;
}

const trustedOrigins = buildTrustedOrigins();

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // No Origin header = native/mobile/server-to-server client; allow.
    if (!origin) {
      callback(null, true);
      return;
    }
    const allowed = trustedOrigins.some((trusted) =>
      trusted instanceof RegExp ? trusted.test(origin) : trusted === origin,
    );
    if (allowed) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin '${origin}' is not allowed`));
    }
  },
  // credentials:true is safe here because we never reflect arbitrary origins.
  credentials: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
};

app.use(cors(corsOptions));
// Respond to preflight requests for all routes.
app.options("*splat", cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Resolve the publishable key from the incoming request host so the same
// server can serve multiple Clerk custom domains. Falls back to
// CLERK_PUBLISHABLE_KEY when the host doesn't map to a custom domain.
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;
