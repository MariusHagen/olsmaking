// Utvalget, testet mot data hentet 12.11.2026 og mot et lite datasett der alle kombinasjoner kan prøves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { velg, bytter, kandidater, justertScore, fraVarenumre, NETT } from "../site/utvalg.mjs";

const data = JSON.parse(readFileSync(new URL("./fixtures/juleol-2026-11-12.json", import.meta.url), "utf-8"));
const TORG = "Trondheim, Trondheim Torg";
const pris = (r) => [...r.rekke, ...(r.alkoholfrie ?? [])].reduce((s, o) => s + o.flasker * o.pris, 0);

test("rekka holder budsjettet, eller sier at det ikke går opp", () => {
  let gikkOpp = 0, gikkIkke = 0;
  for (let personer = 2; personer <= 14; personer++) {
    for (const budsjett of [400, 800, 1500, 2500, 5000]) {
      const r = velg(data, { butikk: TORG, personer, budsjett, antall: 8, alkoholfrie: personer % 3 });
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

test("antall alkoholfrie: så mange som ønsket, aldri flere enn det finnes, og innenfor budsjettet", () => {
  const af = kandidater(data, { butikk: TORG, personer: 5 }).filter((o) => o.gruppe === "Alkoholfritt").sort((a, b) => b.justert - a.justert);
  const finnes = af.length;
  assert.ok(finnes >= 2, `bare ${finnes} alkoholfrie i fixturen`);
  for (const onsket of [0, 1, 2, 4]) {
    const r = velg(data, { butikk: TORG, personer: 5, budsjett: 1800, antall: 8, alkoholfrie: onsket });
    assert.equal(r.alkoholfrie.length, Math.min(onsket, finnes), `${onsket} ønsket`);
    if (onsket > 0) assert.equal(r.alkoholfrie[0].id, af[0].id, "det beste alkoholfrie først");
    assert.ok(r.alkoholfrie.every((o) => o.gruppe === "Alkoholfritt"));
    assert.equal(new Set(r.alkoholfrie.map((o) => o.id)).size, r.alkoholfrie.length);
    assert.ok(pris(r) <= 1800);
  }
  // Gamle lenker med alkoholfritt: true gir ett.
  assert.equal(velg(data, { butikk: TORG, personer: 5, budsjett: 1800, antall: 8, alkoholfritt: true }).alkoholfrie.length, 1);
});

test("med trangt budsjett velges et billigere alkoholfritt heller enn at rekka ikke går opp", () => {
  // 650 kr: det beste alkoholfrie (61 kr) og den billigste rekka (597 kr) går ikke opp, men det billigste (51 kr) gjør.
  const r = velg(data, { butikk: TORG, personer: 5, budsjett: 650, antall: 8, alkoholfrie: 1 });
  assert.equal(r.feil, null);
  assert.equal(r.rekke.length, 8);
  assert.equal(r.alkoholfrie.length, 1);
  assert.ok(pris(r) <= 650);
  // Går det ikke opp i det hele tatt, regner meldingen med de alkoholfrie som ble ønsket.
  const ikke = velg(data, { butikk: TORG, personer: 5, budsjett: 500, antall: 8, alkoholfrie: 1 });
  assert.match(ikke.feil, /Budsjettet holder ikke/);
  assert.ok(ikke.minstBudsjett > 597);
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
  const valg = { butikk: TORG, personer: 5, budsjett: 1500, antall: 8, alkoholfrie: 2 };
  const r = velg(data, valg);
  for (let plass = 0; plass < r.rekke.length; plass++) {
    for (const alt of bytter(data, valg, r.rekke, r.alkoholfrie, plass)) {
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

// Prøver alle sett der de låste er med, med n øl i alt og høyst «maks» per type.
function alleMedLaste(kand, laste, n, maks, budsjett) {
  const perType = {};
  for (const o of laste) perType[o.gruppe] = (perType[o.gruppe] ?? 0) + 1;
  const kost = laste.reduce((s, o) => s + o.kostnad, 0);
  const score = laste.reduce((s, o) => s + o.justert, 0);
  const ledig = alleKombinasjonerFra(kand, n - laste.length, maks, budsjett - kost, perType);
  return ledig === null ? null : score + ledig;
}

function alleKombinasjonerFra(kand, n, maks, budsjett, start) {
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
  prov(0, 0, start, 0, 0);
  return best;
}

const perType = (rekke) => rekke.reduce((t, o) => ({ ...t, [o.gruppe]: (t[o.gruppe] ?? 0) + 1 }), {});

test("låste øl er med når antall personer, budsjett og antall endres, innenfor budsjettet og grensen per type", () => {
  const forst = velg(data, { butikk: TORG, personer: 5, budsjett: 1500, antall: 8 });
  const laste = [forst.rekke[0], forst.rekke[3], forst.rekke[5]];
  let gikkOpp = 0;
  for (const personer of [3, 5, 8, 12]) {
    for (const budsjett of [1200, 1500, 2500, 5000]) {
      for (const antall of [4, 6, 8, 10]) {
        const r = velg(data, { butikk: TORG, personer, budsjett, antall, laste });
        const navn = `${personer} personer, ${budsjett} kr, ${antall} øl`;
        if (r.feil) continue;
        gikkOpp++;
        assert.equal(r.rekke.length, antall, navn);
        for (const l of laste) assert.ok(r.rekke.some((o) => o.id === l.id), `${navn}: ${l.navn} mangler`);
        assert.equal(new Set(r.rekke.map((o) => o.id)).size, antall, `${navn}: samme øl to ganger`);
        assert.ok(pris(r) <= budsjett, `${navn}: rekka koster ${pris(r)}`);
        for (const [g, n] of Object.entries(perType(r.rekke))) assert.ok(n <= r.maksPerType, `${navn}: ${n} av ${g}`);
        const laast = r.rekke.find((o) => o.id === laste[0].id);
        assert.equal(laast.flasker, Math.max(1, Math.ceil((personer * (laast.alkohol >= 10 ? 5 : 7)) / laast.cl - 1e-9)));
      }
    }
  }
  assert.ok(gikkOpp > 30, `gikk opp ${gikkOpp}`);
});

test("med låste øl er valget fortsatt det beste settet, også med flere låste av én type enn grensen", () => {
  let frø = 11;
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
    { typer: data.rekkefolge.slice(0, 6), antall: 4, laste: ["0"], maks: 1 },
    { typer: data.rekkefolge.slice(0, 6), antall: 4, laste: ["0", "1"], maks: 2 },
    { typer: data.rekkefolge.slice(0, 2), antall: 5, laste: ["7", "8"], maks: 3 },
    { typer: data.rekkefolge.slice(1, 3), antall: 4, laste: ["0"], maks: 2 },
  ];
  for (const t of tilfeller) {
    for (const budsjett of [400, 600, 900, 1500]) {
      const valg = { butikk: "A", personer: 4, budsjett, antall: t.antall, typer: t.typer };
      const laste = kandidater(syn, valg).filter((o) => t.laste.includes(o.id));
      const r = velg(syn, { ...valg, laste });
      const kand = kandidater(syn, valg).filter((o) => t.typer.includes(o.gruppe) && !t.laste.includes(o.id));
      const best = alleMedLaste(kand, laste, t.antall, t.maks, budsjett);
      const navn = `låst ${t.laste}, ${t.typer.length} typer, ${t.antall} øl, ${budsjett} kr`;
      if (best === null) {
        assert.ok(r.feil, `${navn}: ingen kombinasjon går, men utvalget fant en`);
        continue;
      }
      assert.equal(r.maksPerType, t.maks, navn);
      for (const l of t.laste) assert.ok(r.rekke.some((o) => o.id === l), `${navn}: ${l} mangler`);
      assert.ok(Math.abs(r.rekke.reduce((s, o) => s + o.justert, 0) - best) < 1e-9, navn);
    }
  }
});

test("et låst øl uten lager eller som mangler i dataene blir stående og merkes", () => {
  const forst = velg(data, { butikk: TORG, personer: 5, budsjett: 1500, antall: 8 });
  const borte = { ...forst.rekke[2], id: "finnes-ikke", lager: {} };
  const tomt = { ...data, ol: data.ol.map((o) => (o.id === forst.rekke[4].id ? { ...o, lager: {} } : o)) };
  const r = velg(tomt, { butikk: TORG, personer: 5, budsjett: 1500, antall: 8, laste: [borte, forst.rekke[4]] });
  assert.equal(r.feil, null);
  const b = r.rekke.find((o) => o.id === "finnes-ikke");
  assert.ok(b?.mangler, "øl som mangler i dataene");
  assert.ok(r.rekke.find((o) => o.id === forst.rekke[4].id)?.utsolgt, "øl uten lager");
  assert.ok(pris(r) <= 1500);
});

test("alle plassene låst gir de låste, og låste alkoholfrie er med blant de alkoholfrie", () => {
  const forst = velg(data, { butikk: TORG, personer: 5, budsjett: 1500, antall: 4, alkoholfrie: 2 });
  const laste = [...forst.rekke, forst.alkoholfrie[1]];
  const r = velg(data, { butikk: TORG, personer: 6, budsjett: 1500, antall: 4, alkoholfrie: 2, laste });
  assert.deepEqual(r.rekke.map((o) => o.id), forst.rekke.map((o) => o.id));
  assert.ok(r.alkoholfrie.some((o) => o.id === forst.alkoholfrie[1].id));
  assert.equal(r.alkoholfrie.length, 2);
});

test("for mange eller for dyre låste øl gir en feilmelding", () => {
  const forst = velg(data, { butikk: TORG, personer: 5, budsjett: 1500, antall: 8, alkoholfrie: 2 });
  const mange = velg(data, { butikk: TORG, personer: 5, budsjett: 1500, antall: 6, laste: forst.rekke });
  assert.match(mange.feil, /låst 8 øl, men valgt 6/);
  const af = velg(data, { butikk: TORG, personer: 5, budsjett: 1500, antall: 8, alkoholfrie: 1, laste: forst.alkoholfrie });
  assert.match(af.feil, /låst 2 alkoholfrie, men valgt 1/);
  const dyrt = velg(data, { butikk: TORG, personer: 5, budsjett: 300, antall: 8, laste: forst.rekke.slice(0, 4) });
  assert.match(dyrt.feil, /koster \d+ kr, mer enn budsjettet/);
});
