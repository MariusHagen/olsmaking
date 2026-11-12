---
name: plan-kritikk
description: La en kritiker med en annen modell enn forfatteren lese en planfil (markdown) mot repoet, rette det som er feil, gjøre planen kortere og klarere, og legge åpne spørsmål under «Åpent». Bruk den før en plan startes, særlig før en ubemannet kjøring i flere bølger, når noen sier «kritiser planen», «se over planen», «stemmer planen med koden», «er planen klar», eller når en plan er skrevet av en agent og ingen andre har lest den ennå.
---

# Plankritikk

En plan skrevet av én modell har den modellens blinde flekker. En kritiker med en annen modell som
sjekker planen mot repoet, fanger det forfatteren tok for gitt: filer som har flyttet, tall som har
endret seg, ferdig-kriterier ingen kan etterprøve, rekkefølge som ikke går opp. Kritikeren finner;
du avgjør og retter. Planens eier avgjør det som er et valg, ikke en feil.

Planen skal si hva som skal gjøres, eller hva som er gjort, så klart at en utvikler som ikke var med,
forstår den. Hvordan den ble til, hører ikke hjemme i den. Én runde holder for de fleste planer. Kjør en
ny bare når omfanget er endret, eller planen rører noe som er dyrt å ta feil på.

Argument: stien til planfila, og eventuelt `--modell sonnet|fable|opus`.

## 1. Velg kritikerens modell

- Finn forfatterens modell: `Co-Authored-By` i commitene som rører planfila
  (`git log --format='%b' -- <planfil>`), eller spør.
- Kritikeren skal være en annen modell. Er forfatteren opus: `fable` for planer som rører noe dyrt å
  ta feil på (dataintegritet, juridisk historikk, sikkerhet, migrasjoner, sletting), ellers `sonnet`.
  Er forfatteren fable eller sonnet: `opus`. Ukjent forfatter: `sonnet`.
- `--modell` overstyrer.

## 2. Start kritikeren

Én agent med valgt modell (Agent-verktøyets `model`-parameter), med dette oppdraget fylt ut:

```
Du er kritiker av planen <planfil> i <repo>. Svar på <brukerens språk>. Du endrer ingen filer.
Les planen, repoets CLAUDE.md (eller tilsvarende), og alle filer, mapper, kommandoer og docs planen
nevner. Sjekk:
1. Fakta mot repoet: finnes filene, klassene, rutene og skriptene; stemmer tallene (mål på nytt);
   virker kommandoene slik planen sier (kjør bare lesende kommandoer).
2. Indre logikk: rekkefølge og avhengigheter, om hvert ferdig-kriterium kan etterprøves mekanisk,
   om bølgene er for store for budsjettet, om noe gjøres to ganger eller ikke i det hele tatt.
3. Repoets regler: dokumentasjonskrav, tester, språk og typografi, hva som krever eierens godkjenning.
4. Det som mangler: steg planen tar for gitt (docs, konfig, opprydding), risiko uten tiltak,
   antakelser som ikke står.
5. «Kort fortalt»: står seksjonen øverst, rett etter Metadata, med høyst seks linjer og en skisse
   (eller en grunn til at skissen mangler)? Stemmer den med resten av planen: hva som er nytt, endret og
   utenfor, omfanget og estimatet, og navnene og pilene i skissen? Mangler seksjonen, er det et «hull»;
   sier den noe annet enn planen, er det en «feil».
6. Lengde og språk: sier planen hva som skal gjøres, uten historikk, beslutningslogg, datoer på valg
   eller gjentakelser? Hører noe hjemme i en egen task (parkert eller avgrenset stoff)? Rettesnor: høyst
   rundt 300 linjer, og mye kortere for en liten task. Finnes det faguttrykk, interne forkortelser eller
   nummererte regler og funn som en utvikler som ikke var med, ikke forstår? Foreslå klarere ord.
7. Anslag: tell mot commit-tidene i git-loggen for lignende arbeid, i begge retninger. Et for høyt
   anslag er like mye en «feil» som et for lavt. Se særlig etter gulv (mange rader på én til to timer),
   buffer eller påslag bakt inn i tallet, og egne rader for review og docs.
Rapporter kandidatfunn, nummerert. For hvert: hva planen sier (med sitat eller seksjon), hva som er
feil eller mangler, bevis (fil:linje, kommando og output), og forslag til endring. Skill mellom
«feil» (planen tar feil om repoet), «hull» (noe mangler) og «valg» (noe eieren må avgjøre).
Ingen funn er et gyldig svar. Ikke foreslå endringer i scope uten å merke dem som «valg».
```

## 3. Avgjør og rett

- Gå gjennom funnene selv. Etterprøv dem som endrer planen: les filen, kjør kommandoen. En kritiker
  kan også ta feil.
- Rett planen for funn du godtar. Behold planens struktur og stil, og planens språk og typografi.
- Rett ved å erstatte, ikke ved å legge til. Planen får ingen beslutningslogg, ingen datoer på valg og
  ingen merknader om hva som ble endret etter kritikk. Kutt det som ikke hjelper den som skal gjøre
  jobben.
- «Valg» rettes ikke. Legg dem som spørsmål under «Åpent» nederst i planen. Når eieren har svart, skrives
  svaret inn der det hører hjemme i planen, og spørsmålet fjernes.
- Rett «Kort fortalt» sist, så den beskriver planen slik den står etter de andre rettelsene. Mangler
  den, skriv den: høyst seks linjer og en Mermaid-skisse, som i `tasks/_TEMPLATE.md` når repoet har
  en slik mal.

## 4. Avslutt

- Commit endringen i planen som en egen commit hvis repoet er under git, og ikke bland den med
  annet arbeid. Commit-meldingen sier hva kritikken endret, og hva som ble avvist og hvorfor. Planfila
  får ingen «Kritikk»-seksjon.
- Rapporter til brukeren: antall funn per type, de viktigste endringene, og spørsmålene under «Åpent».
  Planen regnes ikke som klar før de er besvart.
