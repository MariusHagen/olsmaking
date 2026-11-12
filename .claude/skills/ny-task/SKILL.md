---
name: ny-task
description: Lag en ny task eller plan i olsmaking, med neste nummer, riktig mal og riktig mappe. Bruk den når noen ber om å «lage en task», «skrive en plan», «legge det i en egen task» eller «parkere» noe, før fila opprettes.
---

# Ny task

Tasks er markdown-filer i `tasks/`, én per task, med `# Task NNN: Tittel` og metadata-tabellen fra
`tasks/_TEMPLATE.md` (Status `pending`/`in-progress`/`completed`, Created, Completed).

## Nummeret

Høyeste nummer i `tasks/` og `tasks/completed/` pluss én, med tre siffer:

```bash
ls tasks tasks/completed 2>/dev/null | grep -oE '^[0-9]{3}' | sort -n | tail -1
```

## Innhold

Bruk `tasks/_TEMPLATE.md`. En plan sier hva som skal gjøres eller er gjort, i klarspråk: «Kort fortalt»
øverst, ingen beslutningslogg eller historikk (git har den), og parkert stoff i en egen task. Valg eieren
må ta, står under «Åpent» til de er besvart.

## Mappe

`tasks/` mens tasken pågår. Ferdige tasks flyttes til `tasks/completed/`.

## Commit

Commit-meldingen for en task-fil sier hva som er funnet, bestemt eller gjort, ikke bare at tasken finnes.
