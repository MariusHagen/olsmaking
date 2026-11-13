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

test("lage runde, bli med, gi og endre karakter, se resultater og avslutte", async () => {
  const o = oppsett();
  const { kode, vertNokkel, deltakere: [a, b] } = await rundeMedDeltakere(o);
  assert.match(kode, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal((await rate(o, kode, a, 1, 4)).status, 200);
  assert.equal((await rate(o, kode, a, 1, 4.5, "Godt")).status, 200);
  assert.equal((await rate(o, kode, b, 1, 3.5)).status, 200);
  const res = (await o.kall("GET", `/${kode}/resultater`)).body;
  assert.equal(res.ol[0].antall, 2);
  assert.equal(res.ol[0].snitt, 4);
  assert.equal(res.harRatet, 2);

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
  await rate(o, kode, a, 1, 3, "k".repeat(200));
  await o.kall("POST", `/${kode}/avslutt`, { vertNokkel });
  const res = (await o.kall("GET", `/${kode}/resultater`)).body;
  assert.equal(res.ol[0].karakterer[0].kommentar.length, MAKS.kommentar);
});

test("alle nøkler har prefikset og levetid, og lageret avviser nøkler uten prefiks", async () => {
  const o = oppsett();
  const { kode, vertNokkel, deltakere: [a] } = await rundeMedDeltakere(o);
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

test("en blind runde svarer bare med tillatte felter før avslutningen, i alle ruter", async () => {
  const o = oppsett();
  const ny = await o.kall("POST", "", { ol: OL, blind: true });
  const { kode, vertNokkel } = ny.body;
  const d = (await o.kall("POST", `/${kode}/deltaker`, { kallenavn: "Kari" })).body;
  await rate(o, kode, d, 1, 4, "Smaker jul");
  const svar = [
    (await o.kall("GET", `/${kode}`)).body,
    d.runde,
    (await rate(o, kode, d, 2, 3)).body,
    (await o.kall("GET", `/${kode}/resultater`)).body,
  ];
  const TOPP = new Set(["kode", "blind", "avsluttet", "opprettet", "ol", "harRatet", "ok"]);
  const OL_FELT = new Set(["plass", "antall", "snitt", "min", "maks", "spredning"]);
  for (const s of svar) {
    for (const k of Object.keys(s)) assert.ok(TOPP.has(k), `ulovlig felt ${k}`);
    for (const ol of s.ol ?? []) for (const k of Object.keys(ol)) assert.ok(OL_FELT.has(k), `ulovlig felt ${k} på øl`);
    const json = JSON.stringify(s);
    for (const lekk of ["Juleøl", "Bock", "vinmonopolet", "Kari", "Smaker jul", "3.1"]) assert.ok(!json.includes(lekk), `${lekk} i ${json}`);
  }
  // Verten får alt med nøkkelen, og etter avslutningen får alle navnene.
  const vert = (await o.kall("GET", `/${kode}`, undefined, { "x-vertnokkel": vertNokkel })).body;
  assert.equal(vert.ol[0].navn, "Juleøl nummer 1");
  assert.equal((await o.kall("GET", `/${kode}`, undefined, { "x-vertnokkel": "feil" })).body.ol[0].navn, undefined);
  await o.kall("POST", `/${kode}/avslutt`, { vertNokkel });
  assert.equal((await o.kall("GET", `/${kode}`)).body.ol[0].navn, "Juleøl nummer 1");
  assert.equal((await o.kall("GET", `/${kode}/resultater`)).body.ol[0].karakterer[0].kallenavn, "Kari");
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
  const { upstashLager, lagerFraMiljo } = await import("../api/_lib/lager.mjs");
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
  assert.equal(kall.length, 1, "nøkkel uten prefiks sendes aldri");
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
  // Øl 1 (Untappd 3,0): alle gir 5. Øl 2 (3,1): 1 og 5. Øl 3 (3,2): rundt Untappd.
  for (const d of [a, b, c]) await rate(o, kode, d, 1, 5);
  await rate(o, kode, a, 2, 1);
  await rate(o, kode, b, 2, 5);
  for (const d of [a, b, c]) await rate(o, kode, d, 3, 3);
  await rate(o, kode, c, 2, 3);
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
  // Storskjermen spør hvert 5. sekund i 90 minutter. Karakterene kommer i løpet av de første 30 minuttene,
  // og deltakerne spør hvert 20. sekund i den siste timen mens de venter på avsløringen.
  const karakterer = folk.flatMap((d) => Array.from({ length: 10 }, (_, p) => [d, p + 1]));
  for (let tikk = 0; tikk < 1080; tikk++) {
    await o.kall("GET", `/${kode}/resultater`);
    if (tikk < karakterer.length) await rate(o, kode, karakterer[tikk][0], karakterer[tikk][1], 3.5);
    if (tikk >= 360 && tikk % 4 === 0) for (let i = 0; i < folk.length; i++) await o.kall("GET", `/${kode}`);
    o.tid(5000);
  }
  await o.kall("POST", `/${kode}/avslutt`, { vertNokkel });
  assert.ok(o.lager.antall < 8000, `${o.lager.antall} kommandoer`);
  console.log(`  kommandoer i en simulert runde: ${o.lager.antall}`);
});
