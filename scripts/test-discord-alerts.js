#!/usr/bin/env node

/**
 * Test script for the threat detection → Discord alert pipeline.
 *
 * Usage:
 *   node scripts/test-discord-alerts.js              # uses DISCORD_ALERT_WEBHOOK_URL from .env
 *   DISCORD_ALERT_WEBHOOK_URL=https://... node scripts/test-discord-alerts.js
 *
 * Author: Victor
 */

const path = require("path");

// Load .env from project root
try {
  require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
} catch {
  // dotenv not installed — rely on env being set externally
}

const WEBHOOK_URL = process.env.DISCORD_ALERT_WEBHOOK_URL;

if (!WEBHOOK_URL) {
  console.error(
    "ERROR: DISCORD_ALERT_WEBHOOK_URL not set. Add it to .env or pass as env var.",
  );
  process.exit(1);
}

const ALERTS = [
  {
    title: "TEST: .env probe detected",
    color: 0xff0000,
    fields: [
      { name: "Path", value: "/.env", inline: true },
      { name: "Method", value: "GET", inline: true },
      { name: "Status", value: "404", inline: true },
      { name: "IP", value: "185.220.101.42", inline: true },
    ],
  },
  {
    title: "TEST: Burst 404 — possible scanning",
    color: 0xff0000,
    fields: [
      { name: "404 count", value: "10 in 60s", inline: true },
      { name: "Last path", value: "/wp-login.php", inline: true },
      { name: "IP", value: "92.118.160.5", inline: true },
    ],
  },
  {
    title: "TEST: Auth brute-force attempt",
    color: 0xffa500,
    fields: [
      { name: "Failed logins", value: "8 in 60s", inline: true },
      { name: "Path", value: "/auth/login", inline: true },
      { name: "IP", value: "45.134.26.99", inline: true },
    ],
  },
];

async function sendAlert(alert) {
  const body = {
    embeds: [
      {
        title: alert.title,
        color: alert.color,
        fields: alert.fields,
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  clearTimeout(timeout);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord responded ${res.status}: ${text}`);
  }
}

async function main() {
  console.log(`Sending ${ALERTS.length} test alerts to Discord...\n`);

  for (const alert of ALERTS) {
    try {
      await sendAlert(alert);
      console.log(`  OK  ${alert.title}`);
    } catch (err) {
      console.error(`  FAIL  ${alert.title}: ${err.message}`);
      process.exit(1);
    }
    // Small delay to respect Discord rate limits
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\nAll alerts sent. Check your Discord channel.");
}

main();
