# CLAUDE.md

## Prosjektet

Olsmaking er en statisk side som setter sammen en smakerekke med juleøl og julemjød fra Vinmonopolet. Man
velger butikk eller nettbestilling, antall personer, budsjett og hvilke typer som skal være med, og får øl fra
typene, fra lett til tungt, med antall flasker, handleliste og en lenke som kan deles. Hobbyprosjekt, ikke i Knowits eller DiBKs navn.
Repoet og siden er offentlige.

## Hvordan det henger sammen

- `juleol.py` henter årets juleøl og julemjød med lager i alle butikker fra API-et til Ølmonopolet, i ett
  kall, og skriver `site/data/juleol.json`. Rekkefølgen på typene står i `REKKEFOLGE`. Bare standardbiblioteket.
- `site/utvalg.mjs` regner ut rekka: det beste settet innenfor budsjettet, med høyst ett øl per type, eller
  flere når man har valgt færre typer enn øl. Den har ingen tilgang til siden, så den testes for seg.
- `site/index.html` er siden. Den henter `data/juleol.json` når den åpnes, og har valgene i lenken.
- `.github/workflows/publiser.yml` kjører testene, henter data og publiserer `site/` på GitHub Pages hver
  natt kl. 04 UTC, og når den startes for hånd.

## Kommandoer

```bash
tools/verifiser.sh                      # alle testene
python3 juleol.py                       # hent data til site/data/juleol.json (ett kall)
python3 -m http.server -d site 8000     # siden lokalt på http://localhost:8000
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

## Tasks

Tasks og planer er markdown-filer i `tasks/`. Skillen `ny-task` har nummeret og malen, og ferdige tasks
flyttes til `tasks/completed/`. Før en plan startes: `plan-kritikk`. Før noe regnes som ferdig:
`review-etter-risiko`.
