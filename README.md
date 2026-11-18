# Ølsmaking

En side som setter sammen en juleølsmaking fra Vinmonopolet. Du velger butikk eller nettbestilling, hvor
mange dere blir og hvor mye dere vil bruke. Siden plukker øl fra ulike smaksgrupper, med best mulig score på
Untappd innenfor budsjettet, og setter dem i rekkefølge fra lett til tungt, med mjøden til slutt.

Du kan velge hvilke typer som skal være med. Alle er valgt fra start. Velger du færre typer enn antall øl,
kommer det flere av hver type, fordelt så jevnt som mulig. Du kan også ta med opptil fire alkoholfrie øl.

Butikken finner du ved å søke på by eller navn, eller med «Finn nærmeste butikk». Posisjonen din brukes bare i
nettleseren og sendes ingen steder. Siden husker butikken du valgte sist, på den enheten.

Du får:

- antall flasker av hvert øl, regnet ut fra rundt 7 cl per person, og 5 cl av øl på 10 % eller mer
- «Bytt ut» for hvert øl, med de beste andre fra samme smaksgruppe som holder budsjettet
- en handleliste med varenumre som kan kopieres
- en lenke til rekka som kan deles: den viser de samme ølene, med dagens pris og lager
- hele hylla i butikken, med søk og filter

Handler dere noen uker før dere smaker, kan du låse ølene du har kjøpt eller vil ha. Endrer du antall personer,
budsjett eller typer, blir de låste stående, og bare resten velges på nytt. «Lagre rekka» lagrer rekka i
nettleseren din, med alle opplysningene. Når du kommer tilbake, er den der uendret, også om et øl er utsolgt
eller borte hos Polet. Den lagrede rekka finnes bare på den enheten; lenken er måten å dele den på.

## Smakerunde

Under rekka kan du starte en smakerunde. Du får en side for storskjerm med en kode, en lenke og en QR-kode som
de andre skanner med mobilen, og alle blir med med et kallenavn. Dere smaker ett øl om gangen. Du åpner første
øl, alle gir det 1 til 5 stjerner i halve steg, med en valgfri kommentar, og storskjermen viser hvor mange som
har ratet. Når alle har smakt, trykker du «Neste øl»: da låses karakterene for det ølet, snittet, Untappd og
kommentarene vises på storskjermen og hos alle, ølet kommer inn på topplista, og neste øl åpnes. Hvilke øl som
kommer, vises verken på telefonene eller på storskjermen. Når du avslutter, kommer kontorets favoritt, det mest
omstridte ølet, den største overraskelsen og hvem som var mest enig med Untappd. Resultatet kan skrives ut
eller lagres som bilde.

Storskjermen er laget for en TV eller projektor i 16:9 og fyller skjermen uten rulling, også resultatet etter
avslutningen. Kommentarene står under resultatet, så dem ruller du ned til. I skjenkelista, som
åpnes i et eget vindu, ser du rekkefølgen og kan flytte øl som ikke er åpnet ennå, også de alkoholfrie.

Velger du blindsmaking, ser deltakerne bare «Øl 1», «Øl 2» til du går videre fra ølet. Hold da skjenkelista
på din egen skjerm, ikke på storskjermen.

**Hva som lagres:** kallenavnet, karakterene og kommentarene dine, i sju dager etter siste endring i runden.
Så slettes alt. Vi lagrer ikke IP-adresser selv, men tjenestene vi bruker (Vercel og Upstash) fører egne
logger. Koden på seks tegn er det eneste som beskytter en runde, så alle som har koden, kan se resultatet.

## Hvor dataene kommer fra

Alt kommer fra [Ølmonopolet](https://www.olmonopolet.app), som henter lager og priser fra Vinmonopolet og
score fra Untappd. Siden henter dataene én gang i døgnet, og Ølmonopolet oppdaterer lageret om kvelden. Sjekk
derfor varen hos Polet før du drar.

Øl med få innsjekker på Untappd trekkes mot snittet i smaksgruppa når rekka velges, så et øl med 20
innsjekker og 4,3 ikke slår et med 5 000 og 4,1.

Siden er et hobbyprosjekt uten tilknytning til Vinmonopolet, Ølmonopolet eller Untappd, og uten reklame.

## Kjøre den lokalt

Krever `python3` og `node`, ingen andre avhengigheter.

```bash
python3 juleol.py                       # henter data til site/data/juleol.json (ett kall)
python3 tools/lokal-side.py             # siden på http://localhost:8000, alltid den nyeste
node tools/lokal-api.mjs                # smakerunden lokalt på port 8787, med minnelager
node tools/lokal-api.mjs --lan          # det samme, og fra en telefon på samme Wi-Fi
node tools/sjekk-qr.mjs                 # macOS' QR-leser leser QR-kodene (bare på Mac)
tools/verifiser.sh                      # alle testene
```

## Drift

`.github/workflows/publiser.yml` kjører testene, henter data og publiserer `site/` på GitHub Pages hver natt
kl. 04 UTC. Pages må være slått på med «GitHub Actions» som kilde. Krever Ølmonopolet en gang nøkkel, legges
den i hemmeligheten `OLMONOPOLET_API_KEY`.

GitHub slår av nattlige jobber i offentlige repoer etter 60 dager uten aktivitet. Før neste juleølsesong
slås den på igjen under «Actions».

API-et for smakerunden er et eget Vercel-prosjekt. Oppsettet, røyktesten og nødbryteren står i
[docs/deploy.md](docs/deploy.md).
