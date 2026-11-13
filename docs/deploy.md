# Deploy

Siden ligger på GitHub Pages og publiseres av `.github/workflows/publiser.yml` hver natt. API-et for
smakerunden er et eget Vercel-prosjekt fra det samme repoet, og rundene lagres i Upstash Redis, i den samme
databasen som lunsjprosjektet, med prefikset `olsmaking:`.

## Første oppsett av API-et på Vercel

1. I Vercel: «Add New Project», velg repoet `olsmaking`, og kall prosjektet `olsmaking-api`. Da blir adressen
   `https://olsmaking-api.vercel.app`, som er den `site/oppsett.mjs` bruker.
2. «Framework Preset»: Other. La byggekommandoen og «Output Directory» stå tomme. `.vercelignore` sørger for
   at bare `api/` og `vercel.json` blir med.
3. Under «Storage»: koble den eksisterende Upstash-databasen fra lunsjprosjektet til det nye prosjektet. Det
   setter `KV_REST_API_URL` og `KV_REST_API_TOKEN`. Uten dem kaster API-et i stedet for å bruke minnet.
4. Deploy, og kjør røyktesten under.
5. Slå på smakerunden på siden: sett `SMAKERUNDE = lokalt || true` i `site/oppsett.mjs`, commit, og start
   publiseringen under «Actions», eller vent til natta.

Etter dette deployer Vercel API-et ved hver push til `main`.

## Røyktest

Kjøres mot Vercel før smakerunden slås på, fordi omskrivingen i `vercel.json` og funksjonen bare kan prøves
der. Den lager én runde, som slettes av seg selv etter sju dager.

```bash
A=https://olsmaking-api.vercel.app/api/runde
# Forhåndskall fra siden: 204 med siden som tillatt opprinnelse.
curl -s -i -X OPTIONS -H "Origin: https://mariushagen.github.io" $A/ABCDEF/karakter | grep -i -E "^HTTP|allow-origin"
# Ukjent kode: 404 med norsk feilmelding.
curl -s $A/ABCDEF
# Lag en runde, bli med, gi en karakter, se resultatet og avslutt.
R=$(curl -s -X POST -H "Content-Type: application/json" -d '{"ol":[{"navn":"Røyktest","score":3.5}]}' $A); echo "$R"
K=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin)['kode'])")
V=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin)['vertNokkel'])")
D=$(curl -s -X POST -H "Content-Type: application/json" -d '{"kallenavn":"Test"}' $A/$K/deltaker); echo "$D"
curl -s -X PUT -H "Content-Type: application/json" -d "$(echo "$D" | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps({'deltakerId': d['deltakerId'], 'deltakerNokkel': d['deltakerNokkel'], 'plass': 1, 'stjerner': 4}))")" $A/$K/karakter
curl -s $A/$K/resultater
curl -s -X POST -H "Content-Type: application/json" -d "{\"vertNokkel\":\"$V\"}" $A/$K/avslutt
```

Alle kallene skal svare uten «Fant ikke det du lette etter». Start så en runde fra siden, bli med fra to
telefoner, rate, og avslutt.

## Nødbryteren

Brukes kvoten opp for fort, eller noe ser galt ut: sett miljøvariabelen `SMAKERUNDE_AV` til `1` under
«Settings» → «Environment Variables», og deploy på nytt («Redeploy»), fordi Vercel bare leser variablene ved
deploy. Da svarer alle ruter 503 uten å røre Upstash, og lunsjprosjektet er beskyttet. Fjern variabelen og
deploy på nytt for å slå smakerunden på igjen.

## Bruken av kvoten

En runde med 15 personer, 10 øl og 90 minutter bruker rundt 6 000 kommandoer i Upstash, og gratisnivået har
500 000 i måneden, delt med lunsjprosjektet. Bruken står i Upstash-konsollen.
