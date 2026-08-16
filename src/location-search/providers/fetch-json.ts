import { BadGatewayException } from "@nestjs/common";

const REQUEST_TIMEOUT_MS = 5000;

/**
 * Fetch and parse JSON from an upstream location provider, with a hard
 * timeout. Every failure mode — non-2xx, network error, timeout, bad JSON —
 * surfaces as a 502 naming the provider, never as a hang or a 500.
 */
export async function fetchJsonWithTimeout<T>(
  label: string,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new BadGatewayException(
        `${label} request failed with status ${response.status}`,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof BadGatewayException) {
      throw error;
    }

    throw new BadGatewayException(`${label} request failed`);
  } finally {
    clearTimeout(timeout);
  }
}
