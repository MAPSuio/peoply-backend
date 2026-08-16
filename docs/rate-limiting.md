# Rate limiting og klient-IP

Author: Victor

## Oversikt

`ThrottlerModule` i `app.module.ts` gir 100 requests per IP per minutt, håndhevet
av `CfThrottlerGuard`. Det er den eneste per-IP-kontrollen som er igjen i
applikasjonen.

Det fantes tidligere en `ThreatDetectionService` som analyserte hver request for
`.env`- og `wp-admin`-prober, 404-bursts og gjentatte auth-feil, og sendte
Discord-alerts. Den er fjernet. To grunner:

- Den så aldri en ekte klient-IP (se under), så alle besøkende delte bøtte og
  tersklene ble målt på summen av all trafikk.
- Tersklene traff vanlig bruk. En utlogget besøkende får 401 fra
  `POST /auth/refresh` på hver side, og åtte slike på seksti sekunder ble regnet
  som brute-force. I ett vindu på 105 minutter sendte den 129 alerts, Discord
  rate-limitet 118 av dem, og ingen av dem beskrev noe det var noe å gjøre med.

`DiscordAlertService` lever videre under `src/discord/` og brukes fortsatt til
det den er god for: varsel ved ny tilbakemelding og ved ny forening som venter
på godkjenning.

## Klient-IP

Alt per-IP nøkles på det `resolveClientIp()` (`src/util/client-ip.ts`) kommer
frem til.

`CF-Connecting-IP` settes av Cloudflare og overskrives på hver request som går
gjennom edgen, så *bak* Cloudflare er den til å stole på. Den er samtidig bare
en header. Origin er direkte nåbar på `*.ondigitalocean.app` — deploy-workflowen
poller den URL-en selv — så en angriper som går utenom Cloudflare og sender en
ny `CF-Connecting-IP` per request havner i en ny bøtte hver gang.

To ting hindrer det:

1. Verdien må parse som en IP-adresse. Ellers er den en vilkårlig
   angriperkontrollert streng brukt som Map-nøkkel og limt inn i loggen.
2. Requesten må vise at den kom gjennom Cloudflare, ved å sende hemmeligheten i
   `CLOUDFLARE_ORIGIN_SECRET` som `X-CF-Origin-Secret`. Requests som ikke kan
   det faller tilbake på `req.ip`, som Express utleder fra proxy-kjeden.

### Kjent problem: klient-IP-en er per i dag Cloudflares, ikke brukerens

Målt 16.08.2026 mot produksjon: en request sendt fra IP `84.211.24.137` ble
logget som `172.71.148.35`, altså en Cloudflare-edge. Det gjelder all trafikk,
ikke bare bot-prober.

Konsekvensen er at grensen på 100 requests per minutt deles av alle brukere bak
samme Cloudflare-edge i stedet for å gjelde per bruker. Med rundt seks API-kall
per sidevisning skal det ikke veldig mange samtidige besøkende til før grensen
nås av helt normal trafikk. Det har ikke slått ut ennå (ingen 429 i loggen), men
det er en felle som utløses av at det går bra, ikke av at det går dårlig.

Årsaken er at det er to Cloudflare-lag i kjeden, ikke ett:

```
bruker → Cloudflare (peoply.app) → Cloudflare (DigitalOcean) → App Platform → container
```

`whale-app-yksnk.ondigitalocean.app` slår opp til 172.66.0.96 og 162.159.140.98
og svarer med `server: cloudflare` og `cf-ray`. App Platform fronter altså hver
app med sin egen Cloudflare. Den overskriver `CF-Connecting-IP` med IP-en som
koblet seg til den, og det er vår egen Cloudflare-edge. Headeren blir ikke
strippet, den blir skrevet over av en Cloudflare vi ikke styrer.

Det betyr også at `CLOUDFLARE_ORIGIN_SECRET` ikke løser dette. Hemmeligheten
avgjør om vi *stoler på* headeren, ikke hva som står i den.

Den ekte klient-IP-en må derfor hentes fra `X-Forwarded-For`. Med to proxy-lag
er `trust proxy 1` for lavt: Express teller hopp fra appen og utover, så den
lander på det innerste Cloudflare-laget. Før det endres må det verifiseres hva
som faktisk kommer frem, siden en klient kan sende sin egen `X-Forwarded-For`
og Cloudflare legger til bakerst i stedet for å erstatte. Å plukke det første
elementet i blinde ville gjort headeren forfalskbar igjen, altså nøyaktig den
bypassen `client-ip.ts` finnes for å lukke.

### Oppsett av origin-hemmeligheten

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

## Bot-trafikk

Skanning etter `/wp-admin`, `.env`, `*.php` og liknende er konstant
bakgrunnstrafikk mot enhver offentlig IP. Den svarer 404, koster et
route-oppslag, og blokkeres ikke i applikasjonen: kildene roterer IP raskere enn
en liste kan vedlikeholdes, og appen kjenner uansett ikke den ekte IP-en. Skal
det stoppes, hører det hjemme i Cloudflare (WAF / Bot Fight Mode), som ser den
ekte klienten og avviser før trafikken når origin.
