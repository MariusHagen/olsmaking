# CLAUDE.md

## Prosjektet

Olsmaking er en statisk side som setter sammen en smakerekke med juleøl og julemjød fra Vinmonopolet. Man
velger butikk eller nettbestilling, antall personer, budsjett og hvilke typer som skal være med, og får øl fra
typene, fra lett til tungt, med antall flasker, handleliste og en lenke som kan deles. Hobbyprosjekt, ikke i Knowits eller DiBKs navn.
Repoet og siden er offentlige.

## Hvordan det henger sammen

- `juleol.py` henter årets juleøl og julemjød med lager i alle butikker fra API-et til Ølmonopolet, i ett
  kall, og skriver `site/data/juleol.json`. Rekkefølgen på typene står i `REKKEFOLGE`. Bare standardbiblioteket.
- `site/utvalg.mjs` regner ut rekka: det beste settet innenfor budsjettet, med en nedre og øvre grense per
  type. Ølene fordeles jevnt på typene, eller med det faste antallet man har valgt for en type. Den har ingen tilgang til siden, så den testes for seg.
- `site/index.html` er siden. Den henter `data/juleol.json` når den åpnes, og har valgene i lenken.
- `.github/workflows/publiser.yml` kjører testene, henter data og publiserer `site/` på GitHub Pages hver
  natt kl. 04 UTC, og når den startes for hånd.
- Smakerunden: `api/runde.mjs` er én Vercel-funksjon i et eget Vercel-prosjekt, og all logikken ligger i
  `api/_lib/smakerunde.mjs` med lageret i `api/_lib/lager.mjs` (Upstash via REST, eller minnet lokalt og i
  tester). `site/smak.html` er deltakersiden, `site/vert.html` storskjermen, og `site/oppsett.mjs` har adressen
  til API-et. Oppsettet på Vercel står i `docs/deploy.md`.
- `site/qr.mjs` lager QR-koden på storskjermen uten bibliotek. Den testes med `node --test`, og
  `tools/sjekk-qr.mjs` lar macOS' QR-leser lese en kode i hver versjon den kan lage.

## Kommandoer

```bash
tools/verifiser.sh                      # alle testene
python3 juleol.py                       # hent data til site/data/juleol.json (ett kall)
python3 tools/lokal-side.py             # siden lokalt på http://localhost:8000, alltid den nyeste
node tools/lokal-api.mjs                # API-et for smakerunden lokalt på port 8787, med minnelager
node tools/lokal-api.mjs --lan          # det samme, og fra en telefon på samme Wi-Fi
node tools/sjekk-qr.mjs                 # macOS' QR-leser leser QR-kodene (bare på Mac)
```

## Regler som ikke synes i koden

- Dataene kommer bare fra API-et til Ølmonopolet. Ingen henting fra Untappd: vilkårene deres forbyr det, og
  nettsidene ligger bak bot-beskyttelse. Ikke omgå en blokkering eller et krav om nøkkel.
- Hent sjelden: ett kall per kjøring, og aldri fra siden i nettleseren. Krever API-et nøkkel, ligger den i
  GitHub-hemmeligheten `OLMONOPOLET_API_KEY`.
- Tester bruker lagrede eller konstruerte svar, aldri ekte kall mot API-et.
- Ingen reklame for alkohol: ingen annonser, betalte lenker eller bånd til produsenter, og nøktern tekst.
  Ikke Polets navn eller logo i navnet på siden.
- Ølmonopolet nevnes og lenkes til i bunnteksten.
- Hovedsiden sender ingenting om brukeren: posisjonen fra «Finn nærmeste butikk» brukes bare i nettleseren,
  og valgt butikk og en lagret rekke huskes bare i `localStorage`. Smakerunden lagrer kallenavn, karakterer og kommentarer hos
  Upstash i sju dager etter siste endring, og ingenting annet. Vi lagrer ikke IP-adresser selv, men Vercel og
  Upstash fører egne logger. Ingen eksterne fonter, skript eller sporing.
- Upstash-databasen deles med lunsjprosjektet. Alle nøkler har prefikset `olsmaking:`, og lageret avviser
  alt annet. Nye ruter må gå gjennom sikringene før lageret: ugyldig kode og ukjent rute avvises, bremsen per
  instans, og nødbryteren `SMAKERUNDE_AV=1`.
- Uten vertnøkkelen viser et øl som ikke er åpnet, bare plassen, i både blind og åpen runde. Ølet som smakes,
  viser i en blind runde bare plassen og antall karakterer. Ingen ser snitt eller karakterer før ølet er
  avslørt. En test sjekker feltene for hvert øl mot en tillatt liste før start, midt i og etter siste øl, og
  den må utvides når nye felter kommer.

## Tasks

Tasks og planer er markdown-filer i `tasks/`. Skillen `ny-task` har nummeret og malen, og ferdige tasks
flyttes til `tasks/completed/`. Før en plan startes: `plan-kritikk`. Før noe regnes som ferdig:
`review-etter-risiko`.
