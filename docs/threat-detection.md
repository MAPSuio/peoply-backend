# Threat Detection & Discord Alerts

Author: Victor

## Oversikt

Systemet analyserer alle innkommende HTTP-requests for mistenkelige mønstre og sender alerts til Discord via webhook.

Webhook-sendingen er Node 16-kompatibel og bruker ikke global `fetch`.

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

5+ 404-responses fra samme IP innenfor 60 sekunder → warn-logg.

### 3. Auth brute-force (threshold-basert)

8+ 401-responses på `/auth/login` eller `/auth/refresh` fra samme IP innenfor 60 sekunder → alert.

4+ 401-responses på disse auth-rutene innenfor 60 sekunder → warn-logg.

### 4. Høy request-rate (threshold-basert)

500+ requests totalt innenfor 60 sekunder → Discord alert.

250+ og 400+ requests innenfor 60 sekunder → warn-logg for tidligere signal.

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

## Discord embed-format

Alerts sendes som Discord embeds med:
- **Tittel**: Type trussel (f.eks. "Suspicious path: .env probe")
- **Felter**: Path, Method, Status, IP (inline)
- **Farge**: Rød (path probes, 404 burst) / Oransje (auth brute-force)
- **Timestamp**: Når alerten ble trigget

## Klient-IP: hvorfor `CLOUDFLARE_ORIGIN_SECRET` finnes

Alt som er per-IP her — burst-404, brute-force-vinduene, og rate limiten i
`CfThrottlerGuard` — nøkles på IP-en `resolveClientIp()` (`src/util/client-ip.ts`)
kommer frem til.

`CF-Connecting-IP` settes av Cloudflare og overskrives på hver request som går
gjennom edgen, så *bak* Cloudflare er den til å stole på. Den er samtidig bare
en header. Origin er direkte nåbar på `*.ondigitalocean.app` — deploy-workflowen
poller den URL-en selv — så en angriper som går utenom Cloudflare og sender en
ny `CF-Connecting-IP` per request havner i en ny bøtte hver gang. Da gjelder
ingen av grensene over lenger.

To ting hindrer det:

1. Verdien må parse som en IP-adresse. Ellers er den en vilkårlig
   angriperkontrollert streng brukt som Map-nøkkel og limt inn i loggen og i
   Discord-alerts.
2. Requesten må vise at den kom gjennom Cloudflare, ved å sende hemmeligheten i
   `CLOUDFLARE_ORIGIN_SECRET` som `X-CF-Origin-Secret`. Requests som ikke kan
   det faller tilbake på `req.ip`, som Express utleder fra proxy-kjeden.

### Oppsett

1. Generer en hemmelighet (minst 16 tegn):
   ```bash
   openssl rand -hex 32
   ```
2. Sett `CLOUDFLARE_ORIGIN_SECRET` i app-spec-en på DigitalOcean.
3. I Cloudflare: **Rules → Transform Rules → Modify Request Header** → legg til
   en regel som setter `X-CF-Origin-Secret` til samme verdi på all trafikk mot
   origin.

Uten variabelen kjører appen som før, men logger en advarsel ved oppstart:
bypassen er da fortsatt åpen.

> Merk at dette gjør klient-IP-en riktig — det stenger ikke origin for direkte
> trafikk. Vil man også tvinge all trafikk gjennom Cloudflares WAF, må origin
> begrenses på nettverksnivå (App Platform trusted sources) i tillegg.
