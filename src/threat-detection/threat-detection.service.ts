import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DiscordAlertService } from "./discord-alert.service";
import {
  AUTH_FAIL_THRESHOLD,
  AUTH_FAIL_LOG_THRESHOLD,
  AUTH_PATHS,
  BURST_404_THRESHOLD,
  BURST_404_LOG_THRESHOLD,
  CLEANUP_INTERVAL_MS,
  DEFAULT_ALERT_COOLDOWN_MS,
  MAX_TRACKED_IPS,
  REQUEST_RATE_THRESHOLD,
  REQUEST_RATE_LOG_THRESHOLDS,
  SAFE_PATHS,
  SLIDING_WINDOW_MS,
  SUSPICIOUS_PATH_PATTERNS,
} from "./threat-patterns";
import { evictToCapacity } from "../util/bounded-map";

@Injectable()
export class ThreatDetectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ThreatDetectionService.name);

  private enabled = true;
  private alertCooldownMs = DEFAULT_ALERT_COOLDOWN_MS;

  /** IP → list of timestamps for 404 responses */
  private readonly notFoundWindows = new Map<string, number[]>();
  /** IP → list of timestamps for auth failures */
  private readonly authFailWindows = new Map<string, number[]>();
  /** Global request timestamps for rate monitoring */
  private readonly globalRequestWindow: number[] = [];
  /** "ip:pattern" → last alert timestamp */
  private readonly alertCooldowns = new Map<string, number>();
  /** "key" -> last activity log timestamp */
  private readonly activityLogCooldowns = new Map<string, number>();

  private cleanupTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly discord: DiscordAlertService,
  ) {}

  onModuleInit() {
    const enabledRaw = this.config.get("THREAT_DETECTION_ENABLED");
    this.enabled =
      enabledRaw === undefined || enabledRaw === true || enabledRaw === "true";

    const cooldownRaw = this.config.get("THREAT_ALERT_COOLDOWN_MS");
    this.alertCooldownMs =
      cooldownRaw !== undefined
        ? Number(cooldownRaw)
        : DEFAULT_ALERT_COOLDOWN_MS;
    if (Number.isNaN(this.alertCooldownMs)) {
      this.alertCooldownMs = DEFAULT_ALERT_COOLDOWN_MS;
    }

    if (!this.enabled) {
      this.logger.log("Threat detection is DISABLED via env");
      return;
    }

    this.logger.log("Threat detection is active");
    this.cleanupTimer = setInterval(
      () => this.cleanupExpired(),
      CLEANUP_INTERVAL_MS,
    );
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  analyzeRequest(
    method: string,
    path: string,
    statusCode: number,
    ip: string,
  ): void {
    if (!this.enabled) return;

    // Global request-rate check (runs even for safe paths)
    const now = Date.now();
    this.globalRequestWindow.push(now);
    const rateCutoff = now - SLIDING_WINDOW_MS;
    while (
      this.globalRequestWindow.length > 0 &&
      this.globalRequestWindow[0] < rateCutoff
    ) {
      this.globalRequestWindow.shift();
    }
    const rpm = this.globalRequestWindow.length;
    for (const threshold of REQUEST_RATE_LOG_THRESHOLDS) {
      if (rpm >= threshold) {
        this.logActivityIfNotCooling(
          `_global:rate:${threshold}`,
          `Elevated request rate: ${rpm} requests in the last 60s (threshold ${threshold}) | Last path: ${path} | Last IP: ${ip}`,
        );
      }
    }

    if (rpm >= REQUEST_RATE_THRESHOLD) {
      this.alertIfNotCooling(
        "_global",
        "request-rate",
        "High request rate",
        [
          {
            name: "Requests",
            value: `${rpm} in the last 60s`,
            inline: true,
          },
          { name: "Last path", value: path, inline: true },
          { name: "Last IP", value: ip, inline: true },
        ],
        0xffff00, // yellow — informational, not necessarily an attack
      );
    }

    if (SAFE_PATHS.has(path)) return;

    // 1. Suspicious path probe
    for (const { pattern, label } of SUSPICIOUS_PATH_PATTERNS) {
      if (pattern.test(path)) {
        this.alertIfNotCooling(
          ip,
          `path:${label}`,
          `Suspicious path: ${label}`,
          [
            { name: "Path", value: path, inline: true },
            { name: "Method", value: method, inline: true },
            { name: "Status", value: String(statusCode), inline: true },
            { name: "IP", value: ip, inline: true },
          ],
        );
        return; // one alert per request is enough
      }
    }

    // 2. Burst 404 detection
    if (statusCode === 404) {
      const hits = this.pushAndTrim(this.notFoundWindows, ip, now);
      if (hits >= BURST_404_LOG_THRESHOLD) {
        this.logActivityIfNotCooling(
          `${ip}:burst404:log`,
          `Repeated 404s from ${ip}: ${hits} in ${
            SLIDING_WINDOW_MS / 1000
          }s | Last path: ${path}`,
        );
      }
      if (hits >= BURST_404_THRESHOLD) {
        this.alertIfNotCooling(
          ip,
          "burst:404",
          "Burst 404 — possible scanning",
          [
            {
              name: "404 count",
              value: `${hits} in ${SLIDING_WINDOW_MS / 1000}s`,
              inline: true,
            },
            { name: "Last path", value: path, inline: true },
            { name: "IP", value: ip, inline: true },
          ],
        );
        // Reset window after alert to avoid repeated alerts every request
        this.notFoundWindows.delete(ip);
      }
    }

    // 3. Auth brute-force detection
    if (AUTH_PATHS.has(path) && statusCode === 401) {
      const hits = this.pushAndTrim(this.authFailWindows, ip, now);
      if (hits >= AUTH_FAIL_LOG_THRESHOLD) {
        this.logActivityIfNotCooling(
          `${ip}:authfail:log`,
          `Repeated auth failures from ${ip}: ${hits} in ${
            SLIDING_WINDOW_MS / 1000
          }s | Path: ${path}`,
        );
      }
      if (hits >= AUTH_FAIL_THRESHOLD) {
        this.alertIfNotCooling(
          ip,
          "auth:bruteforce",
          "Auth brute-force attempt",
          [
            {
              name: "Failed logins",
              value: `${hits} in ${SLIDING_WINDOW_MS / 1000}s`,
              inline: true,
            },
            { name: "Path", value: path, inline: true },
            { name: "IP", value: ip, inline: true },
          ],
          0xffa500,
        ); // orange
        this.authFailWindows.delete(ip);
      }
    }
  }

  // --- Internals ---

  private pushAndTrim(
    windowMap: Map<string, number[]>,
    ip: string,
    now: number,
  ): number {
    let timestamps = windowMap.get(ip);
    if (!timestamps) {
      timestamps = [];
      windowMap.set(ip, timestamps);
      this.enforceIpCap(windowMap, "request windows");
    }
    timestamps.push(now);

    // Remove entries outside the sliding window
    const cutoff = now - SLIDING_WINDOW_MS;
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift();
    }
    return timestamps.length;
  }

  private alertIfNotCooling(
    ip: string,
    patternKey: string,
    title: string,
    fields: { name: string; value: string; inline?: boolean }[],
    color?: number,
  ): void {
    const key = `${ip}:${patternKey}`;
    const now = Date.now();
    const last = this.alertCooldowns.get(key);

    if (last && now - last < this.alertCooldownMs) return;

    this.alertCooldowns.set(key, now);
    this.enforceIpCap(this.alertCooldowns, "alert cooldowns");
    // Fire-and-forget — never block the request
    this.discord.sendAlert(title, fields, color).catch(() => undefined);
  }

  private logActivityIfNotCooling(key: string, message: string): void {
    const now = Date.now();
    const last = this.activityLogCooldowns.get(key);

    if (last && now - last < this.alertCooldownMs) return;

    this.activityLogCooldowns.set(key, now);
    this.enforceIpCap(this.activityLogCooldowns, "activity log cooldowns");
    this.logger.warn(message);
  }

  /**
   * Keeps a tracking map under MAX_TRACKED_IPS.
   *
   * Evicting means forgetting an IP that was being watched, so a flood can
   * push a genuine slow prober out of the window — but a map that grows with
   * the attacker's IP rotation takes the process down, and detecting nothing
   * because the container was OOM-killed is strictly worse. Hitting the cap is
   * itself a signal, so it is logged (through the cooldown, or the log would
   * flood alongside the map).
   */
  private enforceIpCap(map: Map<string, unknown>, label: string): void {
    const removed = evictToCapacity(map, MAX_TRACKED_IPS);

    if (removed > 0) {
      const now = Date.now();
      const last = this.activityLogCooldowns.get(`cap:${label}`);

      if (!last || now - last >= this.alertCooldownMs) {
        this.activityLogCooldowns.set(`cap:${label}`, now);
        this.logger.warn(
          `Threat detection ${label} hit the ${MAX_TRACKED_IPS} IP cap and ` +
            `dropped ${removed} entries — source IPs are being rotated faster ` +
            "than they can be tracked.",
        );
      }
    }
  }

  private cleanupExpired(): void {
    const now = Date.now();
    const windowCutoff = now - SLIDING_WINDOW_MS;
    const cooldownCutoff = now - this.alertCooldownMs;

    // Trim global request window
    while (
      this.globalRequestWindow.length > 0 &&
      this.globalRequestWindow[0] < windowCutoff
    ) {
      this.globalRequestWindow.shift();
    }

    for (const [ip, timestamps] of this.notFoundWindows) {
      const filtered = timestamps.filter((t) => t >= windowCutoff);
      if (filtered.length === 0) this.notFoundWindows.delete(ip);
      else this.notFoundWindows.set(ip, filtered);
    }

    for (const [ip, timestamps] of this.authFailWindows) {
      const filtered = timestamps.filter((t) => t >= windowCutoff);
      if (filtered.length === 0) this.authFailWindows.delete(ip);
      else this.authFailWindows.set(ip, filtered);
    }

    for (const [key, ts] of this.alertCooldowns) {
      if (ts < cooldownCutoff) this.alertCooldowns.delete(key);
    }

    for (const [key, ts] of this.activityLogCooldowns) {
      if (ts < cooldownCutoff) this.activityLogCooldowns.delete(key);
    }
  }
}
