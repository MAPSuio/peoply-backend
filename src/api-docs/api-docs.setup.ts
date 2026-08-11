import { INestApplication } from "@nestjs/common";
import { OpenAPIObject } from "@nestjs/swagger";
import { apiReference } from "@scalar/nestjs-api-reference";
import { randomBytes } from "node:crypto";
import * as path from "node:path";
import * as express from "express";
import { NextFunction, Request, Response } from "express";

/** The reference UI, kept at the path Swagger UI used so links stay valid. */
const DOCS_PATH = "/api";
/** Scalar's browser bundle, served from our origin instead of a CDN. */
const BUNDLE_PATH = `${DOCS_PATH}/scalar`;
/** The generated OpenAPI document, fetched by the UI and usable on its own. */
const SPEC_PATH = `${DOCS_PATH}/openapi.json`;

/**
 * The bundle ships inside @scalar/api-reference, but the package only exports
 * its module entry, so resolve that and step across to the browser build.
 */
const bundleDir = path.join(
  path.dirname(require.resolve("@scalar/api-reference")),
  "browser",
);

/**
 * Replaces the app-wide policy from helmet() for the docs page alone. Scalar
 * emits an inline config script and a theme <style>; both carry this nonce.
 * Its runtime-injected stylesheet picks the nonce up from a <meta> tag.
 *
 * style-src-attr is the one concession: the UI sets style="..." attributes,
 * which a nonce cannot authorize. It permits attributes only — <style> blocks
 * and stylesheets still need the nonce.
 */
function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
  ].join("; ");
}

/**
 * Mounts the Scalar API reference, its bundle and the raw OpenAPI document.
 * Registered from bootstrap() after helmet so the docs route can override the
 * Content-Security-Policy header helmet sets.
 */
export function setupApiDocs(
  app: INestApplication,
  document: OpenAPIObject,
): void {
  app.use(
    BUNDLE_PATH,
    express.static(bundleDir, {
      index: false,
      immutable: true,
      maxAge: "1y",
    }),
  );

  /* `res.json(document)` re-serialized 85 routes and 35 DTO schemas on every
     hit. The document is built once at startup and never changes, and this
     route is mounted with `app.use`, i.e. raw Express middleware that answers
     before the Nest router - so `CfThrottlerGuard`, registered as an APP_GUARD,
     never sees it. It is the only unthrottled path in the application.

     Serializing once turns it into sending a fixed string, and `res.send` on a
     string sets an ETag, so a repeat caller revalidates into a 304 instead of
     pulling 30 KB again. */
  const serializedDocument = JSON.stringify(document);

  app.use(SPEC_PATH, (_req: Request, res: Response) => {
    res.type("application/json").send(serializedDocument);
  });

  app.use(DOCS_PATH, (req: Request, res: Response, next: NextFunction) => {
    // Express strips the mount path, so only the docs root renders here.
    // Anything deeper falls through to Nest routing rather than being
    // answered with the reference page.
    if (req.path !== "/") return next();

    const nonce = randomBytes(16).toString("base64");
    res.setHeader("Content-Security-Policy", contentSecurityPolicy(nonce));

    // The HTML embeds the nonce, so the handler is built per request rather
    // than once at startup.
    return apiReference({
      url: SPEC_PATH,
      cdn: `${BUNDLE_PATH}/standalone.js`,
      pageTitle: "Peoply API",
      nonce,
    })(req as never, res as never);
  });
}
