# Sikkerhetspolicy

## Omfang

Denne policyen gjelder for koden i dette repoet: backend-API-et til
[peoply.app](https://peoply.app), servert på `api.peoply.app`. Den dekker
sårbarheter i selve applikasjonen (autentisering, autorisasjon, datahåndtering,
integrasjoner mot Prisma/Postgres og lignende), ikke tredjepartstjenester vi
er avhengige av (Vipps, Google OAuth, DigitalOcean-infrastruktur) med mindre
sårbarheten skyldes hvordan vi bruker dem.

Ikke i omfang: tjenestenekt-testing (DoS/DDoS), automatiserte skannere som
belaster produksjon, social engineering mot brukere eller bidragsytere, og
fysisk sikkerhet.

## Rapportere en sårbarhet

Ikke opprett en offentlig GitHub-issue for sikkerhetssårbarheter. Send i
stedet en e-post til **maps-kontakt@studorg.uio.no** med:

- En beskrivelse av sårbarheten og hvor den befinner seg
- Steg for å reprodusere den
- Hva du vurderer som potensiell konsekvens
- Eventuell proof-of-concept (valgfritt)

## Hva du kan forvente

Peoply driftes av frivillige i MAPS (studentorganisasjon ved UiO). Vi kan
ikke love en fast responstid, men vi bekrefter mottak og følger opp så raskt
vi har kapasitet til. Vi setter pris på ansvarlig rapportering og ber om at
du gir oss rimelig tid til å rette feilen før eventuell offentliggjøring. Vi
har ikke et bug bounty-program.

---

# Security Policy

## Scope

This policy covers the code in this repository: the backend API for
[peoply.app](https://peoply.app), served at `api.peoply.app`. It covers
vulnerabilities in the application itself (authentication, authorization,
data handling, integrations with Prisma/Postgres, etc.), not third-party
services we depend on (Vipps, Google OAuth, DigitalOcean infrastructure)
unless the vulnerability stems from how we use them.

Out of scope: denial-of-service testing (DoS/DDoS), automated scanners that
put load on production, social engineering against users or contributors, and
physical security.

## Reporting a vulnerability

Please do not open a public GitHub issue for security vulnerabilities.
Instead, email **maps-kontakt@studorg.uio.no** with:

- A description of the vulnerability and where it is located
- Steps to reproduce it
- What you consider the potential impact to be
- A proof of concept, if you have one (optional)

## What to expect

Peoply is run by volunteers at MAPS (a student organization at the
University of Oslo). We can't promise a fixed response time, but we will
acknowledge your report and follow up as soon as we're able to. We
appreciate responsible disclosure and ask that you give us reasonable time
to fix an issue before any public disclosure. We do not run a bug bounty
program.
