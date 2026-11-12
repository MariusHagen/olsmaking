---
name: review-etter-risiko
description: Review av en diff i olsmaking der modell og linser velges ut fra hva endringen rører, ikke likt for alt. Bruk den når en branch, en PR eller et commit-område skal gjennomgås før det regnes som ferdig, når noen ber om «review», «gjennomgå» eller «se over endringene», og i stedet for å starte /code-review direkte i dette repoet.
---

# Review etter risiko

Prinsippet: der ferdig-kriteriet er en mekanisk sjekk, er kriteriet reviewen. En modell-review legges på
der kriteriet ikke dekker skjønn, og da med en modell som passer risikoen.

## 1. Finn diffen

- Argument: et commit-område (`a..b`), en branch eller et PR-nummer (`gh pr diff <nr>`).
- Uten argument: `git merge-base origin/main HEAD` til arbeidstreet, med ucommittede filer. Uten remote:
  arbeidstreet mot forrige commit, eller hele treet før første commit.

## 2. Sjekk de mekaniske kriteriene først

- Kjør `tools/verifiser.sh`. Rød verifisering er et funn i seg selv.
- Har tasken et mekanisk ferdig-kriterium (en test som er sett feile på et bevisst brudd), sjekk det
  konkret. En test som er endret i en endring som ikke skal endre oppførsel, er et faresignal: rapporter den.
- Er kriteriene oppfylt og diffen rører ingen av områdene under, er det reviewen. Si det og stopp.

## 3. Områdene som får modell-review

| Område | Stier | Hva reviewen ser etter |
|---|---|---|
| Hentingen | `juleol.py` | Hva som sendes til Ølmonopolet og hvor ofte, hva som skjer når de svarer med feil eller krever nøkkel, at siden aldri får tomme eller halve data |
| Publiseringen | `.github/workflows/**` | Hemmeligheter, rettigheter, og hva som publiseres offentlig |
| Utvalget, når testene er endret | `site/utvalg.mjs` og `tests/utvalg.test.mjs` | At testene fortsatt sjekker budsjett, én per gruppe og rekkefølge |
| Siden | `site/index.html` | Ingen modell-linse. Ta skjermbilder i 360 og 1280 px, lyst og mørkt tema, og prøv med tastatur |

Modellen er en annen enn forfatteren (se `Co-Authored-By` i commitene): er forfatteren opus, bruk `sonnet`;
er forfatteren sonnet, bruk `opus`. Ingenting i repoet er dyrt nok å ta feil på til å kreve `fable`.
Høyst to agenter samtidig.

## 4. Oppdraget til hver reviewer

```
Review av <område> i <sti til repoet>, linse: <linse>. Svar på norsk.
Diff: <kommando som viser diffen>. Les bare det diffen rører, pluss det du trenger for å forstå det.
Repoets regler som ikke synes i koden: «Regler som ikke synes i koden» i CLAUDE.md.
Ikke gjør kall mot api.olmonopolet.app, vinmonopolet.no eller untappd.com.
Rapporter bare funn du har etterprøvd mot koden. For hvert funn: fil:linje, alvorlighet
(høy/middels/lav), et konkret scenario som gir feil resultat, og forslag til retting.
Ikke rapporter smak eller stil som ikke bryter en regel i repoet. Ingen funn er et gyldig svar.
```

## 5. Samle og rapporter

- Slå sammen like funn, sorter på alvorlighet, og behold fil:linje.
- Etterprøv funn med høy alvorlighet selv før de rapporteres: les koden, eller skriv en test som feiler.
- Rapporter på norsk: hva som ble reviewet (område, modell), funnene, og hva som bevisst ikke ble reviewet.
- Ikke rett noe uten at brukeren ber om det, men foreslå rettingen.
