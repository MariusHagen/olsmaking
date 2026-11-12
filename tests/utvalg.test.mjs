// Utvalget, testet mot data hentet 12.11.2026 og mot et lite datasett der alle kombinasjoner kan prøves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { velg, bytter, kandidater, justertScore, fraVarenumre, NETT } from "../site/utvalg.mjs";

const data = JSON.parse(readFileSync(new URL("./fixtures/juleol-2026-11-12.json", import.meta.url), "utf-8"));
const TORG = "Trondheim, Trondheim Torg";
const pris = (r) => r.rekke.reduce((s, o) => s + o.flasker * o.pris, 0) + (r.alkoholfritt ? r.alkoholfritt.flasker * r.alkoholfritt.pris : 0);

test("rekka holder budsjettet, eller sier at det ikke går opp", () => {
  let gikkOpp = 0, gikkIkke = 0;
  for (let personer = 2; personer <= 14; personer++) {
    for (const budsjett of [400, 800, 1500, 2500, 5000]) {
      const r = velg(data, { butikk: TORG, personer, budsjett, antall: 8, alkoholfritt: true });
      if (r.feil) {
        assert.equal(r.rekke.length, 0);
        gikkIkke++;
        continue;
      }
      gikkOpp++;
      assert.equal(r.rekke.length, 8);
      assert.ok(pris(r) <= budsjett, `${personer} personer, ${budsjett} kr: rekka koster ${pris(r)}`);
    }
  }
  // Begge utfallene må faktisk forekomme, ellers sjekker testen ingenting.
  assert.ok(gikkOpp > 20 && gikkIkke > 5, `gikk opp ${gikkOpp}, gikk ikke ${gikkIkke}`);
});

test("høyst ett øl per smaksgruppe, fra lett til tungt", () => {
  for (const personer of [3, 5, 10]) {
    const r = velg(data, { butikk: TORG, personer, budsjett: 3000, antall: 8 });
    const grupper = r.rekke.map((o) => o.gruppe);
    assert.equal(new Set(grupper).size, grupper.length);
    const plass = grupper.map((g) => data.rekkefolge.indexOf(g));
    assert.ok(plass.every((p) => p >= 0), "bare grupper fra rekkefølgen");
    assert.deepEqual(plass, [...plass].sort((a, b) => a - b));
  }
});

test("et øl med få innsjekker trekkes mot gruppesnittet", () => {
  assert.ok(justertScore(4.3, 20, 3.8) < justertScore(4.1, 5000, 3.8));
  assert.ok(Math.abs(justertScore(4.1, 1e6, 3.8) - 4.1) < 0.001);
});

test("Trondheim Torg, fem personer og 1 500 kr gir åtte øl, og varenumrene gir samme rekke", () => {
  const valg = { butikk: TORG, personer: 5, budsjett: 1500, antall: 8 };
  const r = velg(data, valg);
  assert.equal(r.feil, null);
  assert.equal(r.rekke.length, 8);
  assert.ok(pris(r) <= 1500);
  const igjen = fraVarenumre(data, valg, r.rekke.map((o) => o.id));
  assert.deepEqual(igjen.map((o) => o.id), r.rekke.map((o) => o.id));
  assert.ok(igjen.every((o) => !o.utsolgt));
});

test("bestill på nett gir bare øl som kan bestilles på nett", () => {
  const r = velg(data, { butikk: NETT, personer: 5, budsjett: 2000, antall: 8 });
  assert.equal(r.rekke.length, 8);
  assert.ok(r.rekke.every((o) => o.nett));
});

test("for mange øl for typene gir beskjed om hvor mange som går", () => {
  const r = velg(data, { butikk: TORG, personer: 5, budsjett: 9000, antall: 10, typer: ["Lys og frisk"] });
  assert.match(r.feil, /av disse typene/);
  assert.ok(r.maksAntall < 10);
  assert.equal(velg(data, { butikk: TORG, personer: 5, budsjett: 9000, antall: 4, typer: [] }).feil, "Velg minst én type.");
});

test("bare de valgte typene er med", () => {
  const typer = ["Belgisk", "Mjød", "Humle og IPA"];
  const r = velg(data, { butikk: TORG, personer: 5, budsjett: 3000, antall: 6, typer });
  assert.equal(r.rekke.length, 6);
  assert.ok(r.rekke.every((o) => typer.includes(o.gruppe)));
});

test("færre typer enn øl gir flere per type, fordelt jevnt", () => {
  const typer = ["Porter og stout", "Bokk"];
  const r = velg(data, { butikk: TORG, personer: 5, budsjett: 5000, antall: 8, typer });
  assert.equal(r.rekke.length, 8);
  assert.equal(r.maksPerType, 4);
  for (const g of typer) assert.equal(r.rekke.filter((o) => o.gruppe === g).length, 4, g);
  assert.equal(new Set(r.rekke.map((o) => o.id)).size, 8, "ingen øl to ganger");
});

