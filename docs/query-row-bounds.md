# Radgrenser på spørringer

Author: Victor

## Oversikt

Et `findMany` uten `take` henter hver rad som matcher. Det er som regel
uinteressant, men på tre modeller er det ikke det: `UserOrganizationRole`,
`EventArranger` og `Registration` er modellene der selve raden er det som gir
en bruker tilgang til noe.

`ALL_ROWS` i `src/util/pagination.ts` er `undefined`, altså nøyaktig det
Prisma allerede gjør uten `take`. Konstanten endrer ingen oppførsel. Den finnes
for at valget skal stå skrevet på kallstedet i stedet for å leses ut av et
fravær, og for at
`src/util/authorization-query-bounds.spec.ts` skal kunne skille et bevisst valg
fra en forglemmelse.

## Hvorfor ikke bare kappe alt

Den opprinnelige oppgaven var minnebruk: backenden lå på 80 prosent av 512 MB,
og 44 av 156 `findMany` i håndskrevet kode hadde ingen grense. Det nærliggende
grepet var en Prisma client extension på `PrismaService` som setter en
default `take` når kallstedet ikke oppgir en.

Det ble forkastet. En avkortet liste over organisasjonsroller svarer ikke tregt,
den svarer feil: medlemmet forbi grensen slutter å være admin, og
registreringen forbi den slutter å gi tilgangen den ga. Det er en verre feil enn
minnebruken som startet det hele, og den er stille.

## Hvorfor ikke kaste

Å kaste når `take` mangler ville tvunget fram et bevisst valg på alle 44, uten
noen stille semantikkendring. Det er fortsatt et reelt alternativ for resten av
kodebasen, men det er 44 kallsteder som hver trenger en vurdering av hva riktig
grense er der. Denne runden tar de tilgangsgivende modellene, som er de eneste
der feil svar er verre enn tregt svar.

## Hva som gjenstår

De øvrige `findMany` uten grense er fortsatt ubundne, og de vokser med bruk:
`EventInvitation`, `ArrangerFollower` og `EventUpdate` er de største. De trenger
ekte paginering, som er en API-endring, ikke en konstant. Se issue #215.

## Å legge til en modell

Er en ny modell det som gir tilgang, legg den i
`MODELS_WHOSE_ROWS_GRANT_ACCESS`. Testen finner da alle spørringer mot den som
ikke oppgir `take`, inkludert dem ingen har tenkt på.
