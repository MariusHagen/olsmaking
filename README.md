# Ølsmaking

En side som setter sammen en juleølsmaking fra Vinmonopolet. Du velger butikk eller nettbestilling, hvor
mange dere blir og hvor mye dere vil bruke. Siden plukker øl fra ulike smaksgrupper, med best mulig score på
Untappd innenfor budsjettet, og setter dem i rekkefølge fra lett til tungt.

Du får:

- antall flasker av hvert øl, regnet ut fra rundt 7 cl per person, og 5 cl av øl på 10 % eller mer
- «Bytt ut» for hvert øl, med de beste andre fra samme smaksgruppe som holder budsjettet
- en handleliste med varenumre som kan kopieres
- en lenke til rekka som kan deles: den viser de samme ølene, med dagens pris og lager
- hele hylla i butikken, med søk og filter

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
tools/verifiser.sh                      # alle testene
```

## Drift

`.github/workflows/publiser.yml` kjører testene, henter data og publiserer `site/` på GitHub Pages hver natt
kl. 04 UTC. Pages må være slått på med «GitHub Actions» som kilde. Krever Ølmonopolet en gang nøkkel, legges
den i hemmeligheten `OLMONOPOLET_API_KEY`.

GitHub slår av nattlige jobber i offentlige repoer etter 60 dager uten aktivitet. Før neste juleølsesong
slås den på igjen under «Actions».
