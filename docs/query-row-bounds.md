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

De øvrige `findMany` uten grense er fortsatt ubundne, og de vokser med bruk.
`EventUpdate` er den største som står igjen. De trenger ekte paginering, som er
en API-endring, ikke en konstant. Se issue #215.

`EventInvitation`, `OrganizationInvitation`, `EventCoOrganizerInvitation`,
`ArrangerFollower` og listene bak `/users/:userId/arranging` og
`/users/:userId/organizations` er tatt i issue #227. De tar nå `skip`/`take`
gjennom `pageBoundsOf` i `src/util/pagination.ts`, som lar `take` falle tilbake
til `MAX_PAGE_SIZE` når kallstedet ikke oppgir noe: spørringen får en grense
uten at en klient som aldri sendte `take` får et kortere svar enn før.

`skip` og `take` peker på posisjoner, og posisjoner finnes bare under en total
ordning. To organisasjoner med samme navn, eller to invitasjoner opprettet i
samme millisekund, er utbyttbare for Postgres: den kan gi dem i én rekkefølge
på side 1 og motsatt på side 2, slik at en rad serveres to ganger og naboen
aldri. Derfor sorterer hver paginerte spørring på primærnøkkelen i tillegg til
kolonnen lista faktisk sorteres på.

`/users/:userId/arranging` paginerer over events, ikke over `EventArranger`-rader.
Et arrangement brukeren står bak både personlig og gjennom en forening har to
rader, og en side over rader ville brukt to plasser på det og dyttet et ekte
arrangement over på neste side. Radene for siden hentes etterpå, ubundet, fordi
de allerede er begrenset av arrangementene siden valgte.

Varsler er den eneste av dem som ikke kan pagineres i én spørring. Tre kilder
slås sammen og sorteres på `createdAt`, og en side kan i sin helhet komme fra
én av dem, så hver kilde henter sine nyeste `skip + take` rader før
sammenslåingen. Færre enn det, og en rad som hører hjemme på siden mangler i
alle listene som ble lest.

## Å legge til en modell

Er en ny modell det som gir tilgang, legg den i
`MODELS_WHOSE_ROWS_GRANT_ACCESS`. Testen finner da alle spørringer mot den som
ikke oppgir `take`, inkludert dem ingen har tenkt på.
