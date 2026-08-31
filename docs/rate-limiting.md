# Rate limiting og klient-IP

Author: Victor

## Oversikt

`ThrottlerModule` i `app.module.ts` teller hver request to ganger, håndhevet av
`CfThrottlerGuard`. Det er den eneste per-IP-kontrollen som er igjen i
applikasjonen.

| Kvote | Grense | Bøtte |
| --- | --- | --- |
| `default` | 100/min | per rute per adresse |
| `global` | 600/min | hele appen per adresse |

Uten den delte kvoten var «100 per minutt» i praksis 100 per rute ganger rundt 85
ruter. Taket på 600 er satt mot faktisk trafikk målt 31.08.2026: appen som helhet
toppet på 41 requests i minuttet, og en innlogget forsidevisning koster 22-23
kall, så 600 gir rundt 26 sidevisninger i minuttet fra én adresse.

Ruter som skal utenfor begge kvotene bruker `SkipRateLimit()` fra
`src/rate-limit.ts`. `@SkipThrottle()` alene fritar bare `default`, og en test i
`rate-limit.spec.ts` feiler om noen tar den i bruk direkte.

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

### Hvordan klient-IP-en utledes

Målt 16.08.2026 mot produksjon: en request sendt fra `84.211.24.137` ble logget
som `172.71.148.35`, altså en Cloudflare-edge. Årsaken er at det er to
Cloudflare-lag i kjeden, ikke ett:

```
bruker → Cloudflare (peoply.app) → Cloudflare (DigitalOcean) → App Platform → container
```

App Platform fronter hver app med sin egen Cloudflare, og den overskriver
`CF-Connecting-IP` med adressen som koblet seg til den, altså vår egen edge.
Headeren blir ikke strippet, den blir skrevet over av en Cloudflare vi ikke
styrer. `CLOUDFLARE_ORIGIN_SECRET` avgjør om vi *stoler på* headeren, ikke hva
som står i den, så hemmeligheten alene løser det ikke.

`resolveClientIp()` prøver derfor tre ting, i denne rekkefølgen:

1. **`X-Peoply-Client-IP`, når requesten kan bevise at den kom gjennom sonen
   vår.** Samme transform-regel som setter hemmeligheten setter denne fra
   `ip.src`. Den er den eneste kilden en angriper ikke kan påvirke: DigitalOcean
   sin Cloudflare rører ikke ukjente headere, og uten hemmeligheten blir headeren
   ignorert.
2. **`X-Forwarded-For` lest fra høyre mot venstre**, forbi adresser som ligger i
   kjente proxy-rekkevidder (`util/trusted-proxies.ts`). Første adresse utenfor
   dem er besøkende. Cloudflare-rekkevidder regnes bare som proxy når requesten
   har bevist sonen, siden de deles av alle Cloudflare-kunder.
3. **`CF-Connecting-IP`**, fortsatt bare med bevist sone, og til slutt ytterste
   hopp i kjeden.

Punkt 2 er ikke vanntett alene: Cloudflare *legger til* i en `X-Forwarded-For`
klienten selv sendte, så en angriper som sender fra en Cloudflare-adresse (en
Worker eller en Tunnel) kan legge inn en oppdiktet adresse til venstre og få den
lest som besøkende. Det er derfor punkt 1 finnes, og derfor appen logger en
advarsel første gang en request med gyldig hemmelighet kommer inn *uten*
`X-Peoply-Client-IP`.

### Oppsett av origin-hemmeligheten

1. Generer en hemmelighet (minst 16 tegn):
   ```bash
   openssl rand -hex 32
   ```
2. Sett `CLOUDFLARE_ORIGIN_SECRET` i app-spec-en på DigitalOcean.
3. I Cloudflare: **Rules → Transform Rules → Modify Request Header** → legg til
   en regel som på all trafikk mot origin setter:
   - `X-CF-Origin-Secret` til samme verdi (statisk)
   - `X-Peoply-Client-IP` til uttrykket `ip.src` (dynamisk)

   Begge må stå i samme regel. Uten den andre faller klient-IP-en tilbake på
   `X-Forwarded-For`, som en angriper bak Cloudflare kan styre.

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
