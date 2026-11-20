// Utvalget, testet mot data hentet 12.11.2026 og mot et lite datasett der alle kombinasjoner kan prøves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { velg, bytter, kandidater, justertScore, fraVarenumre, flasker, NETT } from "../site/utvalg.mjs";

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

test("flaskene gir det siden viser som ca. 7 cl, eller ca. 5 cl av sterke øl, og ikke en flaske mer", () => {
  assert.equal(flasker({ alkohol: 12, cl: 33 }, 7), 1, "4,7 cl er ca. 5 cl");
  assert.equal(flasker({ alkohol: 19, cl: 33 }, 8), 2, "4,1 cl er for lite");
  assert.equal(flasker({ alkohol: 5, cl: 33 }, 5), 1, "6,6 cl er ca. 7 cl");
  assert.equal(flasker({ alkohol: 5, cl: 44 }, 7), 2, "6,3 cl er for lite");
  // Det samme som siden viser i «ca. … cl hver».
  const vist = (f, o, personer) => Math.round((f * o.cl) / personer + 1e-9);
  for (const o of data.ol) {
    const maal = o.alkohol >= 10 ? 5 : 7;
    for (let personer = 2; personer <= 14; personer++) {
      const f = flasker(o, personer);
      assert.ok(vist(f, o, personer) >= maal, `${o.navn}, ${personer} personer: ${f} flasker gir for lite`);
      assert.ok(f === 1 || vist(f - 1, o, personer) < maal, `${o.navn}, ${personer} personer: ${f} flasker er én for mye`);
    }
  }
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
  // Seks personer og 650 kr: det beste alkoholfrie (61 kr) og den billigste rekka (597 kr) går ikke opp, men det billigste (51 kr) gjør.
  const r = velg(data, { butikk: TORG, personer: 6, budsjett: 650, antall: 8, alkoholfrie: 1 });
  assert.equal(r.feil, null);
  assert.equal(r.rekke.length, 8);
  assert.equal(r.alkoholfrie.length, 1);
  assert.ok(pris(r) <= 650);
  // Går det ikke opp i det hele tatt, regner meldingen med de alkoholfrie som ble ønsket.
  const ikke = velg(data, { butikk: TORG, personer: 6, budsjett: 500, antall: 8, alkoholfrie: 1 });
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
  for (const g of typer) {
    assert.deepEqual(r.grenser[g], { minst: 4, hoyst: 4 }, g);
    assert.equal(r.rekke.filter((o) => o.gruppe === g).length, 4, g);
  }
  assert.equal(new Set(r.rekke.map((o) => o.id)).size, 8, "ingen øl to ganger");
});

const NI = data.rekkefolge.filter((g) => !["Lys og frisk", "Gårdsøl og saison"].includes(g));

test("ni typer og ti øl gir alle ni typene, ikke to av fem", () => {
  const r = velg(data, { butikk: TORG, personer: 7, budsjett: 2500, antall: 10, typer: NI });
  assert.equal(r.feil, null);
  assert.deepEqual(Object.keys(perType(r.rekke)).sort(), [...NI].sort());
  assert.ok(Object.values(perType(r.rekke)).every((n) => n <= 2));
  assert.deepEqual(r.utelatt, []);
});

test("med nok budsjett fordeles ølene jevnt, og en type med fast antall får akkurat det", () => {
  let sjekket = 0;
  for (const typer of [NI, data.rekkefolge.slice(0, 6), data.rekkefolge.slice(-4), data.rekkefolge.slice(2, 5)]) {
    for (const antall of [4, 6, 8, 10]) {
      for (const fast of [{}, { [typer[1]]: 2 }]) {
        const valg = { butikk: TORG, personer: 5, budsjett: 20000, antall, typer, perType: fast };
        const r = velg(data, valg);
        if (r.feil) continue;
        const har = perType(kandidater(data, valg));
        const auto = typer.filter((g) => !(g in fast));
        const plasser = antall - (fast[typer[1]] ?? 0);
        const lav = Math.floor(plasser / auto.length), hoy = Math.ceil(plasser / auto.length);
        // Bare når alle Auto-typene har øl nok, kan fordelingen sjekkes uten å regne ut overløpet.
        if (!auto.every((g) => (har[g] ?? 0) >= hoy)) continue;
        sjekket++;
        const telling = perType(r.rekke);
        for (const g of auto) assert.ok((telling[g] ?? 0) >= lav && (telling[g] ?? 0) <= hoy, `${typer.length} typer, ${antall} øl: ${telling[g] ?? 0} av ${g}`);
        if (typer[1] in fast) assert.equal(telling[typer[1]], 2);
      }
    }
  }
  assert.ok(sjekket > 20, `sjekket ${sjekket}`);
});

