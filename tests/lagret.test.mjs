// Rekka som lagres i nettleseren, testet mot data hentet 12.11.2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { velg } from "../site/utvalg.mjs";
import { tilLagring, fraLagring } from "../site/lagret.mjs";

const data = JSON.parse(readFileSync(new URL("./fixtures/juleol-2026-11-12.json", import.meta.url), "utf-8"));
const TORG = "Trondheim, Trondheim Torg";
const valg = { butikk: TORG, personer: 6, budsjett: 1500, antall: 8, alkoholfrie: 1, typer: [...data.rekkefolge] };
const r = velg(data, valg);
const lagring = () => tilLagring({ valg, rekke: r.rekke, alkoholfrie: r.alkoholfrie, laste: [r.rekke[1].id], lagret: "2026-11-13T18:00:00.000Z" });

test("det som lagres, kommer uendret tilbake, uten lagerstatus", () => {
  const ut = fraLagring(lagring());
  assert.deepEqual(ut.valg, valg);
  assert.deepEqual(ut.laste, [r.rekke[1].id]);
  assert.equal(ut.lagret, "2026-11-13T18:00:00.000Z");
  assert.equal(ut.rekke.length, 8);
  assert.equal(ut.alkoholfrie.length, 1);
  for (const [i, o] of ut.rekke.entries()) {
    const f = r.rekke[i];
    for (const felt of ["id", "navn", "gruppe", "stil", "score", "innsjekker", "alkohol", "cl", "pris", "flasker", "kostnad", "polet", "untappd"]) {
      assert.equal(o[felt], f[felt] ?? (felt === "polet" || felt === "untappd" ? "" : null), `${f.navn}: ${felt}`);
    }
    assert.ok(!("lager" in o) && !("utsolgt" in o) && !("justert" in o), "lagerstatus og utregning lagres ikke");
  }
});

test("ødelagte eller ukjente data gir ingen lagret rekke", () => {
  const ok = JSON.parse(lagring());
  const endret = (f) => JSON.stringify(f(structuredClone(ok)));
  for (const [navn, tekst] of [
    ["ikke JSON", "{"],
    ["null", "null"],
    ["annen versjon", endret((v) => ({ ...v, versjon: 2 }))],
    ["ugyldig dato", endret((v) => ({ ...v, lagret: "i går" }))],
    ["mangler butikk", endret((v) => { delete v.valg.butikk; return v; })],
    ["antall som tekst", endret((v) => { v.valg.antall = "8"; return v; })],
    ["tom rekke", endret((v) => ({ ...v, rekke: [] }))],
    ["øl uten varenummer", endret((v) => { v.rekke[0].id = ""; return v; })],
    ["pris som tekst", endret((v) => { v.rekke[0].pris = "129,90"; return v; })],
    ["lenke til et annet sted", endret((v) => { v.rekke[0].polet = "javascript:alert(1)"; return v; })],
  ]) {
    assert.equal(fraLagring(tekst), null, navn);
  }
});

test("låser på øl som ikke er i rekka, slippes", () => {
  const ut = fraLagring(JSON.stringify({ ...JSON.parse(lagring()), laste: [r.rekke[1].id, "finnes-ikke", 7] }));
  assert.deepEqual(ut.laste, [r.rekke[1].id]);
});
