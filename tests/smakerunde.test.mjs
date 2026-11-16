// API-et for smakerunden, testet med minnelageret og en klokke testene styrer. Ingen kall mot Upstash.
import { test } from "node:test";
import assert from "node:assert/strict";
import { handle, nullstillBrems, MAKS, LEVETID } from "../api/_lib/smakerunde.mjs";
import { minnelager, PREFIKS } from "../api/_lib/lager.mjs";

const OL = Array.from({ length: 10 }, (_, i) => ({
  navn: `Juleøl nummer ${i + 1}`, gruppe: "Bokk", stil: "Bock - Doppelbock", score: 3 + i / 10, alkohol: 8, cl: 33,
  pris: 59.9, id: String(1000 + i), polet: `https://www.vinmonopolet.no/p/${1000 + i}`,
}));

function oppsett({ env = {}, start = Date.UTC(2026, 11, 13, 18) } = {}) {
  nullstillBrems();
  let na = start;
  const klokke = () => na;
  const lager = minnelager(klokke);
  const kall = async (metode, sti, body, hoder = {}) => {
    const r = await handle(new Request(`http://localhost:8787/api/runde${sti}`, {
      method: metode, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { "content-type": "application/json", origin: "http://localhost:8000", ...hoder },
    }), { env, lager, klokke });
    return { status: r.status, body: r.status === 204 ? null : await r.json(), hoder: r.headers };
  };
  return { kall, lager, tid: (ms) => (na += ms) };
}

async function rundeMedDeltakere(o, { blind = false, antall = 2 } = {}) {
  const ny = await o.kall("POST", "", { ol: OL, blind });
  assert.equal(ny.status, 201);
  const deltakere = [];
  for (let i = 0; i < antall; i++) deltakere.push((await o.kall("POST", `/${ny.body.kode}/deltaker`, { kallenavn: `Person ${i + 1}` })).body);
  return { ...ny.body, deltakere };
}
const rate = (o, kode, d, plass, stjerner, kommentar = "") =>
  o.kall("PUT", `/${kode}/karakter`, { deltakerId: d.deltakerId, deltakerNokkel: d.deltakerNokkel, plass, stjerner, kommentar });
const neste = (o, kode, vertNokkel, plass) => o.kall("POST", `/${kode}/neste`, { vertNokkel, plass });

