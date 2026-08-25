import { Header } from "@nestjs/common";

/**
 * How long a browser may reuse a response without asking again, in seconds.
 *
 * `referenceTables` covers rows that change by deploy or admin action:
 * allergens and categories. A browser holding them an hour stale can at worst
 * show a just-created category one hour late.
 *
 * `scheduledContent` covers the active popup, which an admin schedules and
 * expects to appear promptly: a minute of staleness is invisible, an hour is
 * not.
 */
export const BROWSER_CACHE_TTL = {
  referenceTables: 3600,
  scheduledContent: 60,
} as const;

/**
 * Lets the caller's own browser reuse the response for `seconds`.
 *
 * `private` on purpose: the DigitalOcean edge stamps `cache-control: private`
 * on responses that carry no cache header today, so no shared cache holds
 * these now, and keeping it that way sidesteps the CORS trap where a copy
 * cached from a request without an Origin header is later served to the app
 * without `access-control-allow-origin`. Only the repeat traffic from the
 * same browser goes away, which for reference data is nearly all of it.
 */
export function BrowserCacheFor(seconds: number): MethodDecorator {
  return Header("Cache-Control", `private, max-age=${seconds}`);
}
