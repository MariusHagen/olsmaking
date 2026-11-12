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

test("for mange øl gir beskjed om hvor mange som går", () => {
  const r = velg(data, { butikk: TORG, personer: 5, budsjett: 9000, antall: 11 });
  assert.match(r.feil, /smaksgrupper/);
  assert.equal(r.maksAntall, 10);
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

test("valget er det beste settet som finnes", () => {
  let frø = 7;
  const tilfeldig = () => (frø = (frø * 16807) % 2147483647) / 2147483647;
  const grupper = data.rekkefolge.slice(0, 6);
  const syn = { butikker: ["A"], rekkefolge: data.rekkefolge, ol: [] };
  let id = 0;
  for (const g of grupper) {
    for (let i = 0; i < 4; i++) {
      syn.ol.push({ id: String(id++), navn: "x", gruppe: g, stil: "", score: 3 + tilfeldig(),
        innsjekker: 10 + Math.floor(tilfeldig() * 1000), alkohol: 6, cl: 33, pris: 40 + Math.round(tilfeldig() * 200),
        nett: true, lager: { 0: 99 } });
    }
  }
  for (const budsjett of [300, 500, 800, 1200, 2000]) {
    const valg = { butikk: "A", personer: 4, budsjett, antall: 4 };
    const r = velg(syn, valg);
    const best = alleKombinasjoner(kandidater(syn, valg), grupper, 4, budsjett);
    if (best === null) assert.ok(r.feil, `${budsjett} kr: ingen kombinasjon går, men utvalget fant en`);
    else assert.ok(Math.abs(r.rekke.reduce((s, o) => s + o.justert, 0) - best) < 1e-9, `${budsjett} kr`);
  }
});

function alleKombinasjoner(kand, grupper, n, budsjett) {
  let best = null;
  const prov = (g, valgt, kost, score) => {
    if (valgt === n) {
      if (kost <= budsjett && (best === null || score > best)) best = score;
      return;
    }
    if (g === grupper.length) return;
    prov(g + 1, valgt, kost, score);
    for (const o of kand.filter((o) => o.gruppe === grupper[g])) prov(g + 1, valgt + 1, kost + o.kostnad, score + o.justert);
  };
  prov(0, 0, 0, 0);
  return best;
}
