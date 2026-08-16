import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DiscordAlertService } from "./discord-alert.service";

/**
 * Posts notices to a Discord webhook. Two callers: a new feedback submission
 * and a new organization awaiting approval — both things a human is meant to
 * read and act on.
 *
 * This used to live under `threat-detection/` alongside a service that watched
 * every request for `.env`/`wp-admin` probes, 404 bursts and repeated auth
 * failures, and alerted on each. That service is gone. It could not see a real
 * client IP (every request arrives with a Cloudflare edge address, so all
 * visitors shared one bucket) and its thresholds fired on ordinary use: a
 * logged-out visitor gets a 401 from `POST /auth/refresh` on every page, and
 * eight of those in a minute counted as a brute-force attempt. Over one
 * 105-minute window it sent 129 alerts, of which Discord rate-limited 118, and
 * not one described anything that was worth doing something about.
 */
@Module({
  imports: [ConfigModule],
  providers: [DiscordAlertService],
  exports: [DiscordAlertService],
})
export class DiscordModule {}
