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

## Smakerunde

Under rekka kan du starte en smakerunde. Du får en kode og en lenke som du deler med de andre, og en side for
storskjerm. Alle blir med på mobilen med et kallenavn og gir hvert øl 1 til 5 stjerner i halve steg, med en
valgfri kommentar. Storskjermen viser snittet per øl mens dere smaker. Når du avslutter, kommer kontorets
favoritt, det mest omstridte ølet, den største overraskelsen og hvem som var mest enig med Untappd, og
resultatet kan skrives ut eller lagres som bilde.

Velger du blindsmaking, ser deltakerne bare «Øl 1», «Øl 2» til du avslutter. Du får en skjenkeliste over
hvilken flaske som er hvilket nummer.

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
python3 -m http.server -d site 8000     # siden på http://localhost:8000
node tools/lokal-api.mjs                # smakerunden lokalt på port 8787, med minnelager
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