test("lage runde, bli med, gi og endre karakter, se resultater og avslutte", async () => {
  const o = oppsett();
  const { kode, vertNokkel, deltakere: [a, b] } = await rundeMedDeltakere(o);
  assert.match(kode, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal((await neste(o, kode, vertNokkel, 0)).status, 200);
  assert.equal((await rate(o, kode, a, 1, 4)).status, 200);
  assert.equal((await rate(o, kode, a, 1, 4.5, "Godt")).status, 200);
  assert.equal((await rate(o, kode, b, 1, 3.5)).status, 200);
  const res = (await o.kall("GET", `/${kode}/resultater`)).body;
  assert.equal(res.ol[0].antall, 2);
  assert.equal(res.ol[0].snitt, undefined, "snittet kommer først når ølet er avslørt");
  assert.equal(res.harRatet, 2);
  assert.equal(res.deltakere, 2);
  assert.equal((await neste(o, kode, vertNokkel, 1)).status, 200);
  assert.equal((await o.kall("GET", `/${kode}/resultater`)).body.ol[0].snitt, 4);

  assert.equal((await o.kall("POST", `/${kode}/avslutt`, { vertNokkel: "feil" })).status, 403);
  const slutt = await o.kall("POST", `/${kode}/avslutt`, { vertNokkel });
  assert.equal(slutt.status, 200);
  assert.equal(slutt.body.avsluttet, true);
  assert.equal((await rate(o, kode, a, 2, 3)).status, 409, "karakterer avvises etter avslutningen");
  assert.equal((await o.kall("POST", `/${kode}/deltaker`, { kallenavn: "Sen" })).status, 409);
  const etter = (await o.kall("GET", `/${kode}/resultater`)).body;
  assert.equal(etter.sammendrag.favoritt.plass, 1);
  assert.deepEqual(etter.ol[0].karakterer.map((k) => k.kallenavn).sort(), ["Person 1", "Person 2"]);
  assert.equal(etter.ol[0].karakterer.find((k) => k.kallenavn === "Person 1").kommentar, "Godt");
});

test("en deltaker kan bare endre sine egne karakterer", async () => {
  const o = oppsett();
  const { kode, deltakere: [a, b] } = await rundeMedDeltakere(o);
  const r = await o.kall("PUT", `/${kode}/karakter`, { deltakerId: a.deltakerId, deltakerNokkel: b.deltakerNokkel, plass: 1, stjerner: 1 });
  assert.equal(r.status, 403);
  assert.equal((await o.kall("PUT", `/${kode}/karakter`, { deltakerId: "finnesikke", deltakerNokkel: "x", plass: 1, stjerner: 1 })).status, 403);
});

test("grensene", async () => {
  const o = oppsett();
  assert.equal((await o.kall("POST", "", { ol: [] })).status, 400);
  assert.equal((await o.kall("POST", "", { ol: [...OL, ...OL] })).status, 400);
  assert.equal((await o.kall("POST", "", "ikke et objekt")).status, 400);
  const { kode, deltakere: [a] } = await rundeMedDeltakere(o, { antall: 1 });
  for (const feil of [0.5, 5.5, 3.3, "fire", null]) assert.equal((await rate(o, kode, a, 1, feil)).status, 400, `stjerner ${feil}`);
  assert.equal((await rate(o, kode, a, 11, 3)).status, 400, "plass utenfor rekka");
  assert.equal((await o.kall("POST", `/${kode}/deltaker`, { kallenavn: "   " })).status, 400);
  const lang = await o.kall("POST", `/${kode}/deltaker`, { kallenavn: "x".repeat(40) });
  assert.equal(lang.body.kallenavn.length, MAKS.kallenavn);
  await rate(o, kode, a, 2, 3, "k".repeat(200));
  for (let i = 0; i < MAKS.deltakere - 2; i++) await o.kall("POST", `/${kode}/deltaker`, { kallenavn: `P${i}` });
  assert.equal((await o.kall("POST", `/${kode}/deltaker`, { kallenavn: "En for mye" })).status, 409);

  const o2 = oppsett();
  for (let i = 0; i < MAKS.nyePerTime; i++) assert.equal((await o2.kall("POST", "", { ol: OL })).status, 201);
  assert.equal((await o2.kall("POST", "", { ol: OL })).status, 429, "for mange nye runder i timen");
  o2.tid(3600 * 1000);
  assert.equal((await o2.kall("POST", "", { ol: OL })).status, 201, "ny time, nye runder");
});

test("kommentarer kuttes ved 140 tegn", async () => {
  const o = oppsett();
  const { kode, vertNokkel, deltakere: [a] } = await rundeMedDeltakere(o, { antall: 1 });
  await neste(o, kode, vertNokkel, 0);
  await rate(o, kode, a, 1, 3, "k".repeat(200));
  await o.kall("POST", `/${kode}/avslutt`, { vertNokkel });
  const res = (await o.kall("GET", `/${kode}/resultater`)).body;
  assert.equal(res.ol[0].karakterer[0].kommentar.length, MAKS.kommentar);
});

test("alle nøkler har prefikset og levetid, og lageret avviser nøkler uten prefiks", async () => {
  const o = oppsett();
  const { kode, vertNokkel, deltakere: [a] } = await rundeMedDeltakere(o);
  await neste(o, kode, vertNokkel, 0);
  await rate(o, kode, a, 1, 4);
  await o.kall("POST", `/${kode}/avslutt`, { vertNokkel });
  const nokler = o.lager.nokler();
  assert.ok(nokler.length >= 5);
  for (const k of nokler) {
    assert.ok(k.startsWith(PREFIKS), k);
    const ttl = o.lager.ttl(k);
    assert.ok(ttl > 0 && ttl <= LEVETID, `${k} har levetid ${ttl}`);
  }
  await assert.rejects(o.lager.kjor([["GET", "round:ABC"]]), /prefiks/);
  // Levetiden regnes fra siste endring.
  o.tid(6 * 24 * 3600 * 1000);
  assert.equal((await o.kall("GET", `/${kode}`)).status, 200);
  o.tid(2 * 24 * 3600 * 1000);
  assert.equal((await o.kall("GET", `/${kode}`)).status, 404, "slettet etter sju dager uten endring");
});

// Det som kan stå på et øl uten vertnøkkelen: et øl som ikke er åpnet, har bare plassen, og ølet som smakes,
// har i en blind runde bare plassen og antall. Ingen ser snitt eller karakterer før ølet er avslørt.
const TOPP = new Set(["kode", "blind", "avsluttet", "opprettet", "startet", "na", "avslort", "ol", "harRatet", "deltakere", "ok"]);
const OM_OLET = ["navn", "gruppe", "stil", "score", "alkohol", "cl", "pris", "id", "polet"];
function sjekkFelt(s, { blind, na, hvor }) {
  for (const k of Object.keys(s)) assert.ok(TOPP.has(k), `${hvor}: ulovlig felt ${k}`);
  if (!s.ol) return;
  assert.equal(s.na, na, `${hvor}: ølet som smakes`);
  const resultat = "harRatet" in s;
  const skjulte = s.ol.filter((ol) => !s.avslort.includes(ol.plass));
  for (const ol of skjulte) {
    const tillatt = new Set(["plass"]);
    if (ol.plass === na && resultat) tillatt.add("antall");
    if (ol.plass === na && !blind) for (const f of OM_OLET) tillatt.add(f);
    for (const k of Object.keys(ol)) assert.ok(tillatt.has(k), `${hvor}: ulovlig felt ${k} på øl ${ol.plass}`);
  }
  const lukket = JSON.stringify(skjulte.filter((ol) => ol.plass !== na || blind));
  for (const lekk of ["Juleøl", "Bock", "vinmonopolet", "Kari", "Smaker jul", "Litt søt"]) assert.ok(!lukket.includes(lekk), `${hvor}: ${lekk} i ${lukket}`);
}

test("uten vertnøkkelen vises bare det som er åpnet, i blind og åpen runde, i alle ruter", async () => {
  for (const blind of [true, false]) {
    const o = oppsett();
    const { kode, vertNokkel } = (await o.kall("POST", "", { ol: OL, blind })).body;
    const kari = (await o.kall("POST", `/${kode}/deltaker`, { kallenavn: "Kari" })).body;
    const sjekk = async (steg, na) => {
      const hvor = (rute) => `${blind ? "blind" : "åpen"}, ${steg}, ${rute}`;
      const ny = (await o.kall("POST", `/${kode}/deltaker`, { kallenavn: `Ny ${steg}` })).body;
      sjekkFelt((await o.kall("GET", `/${kode}`)).body, { blind, na, hvor: hvor("runden") });
      sjekkFelt(ny.runde, { blind, na, hvor: hvor("bli med") });
      sjekkFelt((await o.kall("GET", `/${kode}/resultater`)).body, { blind, na, hvor: hvor("resultatene") });
    };
    sjekkFelt(kari.runde, { blind, na: null, hvor: "før start, bli med" });
    await sjekk("før start", null);
    await neste(o, kode, vertNokkel, 0);
    const svar = await rate(o, kode, kari, 1, 4, "Smaker jul");
    sjekkFelt(svar.body, { blind, na: 1, hvor: "karakter" });
    await sjekk("øl 1", 1);
    await neste(o, kode, vertNokkel, 1);
    await rate(o, kode, kari, 2, 3, "Litt søt");
    await sjekk("øl 2", 2);
    const res = (await o.kall("GET", `/${kode}/resultater`)).body;
    assert.equal(res.ol[0].navn, "Juleøl nummer 1");
    assert.equal(res.ol[0].snitt, 4);
    assert.equal(res.ol[0].karakterer[0].kallenavn, "Kari");
    assert.equal(res.ol[1].navn, blind ? undefined : "Juleøl nummer 2", "ølet som smakes har navn bare i en åpen runde");
    for (let p = 2; p <= OL.length; p++) await neste(o, kode, vertNokkel, p);
    await sjekk("etter siste øl", null);
    // Verten får alt med nøkkelen, og etter avslutningen får alle navnene.
    const vert = (await o.kall("GET", `/${kode}`, undefined, { "x-vertnokkel": vertNokkel })).body;
    assert.equal(vert.ol[1].navn, "Juleøl nummer 2");
    await o.kall("POST", `/${kode}/avslutt`, { vertNokkel });
    assert.equal((await o.kall("GET", `/${kode}/resultater`)).body.ol[1].karakterer[0].kommentar, "Litt søt");
  }
  // Uten riktig vertnøkkel er et øl som ikke er åpnet, skjult også for den som prøver en falsk nøkkel.
  const o = oppsett();
  const { kode } = (await o.kall("POST", "", { ol: OL })).body;
  assert.deepEqual((await o.kall("GET", `/${kode}`, undefined, { "x-vertnokkel": "feil" })).body.ol[1], { plass: 2 });
});

test("bare verten går videre, ett øl om gangen, og avslutningen avslører resten", async () => {
  const o = oppsett();
  const { kode, vertNokkel, deltakere: [a] } = await rundeMedDeltakere(o, { blind: true, antall: 1 });
  const forStart = await rate(o, kode, a, 1, 4);
  assert.equal(forStart.status, 409);
  assert.match(forStart.body.feil, /ikke åpnet første øl/);
  assert.equal((await neste(o, kode, "feil", 0)).status, 403);
  assert.equal((await o.kall("POST", `/${kode}/neste`, { plass: 0 })).status, 403);
  for (const plass of [-1, 11, 1.5, "en", "1", null, false, undefined]) assert.equal((await neste(o, kode, vertNokkel, plass)).status, 400, `plass ${plass}`);
  assert.equal((await neste(o, kode, vertNokkel, 1)).status, 409, "runden er ikke startet");
  const start = await neste(o, kode, vertNokkel, 0);
  assert.deepEqual([start.status, start.body.startet, start.body.na], [200, true, 1]);
  assert.deepEqual((await neste(o, kode, vertNokkel, 0)).body.na, 1, "0 i en startet runde endrer ingenting");
  const forTidlig = await rate(o, kode, a, 2, 3);
  assert.equal(forTidlig.status, 409);
  assert.match(forTidlig.body.feil, /Øl 2 er ikke åpnet/);
  assert.equal((await rate(o, kode, a, 1, 4)).status, 200);
  assert.equal((await neste(o, kode, vertNokkel, 3)).status, 409, "et øl som ikke er åpnet");
  const r = await neste(o, kode, vertNokkel, 1);
  assert.deepEqual([r.body.avslort, r.body.na], [[1], 2]);
  const igjen = await neste(o, kode, vertNokkel, 1);
  assert.deepEqual([igjen.status, igjen.body.avslort, igjen.body.na], [200, [1], 2], "et dobbelttrykk hopper ikke over øl 2");
  const avvist = await rate(o, kode, a, 1, 2);
  assert.equal(avvist.status, 409);
  assert.match(avvist.body.feil, /Øl 1 er avslørt/);
  assert.equal((await rate(o, kode, a, 2, 2)).status, 200);
  for (let p = 2; p <= OL.length; p++) assert.equal((await neste(o, kode, vertNokkel, p)).status, 200);
  const sist = (await o.kall("GET", `/${kode}`)).body;
  assert.deepEqual([sist.avslort, sist.na, sist.avsluttet], [OL.map((_, i) => i + 1), null, false]);
  assert.equal((await neste(o, kode, vertNokkel, OL.length)).status, 200, "etter det siste ølet");
  assert.equal((await rate(o, kode, a, OL.length, 3)).status, 409);
  await o.kall("POST", `/${kode}/avslutt`, { vertNokkel });
  assert.equal((await neste(o, kode, vertNokkel, 0)).status, 409, "avsluttet runde");

  // Avsluttes runden før alle ølene er åpnet, avsløres alle.
  const tidlig = await rundeMedDeltakere(o, { blind: true, antall: 0 });
  await neste(o, tidlig.kode, tidlig.vertNokkel, 0);
  await o.kall("POST", `/${tidlig.kode}/avslutt`, { vertNokkel: tidlig.vertNokkel });
  const slutt = (await o.kall("GET", `/${tidlig.kode}`)).body;
  assert.ok(slutt.ol.every((ol) => ol.navn));
  assert.equal(slutt.na, null);
});

test("verten flytter øl som ikke er åpnet, og karakterene blir stående på samme øl", async () => {
  const o = oppsett();
  const { kode, vertNokkel, deltakere: [a] } = await rundeMedDeltakere(o, { blind: true, antall: 1 });
  const flytt = (rekkefolge, nokkel = vertNokkel) => o.kall("POST", `/${kode}/rekkefolge`, { vertNokkel: nokkel, rekkefolge });
  const vert = async () => (await o.kall("GET", `/${kode}`, undefined, { "x-vertnokkel": vertNokkel })).body.ol;
  const alle = OL.map((_, i) => i + 1);
  // Før start kan alle flyttes.
  assert.equal((await flytt([2, 1, ...alle.slice(2)])).status, 200);
  assert.deepEqual((await vert()).slice(0, 2).map((ol) => [ol.plass, ol.navn]), [[1, "Juleøl nummer 2"], [2, "Juleøl nummer 1"]]);
  await neste(o, kode, vertNokkel, 0);
  await rate(o, kode, a, 1, 4, "Først");
  await neste(o, kode, vertNokkel, 1);
  await rate(o, kode, a, 2, 2);
  // Øl 1 er avslørt og øl 2 smakes, så bare 3 til 10 kan flyttes.
  const lukket = alle.slice(2);
  assert.equal((await flytt(lukket, "feil")).status, 403);
  for (const feil of [alle, [2, ...lukket.slice(1)], [...lukket, 3], lukket.slice(1), [...lukket.slice(1), 11], [3.5, ...lukket.slice(1)], "3,4"]) {
    assert.equal((await flytt(feil)).status, 400, `rekkefølge ${feil}`);
  }
  assert.equal((await flytt([5, 3, 4, 6, 7, 8, 9, 10])).status, 200);
  const etter = await vert();
  assert.deepEqual(etter.map((ol) => ol.plass), alle);
  assert.deepEqual(etter.slice(0, 5).map((ol) => ol.navn), ["Juleøl nummer 2", "Juleøl nummer 1", "Juleøl nummer 5", "Juleøl nummer 3", "Juleøl nummer 4"]);
  await neste(o, kode, vertNokkel, 2);
  const res = (await o.kall("GET", `/${kode}/resultater`)).body;
  assert.deepEqual([res.ol[0].navn, res.ol[0].snitt, res.ol[0].karakterer[0].kommentar], ["Juleøl nummer 2", 4, "Først"]);
  assert.deepEqual([res.ol[1].navn, res.ol[1].snitt], ["Juleøl nummer 1", 2]);
  assert.deepEqual(res.ol[2], { plass: 3, antall: 0 }, "øl 3 smakes nå, blindt");
  await o.kall("POST", `/${kode}/avslutt`, { vertNokkel });
  assert.equal((await flytt([])).status, 409, "avsluttet runde");
});

test("to vinduer hos verten skriver ikke over hverandre, og ingen karakter havner på feil øl", async () => {
  const o = oppsett();
  const { kode, vertNokkel, deltakere: [a] } = await rundeMedDeltakere(o, { antall: 1 });
  await neste(o, kode, vertNokkel, 0);
  // Lageret slipper et annet kall inn mellom lesingen og skrivingen, én gang.
  const mellom = (forst) => {
    let gjort = false;
    return { kjor: async (k) => { if (k[0][0] === "EVAL" && !gjort) { gjort = true; await forst(); } return o.lager.kjor(k); } };
  };
  const direkte = (lager, sti, body) => handle(new Request(`http://localhost:8787/api/runde/${kode}${sti}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { env: {}, lager });
  // Skjenkelista flytter øl mens storskjermen går videre fra øl 1 og en deltaker rater øl 2.
  const flytt = await direkte(mellom(async () => { await neste(o, kode, vertNokkel, 1); await rate(o, kode, a, 2, 5); }),
    "/rekkefolge", { vertNokkel, rekkefolge: [3, 2, 4, 5, 6, 7, 8, 9, 10] });
  assert.equal(flytt.status, 409);
  const vert = (await o.kall("GET", `/${kode}`, undefined, { "x-vertnokkel": vertNokkel })).body;
  assert.deepEqual([vert.avslort, vert.na, vert.ol[1].navn], [[1], 2, "Juleøl nummer 2"], "avsløringen står, og øl 2 er der karakteren er");
  // Trykker to skjermer «Neste øl» samtidig, får begge 200, og bare ett øl avsløres.
  const dobbel = await direkte(mellom(() => neste(o, kode, vertNokkel, 2)), "/neste", { vertNokkel, plass: 2 });
  assert.deepEqual([dobbel.status, (await dobbel.json()).avslort], [200, [1, 2]]);
  assert.equal((await o.kall("GET", `/${kode}`)).body.na, 3);
  // Avslutter verten mens en annen skjerm går videre, står avslutningen eller kallet avvises, aldri begge halvveis.
  const slutt = await direkte(mellom(() => o.kall("POST", `/${kode}/avslutt`, { vertNokkel })), "/neste", { vertNokkel, plass: 3 });
  assert.equal(slutt.status, 409);
  assert.equal((await o.kall("GET", `/${kode}`)).body.avsluttet, true);
});

test("i en åpen runde vises ølet som smakes, men snitt og karakterer først når det er avslørt", async () => {
  const o = oppsett();
  const { kode, vertNokkel, deltakere: [a, b] } = await rundeMedDeltakere(o);
  await neste(o, kode, vertNokkel, 0);
  await rate(o, kode, a, 1, 4, "Godt");
  await rate(o, kode, b, 1, 3);
  const for1 = (await o.kall("GET", `/${kode}/resultater`)).body;
  assert.equal(for1.ol[0].navn, OL[0].navn);
  for (const k of ["snitt", "min", "maks", "spredning", "karakterer"]) assert.ok(!(k in for1.ol[0]), `${k} før avsløringen`);
  assert.deepEqual(for1.ol[1], { plass: 2 });
  assert.ok(!JSON.stringify(for1).includes("Godt"));
  await neste(o, kode, vertNokkel, 1);
  const etter = (await o.kall("GET", `/${kode}/resultater`)).body;
  assert.equal(etter.ol[0].snitt, 3.5);
  assert.deepEqual([etter.ol[1].navn, etter.ol[1].snitt], [OL[1].navn, undefined]);
  assert.deepEqual(etter.ol[2], { plass: 3 });
});

test("ugyldig kode, kall over grensen og nødbryteren svarer uten et eneste kall til lageret", async () => {
  const o = oppsett();
  for (const sti of ["/ABC", "/ABCDE0", "/ABCDEO", "/ABCDEFG", "/ABCDEF/noe", "/ABCDEF/deltaker/ekstra"]) {
    assert.equal((await o.kall("GET", sti)).status, 404, sti);
  }
  assert.equal((await o.kall("DELETE", "/ABCDEF")).status, 404);
  assert.equal(o.lager.antall, 0);

  const av = oppsett({ env: { SMAKERUNDE_AV: "1" } });
  assert.equal((await av.kall("POST", "", { ol: OL })).status, 503);
  assert.equal((await av.kall("GET", "/ABCDEF/resultater")).status, 503);
  assert.equal(av.lager.antall, 0);

  const b = oppsett();
  for (let i = 0; i < MAKS.kallPerMinutt; i++) await b.kall("GET", "/X");
  assert.equal((await b.kall("POST", "", { ol: OL })).status, 429);
  assert.equal(b.lager.antall, 0);
  b.tid(60 * 1000);
  assert.equal((await b.kall("POST", "", { ol: OL })).status, 201, "nytt minutt");
});

test("CORS bare for siden, og localhost ikke i produksjon", async () => {
  const o = oppsett();
  const fra = async (origin, env) => (await handle(new Request("http://x/api/runde/ABCDEF", { headers: { origin } }), { env, lager: minnelager() })).headers.get("access-control-allow-origin");
  assert.equal(await fra("https://mariushagen.github.io", { VERCEL_ENV: "production" }), "https://mariushagen.github.io");
  assert.equal(await fra("http://localhost:8000", { VERCEL_ENV: "production" }), null);
  assert.equal(await fra("http://localhost:8000", {}), "http://localhost:8000");
  assert.equal(await fra("https://ond.example", {}), null);
  const lan = { LAN_OPPRINNELSER: "http://10.0.0.5:8000" };
  assert.equal(await fra("http://10.0.0.5:8000", lan), "http://10.0.0.5:8000", "nettverksadressen fra lokal-api.mjs --lan");
  assert.equal(await fra("http://10.0.0.5:8000", {}), null);
  assert.equal(await fra("http://10.0.0.5:8000", { ...lan, VERCEL_ENV: "production" }), null);
  const pre = await o.kall("OPTIONS", "/ABCDEF/karakter");
  assert.equal(pre.status, 204);
  assert.match(pre.hoder.get("access-control-allow-methods"), /PUT/);
  const fremmed = await o.kall("OPTIONS", "/ABCDEF/karakter", undefined, { origin: "https://ond.example" });
  assert.equal(fremmed.hoder.get("access-control-allow-origin"), null);
  assert.equal(o.lager.antall, 0);
});

test("ugyldige øl og tall avvises eller blir tomme, ikke 0", async () => {
  const o = oppsett();
  assert.equal((await o.kall("POST", "", { ol: [null] })).status, 400);
  assert.equal((await o.kall("POST", "", { ol: [[1, 2]] })).status, 400);
  const ny = await o.kall("POST", "", { ol: [{ navn: "X", score: " ", pris: [], alkohol: "8.5", cl: -3 }, { navn: "Y", score: 9 }] });
  assert.equal(ny.status, 201);
  const [x, y] = ny.body.runde.ol;
  assert.deepEqual([x.score, x.pris, x.alkohol, x.cl, y.score], [null, null, 8.5, null, null]);
});

test("Upstash-lageret sender pipeline med token, og kaster på feil", async () => {
  const { upstashLager, lagerFraMiljo, SETT_HVIS_LIK } = await import("../api/_lib/lager.mjs");
  const kall = [];
  const hent = async (url, init) => {
    kall.push({ url, init });
    return new Response(JSON.stringify([{ result: "OK" }, { result: null }]), { status: 200 });
  };
  const l = upstashLager("https://eks.upstash.io", "hemmelig", hent);
  assert.deepEqual(await l.kjor([["SET", "olsmaking:a", "1"], ["GET", "olsmaking:b"]]), ["OK", null]);
  assert.equal(kall[0].url, "https://eks.upstash.io/pipeline");
  assert.equal(kall[0].init.headers.Authorization, "Bearer hemmelig");
  assert.deepEqual(JSON.parse(kall[0].init.body), [["SET", "olsmaking:a", "1"], ["GET", "olsmaking:b"]]);
  await assert.rejects(l.kjor([["GET", "round:a"]]), /prefiks/);
  await assert.rejects(l.kjor([["EVAL", "return redis.call('FLUSHALL')", 0]]), /SETT_HVIS_LIK/);
  await assert.rejects(l.kjor([["EVAL", SETT_HVIS_LIK, 1, "lunsj:a", "x", "y", 60]]), /prefiks/);
  await assert.rejects(l.kjor([["EVAL", SETT_HVIS_LIK, 0]]), /prefiks/);
  assert.equal(kall.length, 1, "nøkkel uten prefiks og andre skript sendes aldri");
  const feil = upstashLager("u", "t", async () => new Response(JSON.stringify([{ error: "ERR" }]), { status: 200 }));
  await assert.rejects(feil.kjor([["GET", "olsmaking:a"]]), /Upstash: ERR/);
  const nede = upstashLager("u", "t", async () => new Response("", { status: 401 }));
  await assert.rejects(nede.kjor([["GET", "olsmaking:a"]]), /401/);
  assert.throws(() => lagerFraMiljo({ VERCEL: "1" }), /Upstash-variablene mangler/);
  assert.ok(lagerFraMiljo({}).kjor, "lokalt uten variabler: minnelager");
});

test("sammendraget: favoritt, omstridt, overraskelse og den som er mest enig med Untappd", async () => {
  const o = oppsett();
  const { kode, vertNokkel, deltakere: [a, b, c] } = await rundeMedDeltakere(o, { antall: 3 });
  // Øl 1 (Untappd 3,0): alle gir 5. Øl 2 (3,1): 1, 5 og 3. Øl 3 (3,2): rundt Untappd.
  await neste(o, kode, vertNokkel, 0);
  for (const d of [a, b, c]) await rate(o, kode, d, 1, 5);
  await neste(o, kode, vertNokkel, 1);
  await rate(o, kode, a, 2, 1);
  await rate(o, kode, b, 2, 5);
  await rate(o, kode, c, 2, 3);
  await neste(o, kode, vertNokkel, 2);
  for (const d of [a, b, c]) await rate(o, kode, d, 3, 3);
  await o.kall("POST", `/${kode}/avslutt`, { vertNokkel });
  const s = (await o.kall("GET", `/${kode}/resultater`)).body.sammendrag;
  assert.equal(s.favoritt.plass, 1);
  assert.equal(s.omstridt.plass, 2);
  assert.equal(s.overraskelse.plass, 1);
  assert.equal(s.untappdVenn.kallenavn, "Person 3");
});

test("en runde med 15 personer, 10 øl og 90 minutter bruker under 8 000 Redis-kommandoer", async () => {
  const o = oppsett();
  const { kode, vertNokkel } = (await o.kall("POST", "", { ol: OL, blind: true })).body;
  const folk = [];
  for (let i = 0; i < 15; i++) folk.push((await o.kall("POST", `/${kode}/deltaker`, { kallenavn: `P${i}` })).body);
  // Storskjermen spør hvert 5. sekund i 90 minutter, og deltakerne hvert 30. sekund hele tiden. Verten flytter
  // ett øl og åpner første øl. Hvert øl får ni minutter: alle rater det i løpet av de første par minuttene, og
  // så går verten videre. Da henter hver deltaker resultatene én gang.
  const SPOR = 6, PER_OL = 108;
  await o.kall("POST", `/${kode}/rekkefolge`, { vertNokkel, rekkefolge: [2, 1, 3, 4, 5, 6, 7, 8, 9, 10] });
  await neste(o, kode, vertNokkel, 0);
  for (let tikk = 0; tikk < 1080; tikk++) {
    await o.kall("GET", `/${kode}/resultater`);
    const plass = Math.floor(tikk / PER_OL) + 1, iOlet = tikk % PER_OL;
    if (iOlet < 2 * folk.length && iOlet % 2 === 0) await rate(o, kode, folk[iOlet / 2], plass, 3.5);
    if (iOlet === PER_OL - 8) {
      await neste(o, kode, vertNokkel, plass);
      for (let i = 0; i < folk.length; i++) await o.kall("GET", `/${kode}/resultater`);
    }
    if (tikk % SPOR === 0) for (let i = 0; i < folk.length; i++) await o.kall("GET", `/${kode}`);
    o.tid(5000);
  }
  await o.kall("POST", `/${kode}/avslutt`, { vertNokkel });
  assert.ok(o.lager.antall < 8000, `${o.lager.antall} kommandoer`);
  console.log(`  kommandoer i en simulert runde: ${o.lager.antall}`);
});
