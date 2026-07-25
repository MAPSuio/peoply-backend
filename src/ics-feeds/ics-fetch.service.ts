import {
  BadRequestException,
  Injectable,
  RequestTimeoutException,
} from "@nestjs/common";
import { lookup } from "node:dns/promises";
import * as http from "node:http";
import * as https from "node:https";
import { isIP } from "node:net";

const MAX_REDIRECTS = 3;
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;

interface CalendarResponse {
  url: string;
  body: string;
  contentType?: string;
}

@Injectable()
export class IcsFetchService {
  async fetchCalendar(url: string): Promise<CalendarResponse> {
    return this.fetchWithRedirects(url, 0);
  }

  private async fetchWithRedirects(
    rawUrl: string,
    redirectCount: number,
  ): Promise<CalendarResponse> {
    if (redirectCount > MAX_REDIRECTS) {
      throw new BadRequestException("ICS URL redirects too many times");
    }

    const url = new URL(rawUrl);
    const validatedAddresses = await this.assertSafeUrl(url);

    const response = await this.makeRequest(url, validatedAddresses[0]);
    const statusCode = response.statusCode ?? 0;

    if (statusCode >= 300 && statusCode < 400 && response.location) {
      const nextUrl = new URL(response.location, url);
      return this.fetchWithRedirects(nextUrl.toString(), redirectCount + 1);
    }

    if (statusCode !== 200) {
      throw new BadRequestException(
        `ICS URL returned ${response.statusCode ?? "unknown"}`,
      );
    }

    const body = response.body.toString("utf8");
    const contentType = Array.isArray(response.contentType)
      ? response.contentType[0]
      : response.contentType;

    if (
      !contentType?.includes("text/calendar") &&
      !body.trimStart().startsWith("BEGIN:VCALENDAR")
    ) {
      throw new BadRequestException("URL does not return a valid ICS calendar");
    }

    return {
      url: url.toString(),
      body,
      contentType,
    };
  }

  private async assertSafeUrl(url: URL) {
    if (url.protocol !== "https:") {
      throw new BadRequestException("Only HTTPS ICS URLs are supported");
    }

    if (!url.hostname) {
      throw new BadRequestException("ICS URL is missing a hostname");
    }

    const addresses = await this.resolveAddresses(url.hostname);
    if (!addresses.length) {
      throw new BadRequestException("Could not resolve ICS host");
    }

    for (const address of addresses) {
      if (this.isBlockedAddress(address)) {
        throw new BadRequestException("ICS URL points to a blocked address");
      }
    }

    return addresses;
  }

  private async resolveAddresses(hostname: string) {
    if (isIP(hostname)) {
      return [hostname];
    }

    try {
      const addresses = await lookup(hostname, { all: true });
      return addresses.map(({ address }) => address);
    } catch {
      throw new BadRequestException("Could not resolve ICS host");
    }
  }

  private isBlockedAddress(address: string) {
    if (address === "127.0.0.1" || address === "0.0.0.0" || address === "::1") {
      return true;
    }

    if (address.startsWith("10.") || address.startsWith("192.168.")) {
      return true;
    }

    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) {
      return true;
    }

    if (address.startsWith("169.254.")) {
      return true;
    }

    if (
      address.startsWith("fc") ||
      address.startsWith("fd") ||
      address.startsWith("fe80:") ||
      address.startsWith("::ffff:127.")
    ) {
      return true;
    }

    return false;
  }

  private makeRequest(url: URL, resolvedAddress: string) {
    const transport = url.protocol === "https:" ? https : http;

    return new Promise<{
      statusCode?: number;
      location?: string;
      contentType?: string | string[];
      body: Buffer;
    }>((resolve, reject) => {
      const request = transport.request(
        url.toString(),
        {
          method: "GET",
          timeout: REQUEST_TIMEOUT_MS,
          lookup: (_hostname: string, _options: unknown, callback: any) => {
            const family = resolvedAddress.includes(":") ? 6 : 4;
            callback(null, resolvedAddress, family);
          },
          headers: {
            Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1",
            "User-Agent": "Peoply-ICS-Importer/1.0",
          },
        } as any,
        (response) => {
          const chunks: Buffer[] = [];
          let totalLength = 0;
          const contentLength = Number(response.headers["content-length"] ?? 0);

          if (contentLength > MAX_SIZE_BYTES) {
            response.destroy();
            reject(new BadRequestException("ICS file exceeds 5 MB"));
            return;
          }

          response.on("data", (chunk: Buffer) => {
            totalLength += chunk.length;
            if (totalLength > MAX_SIZE_BYTES) {
              response.destroy();
              reject(new BadRequestException("ICS file exceeds 5 MB"));
              return;
            }

            chunks.push(chunk);
          });

          response.on("end", () => {
            resolve({
              statusCode: response.statusCode,
              location: response.headers.location,
              contentType: response.headers["content-type"],
              body: Buffer.concat(chunks),
            });
          });
        },
      );

      request.on("timeout", () => {
        request.destroy();
        reject(new RequestTimeoutException("Timed out while fetching ICS URL"));
      });
      request.on("error", reject);
      request.end();
    });
  }
}