test("mjøden kommer sist, og innenfor en type går det fra svakt til sterkt", () => {
  const r = velg(data, { butikk: TORG, personer: 5, budsjett: 5000, antall: 4, typer: ["Mjød", "Surt og fruktig"] });
  assert.equal(r.rekke.at(-1).gruppe, "Mjød");
  for (let i = 1; i < r.rekke.length; i++) {
    if (r.rekke[i].gruppe === r.rekke[i - 1].gruppe) assert.ok(r.rekke[i].alkohol >= r.rekke[i - 1].alkohol);
  }
});

test("bytter er fra samme gruppe, ikke allerede i rekka, og holder budsjettet", () => {
  const valg = { butikk: TORG, personer: 5, budsjett: 1500, antall: 8 };
  const r = velg(data, valg);
  for (let plass = 0; plass < r.rekke.length; plass++) {
    for (const alt of bytter(data, valg, r.rekke, r.alkoholfritt, plass)) {
      assert.equal(alt.gruppe, r.rekke[plass].gruppe);
      assert.ok(!r.rekke.some((o) => o.id === alt.id));
      const ny = { ...r, rekke: r.rekke.map((o, i) => (i === plass ? alt : o)) };
      assert.ok(pris(ny) <= 1500);
    }
  }
});

test("valget er det beste settet som finnes, med ett og med flere øl per type", () => {
  let frø = 7;
  const tilfeldig = () => (frø = (frø * 16807) % 2147483647) / 2147483647;
  const syn = { butikker: ["A"], rekkefolge: data.rekkefolge, ol: [] };
  let id = 0;
  for (const g of data.rekkefolge.slice(0, 6)) {
    for (let i = 0; i < 6; i++) {
      syn.ol.push({ id: String(id++), navn: "x", gruppe: g, stil: "", score: 3 + tilfeldig(),
        innsjekker: 10 + Math.floor(tilfeldig() * 1000), alkohol: 6, cl: 33, pris: 40 + Math.round(tilfeldig() * 200),
        nett: true, lager: { 0: 99 } });
    }
  }
  const tilfeller = [
    { typer: data.rekkefolge.slice(0, 6), antall: 4, maks: 1 },
    { typer: data.rekkefolge.slice(0, 2), antall: 5, maks: 3 },
    { typer: data.rekkefolge.slice(0, 1), antall: 4, maks: 4 },
  ];
  for (const { typer, antall, maks } of tilfeller) {
    for (const budsjett of [250, 400, 600, 900, 1500]) {
      const valg = { butikk: "A", personer: 4, budsjett, antall, typer };
      const r = velg(syn, valg);
      const kand = kandidater(syn, valg).filter((o) => typer.includes(o.gruppe));
      const best = alleKombinasjoner(kand, antall, maks, budsjett);
      const navn = `${typer.length} typer, ${antall} øl, ${budsjett} kr`;
      if (best === null) assert.ok(r.feil, `${navn}: ingen kombinasjon går, men utvalget fant en`);
      else assert.ok(Math.abs(r.rekke.reduce((s, o) => s + o.justert, 0) - best) < 1e-9, navn);
    }
  }
});

test("har en type for få øl, får de andre typene flere", () => {
  // Én type med ett øl og én med seks: fem øl gir høyst fire av den største, ikke tre.
  const syn = { butikker: ["A"], rekkefolge: data.rekkefolge, ol: [] };
  const [liten, stor] = data.rekkefolge;
  syn.ol.push({ id: "0", navn: "x", gruppe: liten, stil: "", score: 4, innsjekker: 500, alkohol: 6, cl: 33, pris: 50, nett: true, lager: { 0: 99 } });
  for (let i = 1; i <= 6; i++) {
    syn.ol.push({ id: String(i), navn: "x", gruppe: stor, stil: "", score: 3 + i / 10, innsjekker: 500, alkohol: 6, cl: 33,
      pris: 40 + i * 10, nett: true, lager: { 0: 99 } });
  }
  const valg = { butikk: "A", personer: 4, budsjett: 2000, antall: 5, typer: [liten, stor] };
  const r = velg(syn, valg);
  assert.equal(r.maksPerType, 4);
  assert.equal(r.rekke.length, 5);
  assert.equal(r.rekke.filter((o) => o.gruppe === stor).length, 4);
  const best = alleKombinasjoner(kandidater(syn, valg), 5, 4, 2000);
  assert.ok(Math.abs(r.rekke.reduce((s, o) => s + o.justert, 0) - best) < 1e-9);
});

// Prøver alle sett med n øl og høyst «maks» per type.
function alleKombinasjoner(kand, n, maks, budsjett) {
  let best = null;
  const prov = (i, valgt, perType, kost, score) => {
    if (kost > budsjett) return;
    if (valgt === n) {
      if (best === null || score > best) best = score;
      return;
    }
    if (i === kand.length) return;
    prov(i + 1, valgt, perType, kost, score);
    const o = kand[i];
    if ((perType[o.gruppe] ?? 0) < maks) {
      prov(i + 1, valgt + 1, { ...perType, [o.gruppe]: (perType[o.gruppe] ?? 0) + 1 }, kost + o.kostnad, score + o.justert);
    }
  };
  prov(0, 0, {}, 0, 0);
  return best;
}