test("fast antall per type: to IPA og én mjød, og resten fordelt", () => {
  const r = velg(data, { butikk: TORG, personer: 7, budsjett: 2500, antall: 10, typer: NI, perType: { "Humle og IPA": 2, "Mjød": 1 } });
  assert.equal(r.feil, null);
  const telling = perType(r.rekke);
  assert.equal(telling["Humle og IPA"], 2);
  assert.equal(telling["Mjød"], 1);
  for (const g of NI.filter((t) => !["Humle og IPA", "Mjød"].includes(t))) assert.equal(telling[g], 1, g);
});

test("faste antall som ikke går opp, gir en feilmelding som sier hva som må endres", () => {
  const v = { butikk: TORG, personer: 7, budsjett: 9000, antall: 10, typer: NI };
  assert.match(velg(data, { ...v, perType: { "Humle og IPA": 6, "Mjød": 5 } }).feil, /Du har valgt 11 øl fordelt på typene, men 10 i alt/);
  assert.match(velg(data, { ...v, antall: 8, typer: ["Humle og IPA", "Mjød"], perType: { "Humle og IPA": 3, "Mjød": 3 } }).feil,
    /Typene gir 6 øl, men du har valgt 8/);
  const mjod = kandidater(data, v).filter((o) => o.gruppe === "Mjød").length;
  assert.ok(mjod < 10);
  assert.equal(velg(data, { ...v, typer: ["Mjød", "Porter og stout"], perType: { "Mjød": 10 } }).feil,
    `Bare ${mjod} Mjød passer her. Velg færre av Mjød.`);
});

test("holder ikke budsjettet til alle typene, faller noen ut, og velg sier hvilke", () => {
  const r = velg(data, { butikk: TORG, personer: 10, budsjett: 1000, antall: 10, typer: NI });
  assert.equal(r.feil, null);
  assert.equal(r.rekke.length, 10);
  assert.ok(pris(r) <= 1000);
  assert.ok(r.utelatt.length > 0);
  const telling = perType(r.rekke);
  assert.deepEqual(r.utelatt, NI.filter((g) => !telling[g]));
  // Et fast antall slippes ikke: typen kommer med, og andre faller ut i stedet.
  const g = r.utelatt[0];
  const fast = velg(data, { butikk: TORG, personer: 10, budsjett: 1000, antall: 10, typer: NI, perType: { [g]: 1 } });
  assert.equal(fast.feil, null);
  assert.equal(perType(fast.rekke)[g], 1);
  assert.ok(fast.utelatt.length > 0 && !fast.utelatt.includes(g));
});

test("låste øl teller i sin type, også når de er flere enn antallet", () => {
  const v = { butikk: TORG, personer: 7, budsjett: 5000, antall: 10, typer: NI, perType: { "Mjød": 1 } };
  const laste = kandidater(data, v).filter((o) => o.gruppe === "Mjød").slice(0, 2);
  const r = velg(data, { ...v, laste });
  assert.equal(r.feil, null);
  assert.equal(perType(r.rekke)["Mjød"], 2);
  assert.deepEqual(r.grenser["Mjød"], { minst: 2, hoyst: 2 });
  for (const l of laste) assert.ok(r.rekke.some((o) => o.id === l.id));
});

