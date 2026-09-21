import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { AppConfig } from "../config/app-config";
import { createAuthService } from "../modules/auth/auth.service";
import type { EmailSender } from "../modules/auth/email";
import { createInventoryQueryService } from "../modules/inventory/inventory-query.service";
import { createInventoryService } from "../modules/inventory/inventory.service";
import { createProductService } from "../modules/catalog/product.service";
import { createTaxonomyService } from "../modules/catalog/taxonomy.service";
import { createVariantService } from "../modules/catalog/variant.service";
import { createDashboardService, type DashboardProviders } from "../modules/dashboard";
import { createMediaService } from "../modules/media/media.service";
import { createB2BModule } from "../modules/b2b";
import { createOrdersModule, type PaymentProvider } from "../modules/orders";
import { createStorefrontService } from "../modules/storefront/storefront.service";
import { createPricingPreviewService } from "../modules/pricing/pricing-preview.service";
import { createLocalDiskStorage, type MediaStorage } from "../modules/media/storage";
import { createRoleAdminService } from "../modules/auth/role-admin.service";
import { createUserAdminService } from "../modules/auth/user-admin.service";
import { createAuthenticate, createOptionalAuthenticate } from "./middleware/authenticate";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { createRateLimiters } from "./middleware/rate-limit";
import { requestContext } from "./middleware/request-context";
import { createAuditRouter } from "./routes/audit.routes";
import { createB2BAdminRouter } from "./routes/b2b-admin.routes";
import { createPortalRouter } from "./routes/portal.routes";
import { createCheckoutRouter } from "./routes/checkout.routes";
import { createAuthRouter } from "./routes/auth.routes";
import { createDashboardRouter } from "./routes/dashboard.routes";
import { createInventoryRouter } from "./routes/inventory.routes";
import { createMediaRouter } from "./routes/media.routes";
import { createPricingRouter } from "./routes/pricing.routes";
import { createProductsRouter } from "./routes/products.routes";
import { createRolesRouter } from "./routes/roles.routes";
import { createStorefrontRouter } from "./routes/storefront.routes";
import { createTaxonomyRouter } from "./routes/taxonomy.routes";
import { createUsersRouter } from "./routes/users.routes";

export interface AppDeps {
  config: AppConfig;
  emailSender: EmailSender;
  /** Defaults to local disk under `config.media.dir`; tests inject an in-memory store. */
  mediaStorage?: MediaStorage;
  /** Sales and B2B data sources. None exist yet, so production registers none and those sections report NOT_CONNECTED; only dev-memory passes sample providers. */
  dashboardProviders?: DashboardProviders;
  /** Payment gateway adapters. None in production until a real one exists, so paying says "not available" instead of pretending; dev-memory and tests register the sandbox. */
  paymentProviders?: readonly PaymentProvider[];
}

/** Builds the Express app without listening — so tests drive it in-process and server.ts owns the socket. */
export function createApp({ config, emailSender, mediaStorage, dashboardProviders, paymentProviders }: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => callback(null, !origin || config.allowedOrigins.includes(origin)),
      credentials: true,
    })
  );
  app.use(
    express.json({
      limit: "100kb",
      // A webhook is authenticated by a signature over its exact bytes, so keep them (only for that route).
      verify: (req, _res, buf) => {
        if ((req as express.Request).originalUrl?.startsWith("/api/store/payments/webhooks/")) (req as express.Request).rawBody = buf.toString("utf8");
      },
    })
  );
  app.use(cookieParser());
  app.use(requestContext);

  const authService = createAuthService({ config, emailSender });
  const authenticate = createAuthenticate(authService);
  const optionalAuthenticate = createOptionalAuthenticate(authService);
  const limiters = createRateLimiters(config);

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", createAuthRouter({ config, authService, authenticate, optionalAuthenticate, limiters }));
  app.use("/api/users", createUsersRouter({ authenticate, userAdmin: createUserAdminService({ config }) }));
  app.use("/api", createRolesRouter({ authenticate, roleAdmin: createRoleAdminService() }));
  app.use("/api/audit-logs", createAuditRouter({ authenticate }));
  const media = createMediaService(mediaStorage ?? createLocalDiskStorage(config.media.dir), config.media.publicBaseUrl);
  app.use("/api/inventory", createInventoryRouter({ authenticate, queries: createInventoryQueryService({ media }), inventory: createInventoryService() }));
  app.use("/api/media", createMediaRouter({ authenticate, media }));
  const ordersModule = createOrdersModule({ config, media, paymentProviders });
  app.locals.orders = ordersModule;
  const b2b = createB2BModule({ media });
  app.locals.b2b = b2b;
  app.use("/api/portal", createPortalRouter({ authenticate, b2b, writeLimiter: limiters.storefrontWrite }));
  app.use("/api/b2b", createB2BAdminRouter({ authenticate, b2b }));
  app.use("/api/store", createCheckoutRouter({ orders: ordersModule, writeLimiter: limiters.storefrontWrite, optionalAuthenticate }));
  app.use("/api/store", createStorefrontRouter({ storefront: createStorefrontService({ media }), writeLimiter: limiters.storefrontWrite }));
  app.use("/api/dashboard", createDashboardRouter({ authenticate, dashboard: createDashboardService({ providers: dashboardProviders }) }));
  app.use("/api/pricing", createPricingRouter({ authenticate, preview: createPricingPreviewService() }));
  app.use("/api/products", createProductsRouter({ authenticate, products: createProductService({ media }), variants: createVariantService() }));
  app.use("/api/catalog", createTaxonomyRouter({ authenticate, taxonomy: createTaxonomyService() }));

  app.use(notFoundHandler);
  app.use(errorHandler(config.env === "production"));
  return app;
}
