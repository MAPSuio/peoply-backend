# Threat Detection & Discord Alerts

Author: Victor

## Oversikt

Systemet analyserer alle innkommende HTTP-requests for mistenkelige mønstre og sender alerts til Discord via webhook.

```
HTTP Request → main.ts middleware → ThreatDetectionService → DiscordAlertService → Discord
```

## Hva detekteres

### 1. Path probes (umiddelbar alert)

Requests til paths som indikerer bot-scanning/rekognosering:

| Mønster | Label |
|---------|-------|
| `.env` | .env probe |
| `.git` | .git probe |
| `wp-admin`, `wp-login`, `wp-includes` | WordPress probe |
| `phpinfo`, `*.php` | PHP probe |
| `/admin` | Admin panel probe |
| `.sql`, `.bak` | Backup/dump probe |
| `.aws`, `.ssh` | Credentials probe |
| `/actuator` | Spring Actuator probe |
| `/cgi-bin`, `/xmlrpc`, `/debug` | Legacy/exploit probes |
| `web.config`, `.htaccess` | Server config probe |

### 2. Burst 404 (threshold-basert)

10+ 404-responses fra samme IP innenfor 60 sekunder → alert.

### 3. Auth brute-force (threshold-basert)

8+ 401-responses på `/auth/login` eller `/auth/refresh` fra samme IP innenfor 60 sekunder → alert.

## Env-variabler

| Variabel | Type | Default | Beskrivelse |
|----------|------|---------|-------------|
| `DISCORD_ALERT_WEBHOOK_URL` | string | — | Discord webhook URL. Uten = kun lokal logging |
| `THREAT_DETECTION_ENABLED` | boolean | `true` | Feature flag for hele systemet |
| `THREAT_ALERT_COOLDOWN_MS` | number | `300000` | Cooldown per IP+mønster (5 min) |

## Filer

```
src/threat-detection/
├── threat-patterns.ts            # Patterns, thresholds, konstanter
├── discord-alert.service.ts      # Sender embeds til Discord webhook
├── threat-detection.service.ts   # Analyserer requests, sliding windows
└── threat-detection.module.ts    # NestJS-modul
```

## Anti-spam

- **Alert cooldown**: Samme IP + samme mønster trigger maks én alert per 5 min (konfigurerbart)
- **Window reset**: Burst-vinduer nullstilles etter alert for å unngå gjentatte alerts per request
- **Cleanup**: Expired entries ryddes fra minne hvert 2. minutt

## Av/på

| Metode | Effekt |
|--------|--------|
| `THREAT_DETECTION_ENABLED=false` | Service gjør ingenting |
| Uten `DISCORD_ALERT_WEBHOOK_URL` | Analyse kjører, alerts logges kun lokalt |
| Fjern `ThreatDetectionModule` fra `AppModule` | Hele modulen deaktivert |

## Test

```bash
# Send test-alerts til Discord
node scripts/test-discord-alerts.js

# Krever DISCORD_ALERT_WEBHOOK_URL i .env eller som env var
```

## Discord embed-format

Alerts sendes som Discord embeds med:
- **Tittel**: Type trussel (f.eks. "Suspicious path: .env probe")
- **Felter**: Path, Method, Status, IP (inline)
- **Farge**: Rød (path probes, 404 burst) / Oransje (auth brute-force)
- **Timestamp**: Når alerten ble trigget