test("låste øl i en annen type tar plasser, så de faste antallene må få plass ved siden av dem", () => {
  const [A, B, C] = ["Humle og IPA", "Porter og stout", "Mjød"];
  const v = { butikk: TORG, personer: 5, budsjett: 5000, typer: [A, B, C], perType: { [A]: 2 } };
  const stout = kandidater(data, v).filter((o) => o.gruppe === B);
  for (const [antall, n] of [[2, 2], [4, 3]]) {
    const r = velg(data, { ...v, antall, laste: stout.slice(0, n) });
    assert.equal(r.feil, `Antallene du har valgt og de låste ølene gir ${2 + n} øl, men du har valgt ${antall}. Velg flere øl, færre av en type, eller lås opp noen.`);
  }
  // Med plass til begge: to IPA, de tre låste stoutene og resten til mjøden.
  const r = velg(data, { ...v, antall: 6, laste: stout.slice(0, 3) });
  assert.equal(r.feil, null);
  assert.deepEqual(perType(r.rekke), { [A]: 2, [B]: 3, [C]: 1 });
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
  const [a, b, c] = data.rekkefolge;
  // Grensene [minst, høyst] per type, regnet for hånd: plassene delt på Auto-typene, rundet ned og opp.
  const tilfeller = [
    { typer: data.rekkefolge.slice(0, 6), antall: 4, grenser: alleLike(data.rekkefolge.slice(0, 6), [0, 1]) },
    { typer: data.rekkefolge.slice(0, 4), antall: 6, grenser: alleLike(data.rekkefolge.slice(0, 4), [1, 2]) },
    { typer: data.rekkefolge.slice(0, 2), antall: 5, grenser: alleLike([a, b], [2, 3]) },
    { typer: data.rekkefolge.slice(0, 1), antall: 4, grenser: alleLike([a], [4, 4]) },
    { typer: [a, b, c], antall: 5, perType: { [a]: 1 }, grenser: { [a]: [1, 1], [b]: [2, 2], [c]: [2, 2] } },
    { typer: [a, b, c], antall: 6, perType: { [a]: 3, [c]: 1 }, grenser: { [a]: [3, 3], [b]: [2, 2], [c]: [1, 1] } },
  ];
  for (const { typer, antall, perType: fast = {}, grenser } of tilfeller) {
    for (const budsjett of [250, 400, 600, 900, 1500]) {
      const valg = { butikk: "A", personer: 4, budsjett, antall, typer, perType: fast };
      const r = velg(syn, valg);
      const kand = kandidater(syn, valg).filter((o) => typer.includes(o.gruppe));
      const navn = `${typer.length} typer, ${antall} øl, ${JSON.stringify(fast)}, ${budsjett} kr`;
      // Går ikke de nedre grensene for Auto-typene opp, gjelder det beste settet uten dem.
      const jevn = alleKombinasjoner(kand, antall, grenser, budsjett);
      const best = jevn ?? alleKombinasjoner(kand, antall, utenNedre(grenser, fast), budsjett);
      if (best === null) {
        assert.ok(r.feil, `${navn}: ingen kombinasjon går, men utvalget fant en`);
        assert.equal(r.minstBudsjett, billigsteKombinasjon(kand, antall, utenNedre(grenser, fast)), `${navn}: minste budsjett`);
        continue;
      }
      assert.ok(Math.abs(r.rekke.reduce((s, o) => s + o.justert, 0) - best) < 1e-9, navn);
      const brukt = jevn === null ? utenNedre(grenser, fast) : grenser;
      assert.deepEqual(r.grenser, Object.fromEntries(Object.entries(brukt).map(([t, [minst, hoyst]]) => [t, { minst, hoyst }])), navn);
      const telling = perType(r.rekke);
      assert.deepEqual(r.utelatt, jevn === null ? typer.filter((t) => grenser[t][0] > 0 && !telling[t]) : [], navn);
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
  assert.deepEqual(r.grenser, { [liten]: { minst: 1, hoyst: 4 }, [stor]: { minst: 2, hoyst: 4 } });
  assert.equal(r.rekke.length, 5);
  assert.equal(r.rekke.filter((o) => o.gruppe === stor).length, 4);
  const best = alleKombinasjoner(kandidater(syn, valg), 5, { [liten]: [1, 4], [stor]: [2, 4] }, 2000);
  assert.ok(Math.abs(r.rekke.reduce((s, o) => s + o.justert, 0) - best) < 1e-9);
});

const alleLike = (typer, grense) => Object.fromEntries(typer.map((t) => [t, grense]));
// Grensene uten den nedre for Auto-typene, som når budsjettet ikke holder til dem.
const utenNedre = (grenser, fast) => Object.fromEntries(Object.entries(grenser).map(([t, [minst, hoyst]]) => [t, [t in fast ? minst : 0, hoyst]]));

// Prøver alle sett med n øl i alt der de låste er med og antallet av hver type er innenfor grensene
// [minst, høyst]. Gir den høyeste samlede scoren, eller den laveste prisen med «billigst».
function alleKombinasjoner(kand, n, grenser, budsjett, laste = [], billigst = false) {
  let best = null;
  const prov = (i, valgt, telling, kost, score) => {
    if (kost > budsjett) return;
    if (valgt === n) {
      if (!Object.entries(grenser).every(([t, [minst]]) => (telling[t] ?? 0) >= minst)) return;
      const verdi = billigst ? kost : score;
      if (best === null || (billigst ? verdi < best : verdi > best)) best = verdi;
      return;
    }
    if (i === kand.length) return;
    prov(i + 1, valgt, telling, kost, score);
    const o = kand[i];
    if ((telling[o.gruppe] ?? 0) < (grenser[o.gruppe]?.[1] ?? 0)) {
      prov(i + 1, valgt + 1, { ...telling, [o.gruppe]: (telling[o.gruppe] ?? 0) + 1 }, kost + o.kostnad, score + o.justert);
    }
  };
  prov(0, laste.length, perType(laste), laste.reduce((s, o) => s + o.kostnad, 0), laste.reduce((s, o) => s + o.justert, 0));
  return best;
}

const billigsteKombinasjon = (kand, n, grenser) => alleKombinasjoner(kand, n, grenser, Infinity, [], true);

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
        const telling = perType(r.rekke);
        for (const [g, { minst, hoyst }] of Object.entries(r.grenser)) {
          assert.ok((telling[g] ?? 0) >= minst && (telling[g] ?? 0) <= hoyst, `${navn}: ${telling[g] ?? 0} av ${g}, grensene ${minst} og ${hoyst}`);
        }
        const laast = r.rekke.find((o) => o.id === laste[0].id);
        assert.equal(laast.flasker, flasker(laast, personer));
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
  const [a, b, c] = data.rekkefolge;
  const seks = data.rekkefolge.slice(0, 6);
  const tilfeller = [
    // Øl 0 og 1 er av den første typen, 7 og 8 av den andre. Låste over typens del blir stående.
    { typer: seks, antall: 4, laste: ["0"], grenser: { ...alleLike(seks, [0, 1]), [a]: [1, 1] } },
    { typer: seks, antall: 4, laste: ["0", "1"], grenser: { ...alleLike(seks, [0, 1]), [a]: [2, 2] } },
    { typer: [a, b], antall: 5, laste: ["7", "8"], grenser: alleLike([a, b], [2, 3]) },
    { typer: [b, c], antall: 4, laste: ["0"], grenser: alleLike([b, c], [1, 2]) },
  ];
  for (const t of tilfeller) {
    for (const budsjett of [400, 600, 900, 1500]) {
      const valg = { butikk: "A", personer: 4, budsjett, antall: t.antall, typer: t.typer };
      const laste = kandidater(syn, valg).filter((o) => t.laste.includes(o.id));
      const r = velg(syn, { ...valg, laste });
      const kand = kandidater(syn, valg).filter((o) => t.typer.includes(o.gruppe) && !t.laste.includes(o.id));
      const jevn = alleKombinasjoner(kand, t.antall, t.grenser, budsjett, laste);
      const best = jevn ?? alleKombinasjoner(kand, t.antall, utenNedre(t.grenser, {}), budsjett, laste);
      const navn = `låst ${t.laste}, ${t.typer.length} typer, ${t.antall} øl, ${budsjett} kr`;
      if (best === null) {
        assert.ok(r.feil, `${navn}: ingen kombinasjon går, men utvalget fant en`);
        continue;
      }
      const brukt = jevn === null ? utenNedre(t.grenser, {}) : t.grenser;
      assert.deepEqual(r.grenser, Object.fromEntries(Object.entries(brukt).map(([g, [minst, hoyst]]) => [g, { minst, hoyst }])), navn);
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

test("med alle plassene låst velges alkoholfrie som passer, og rekka holder budsjettet", () => {
  const [lys] = data.rekkefolge;
  const ol = (id, gruppe, pris, score) => ({ id, navn: id, gruppe, stil: "", score, innsjekker: 500, alkohol: gruppe === "Alkoholfritt" ? 0 : 5,
    cl: 50, pris, nett: true, lager: { 0: 99 } });
  const syn = { butikker: ["A"], rekkefolge: data.rekkefolge, ol: [ol("lys", lys, 30, 4), ol("A", "Alkoholfritt", 45, 4), ol("B", "Alkoholfritt", 20, 3), ol("C", "Alkoholfritt", 20, 3)] };
  const valg = { butikk: "A", personer: 2, antall: 1, alkoholfrie: 2, typer: [lys] };
  const laste = [syn.ol[0]];
  // De to beste som passer, er ikke A og en til, men B og C.
  const r = velg(syn, { ...valg, budsjett: 80, laste });
  assert.equal(r.feil, null);
  assert.deepEqual(r.alkoholfrie.map((o) => o.id).sort(), ["B", "C"]);
  // Er det bare plass til de låste, blir det ingen alkoholfrie, og aldri over budsjettet.
  for (const budsjett of [30, 40, 55, 70, 100]) {
    const b = velg(syn, { ...valg, budsjett, laste });
    if (!b.feil) assert.ok(pris(b) <= budsjett, `${budsjett} kr: rekka koster ${pris(b)}`);
  }
});
