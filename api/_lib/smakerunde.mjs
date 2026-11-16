// API-et for smakerunden. Én funksjon som ruter selv, med Web-standard Request og Response, så testene og
// den lokale serveren kan kalle den direkte uten Vercel.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { PREFIKS, SETT_HVIS_LIK } from "./lager.mjs";

export const LEVETID = 7 * 24 * 3600; // sekunder, regnet fra siste endring
export const MAKS = { ol: 12, deltakere: 50, kallenavn: 30, kommentar: 140, nyePerTime: 20, aktive: 100, kallPerMinutt: 600 };
const ALFABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // uten 0, O, 1 og I
const KODE = new RegExp(`^[${ALFABET}]{6}$`);
const PROD = ["https://mariushagen.github.io"];
const LOKALT = ["http://localhost:8000", "http://127.0.0.1:8000"];

const nokkel = {
  runde: (k) => `${PREFIKS}runde:${k}`,
  deltakere: (k) => `${PREFIKS}runde:${k}:deltakere`,
  karakterer: (k) => `${PREFIKS}runde:${k}:karakterer`,
  aktive: `${PREFIKS}aktive`,
  nye: (time) => `${PREFIKS}nye:${time}`,
};

class Klientfeil extends Error {
  constructor(status, melding) {
    super(melding);
    this.status = status;
  }
}

// Bremsen telles i minnet til instansen, så den koster ingen kall til lageret.
const brems = { minutt: -1, antall: 0 };
export function nullstillBrems() {
  brems.minutt = -1;
  brems.antall = 0;
}

const hash = (s) => createHash("sha256").update(s).digest("hex");
function lik(hexA, hexB) {
  const a = Buffer.from(String(hexA), "hex"), b = Buffer.from(String(hexB), "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
const nyNokkel = () => randomBytes(24).toString("base64url");
const nyKode = () => [...randomBytes(6)].map((b) => ALFABET[b & 31]).join("");
const tekst = (v, maks) => String(v ?? "").trim().slice(0, maks);
// Bare ekte tall, eller tekst som er et tall, innenfor grensene. Alt annet blir null, ikke 0.
function tall(v, min, maks) {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) && n >= min && n <= maks ? n : null;
}
const lenke = (v) => (typeof v === "string" && v.startsWith("https://www.vinmonopolet.no/") ? v : "");

function cors(request, env) {
  const fra = request.headers.get("origin");
  // Settes av tools/lokal-api.mjs --lan, så sidene kan prøves fra en telefon på samme nett.
  const lan = env.LAN_OPPRINNELSER ? env.LAN_OPPRINNELSER.split(",") : [];
  const tillatt = env.VERCEL_ENV === "production" ? PROD : [...PROD, ...LOKALT, ...lan];
  return fra && tillatt.includes(fra) ? { "Access-Control-Allow-Origin": fra, Vary: "Origin" } : { Vary: "Origin" };
}

function svar(status, body, hoder) {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...hoder },
  });
}

// ctx: { env, lager, klokke }. lager hentes først når en rute trenger det, så sikringene ikke rører det.
export async function handle(request, ctx) {
  const env = ctx.env ?? {};
  const klokke = ctx.klokke ?? (() => Date.now());
  const hoder = cors(request, env);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...hoder, "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Vertnokkel", "Access-Control-Max-Age": "86400" } });
  }
  if (env.SMAKERUNDE_AV === "1") return svar(503, { feil: "Smakerunden er slått av." }, hoder);
  const minutt = Math.floor(klokke() / 60000);
  if (brems.minutt !== minutt) {
    brems.minutt = minutt;
    brems.antall = 0;
  }
  if (++brems.antall > MAKS.kallPerMinutt) return svar(429, { feil: "For mange forespørsler akkurat nå. Prøv igjen om litt." }, hoder);

  const rute = finnRute(request);
  if (!rute) return svar(404, { feil: "Fant ikke det du lette etter." }, hoder);
  try {
    const { status, body } = await rute.handling({ request, lager: ctx.lager, klokke, kode: rute.kode });
    return svar(status, body, hoder);
  } catch (e) {
    if (e instanceof Klientfeil) return svar(e.status, { feil: e.message }, hoder);
    console.error(e);
    return svar(500, { feil: "Noe gikk galt. Prøv igjen." }, hoder);
  }
}

function finnRute(request) {
  const url = new URL(request.url);
  // Vercel sender stien med som ?sti= etter omskrivingen i vercel.json, den lokale serveren som sti.
  const sti = url.searchParams.get("sti") ?? url.pathname.replace(/^\/api\/runde\/?/, "");
  const deler = sti.split("/").filter(Boolean);
  const m = request.method;
  if (deler.length === 0) return m === "POST" ? { handling: lagRunde } : null;
  const kode = deler[0].toUpperCase();
  if (!KODE.test(kode) || deler.length > 2) return null;
  const ruter = { "GET:": hentRunde, "POST:deltaker": bliMed, "PUT:karakter": giKarakter, "GET:resultater": resultater,
    "POST:neste": neste, "POST:rekkefolge": rekkefolge, "POST:avslutt": avslutt };
  const handling = ruter[`${m}:${deler[1] ?? ""}`];
  return handling ? { handling, kode } : null;
}

async function lesJson(request) {
  const tekstInn = await request.text();
  if (tekstInn.length > 16000) throw new Klientfeil(413, "Forespørselen er for stor.");
  try {
    const v = JSON.parse(tekstInn || "{}");
    if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error();
    return v;
  } catch {
    throw new Klientfeil(400, "Forespørselen er ikke gyldig JSON.");
  }
}

const tolk = (s) => (s == null ? null : JSON.parse(s));
const tilObjekt = (flat) => {
  const o = {};
  for (let i = 0; i < (flat?.length ?? 0); i += 2) o[flat[i]] = tolk(flat[i + 1]);
  return o;
};
const fornyAlle = (kode) => [nokkel.runde(kode), nokkel.deltakere(kode), nokkel.karakterer(kode)].map((k) => ["EXPIRE", k, LEVETID]);

// Teksten runden ble lest som, så den bare skrives tilbake hvis ingen har endret den i mellomtiden.
const lestSom = new WeakMap();

async function hentRundeEllerFeil(lager, kode, ekstra = []) {
  const [r, ...resten] = await lager.kjor([["GET", nokkel.runde(kode)], ...ekstra]);
  if (!r) throw new Klientfeil(404, "Fant ingen runde med den koden. Sjekk koden, eller om runden er slettet.");
  const runde = tolk(r);
  lestSom.set(runde, r);
  return [runde, ...resten];
}

// Et øl er avslørt når verten har gått videre fra det, eller når runden er avsluttet. Runder fra før
// avsløringen fantes, har ingen liste, og runder fra før «Åpne øl 1» fantes, regnes som startet.
const avslorte = (r) => (r.avsluttet ? r.ol.map((o) => o.plass) : (r.avslort ?? []));
const erAvslort = (r, plass) => r.avsluttet || (r.avslort ?? []).includes(plass);
const erStartet = (r) => r.startet !== false;
// Ølet som smakes: det første som ikke er avslørt, når runden er startet og ikke avsluttet.
const smakesNa = (r) => (!erStartet(r) || r.avsluttet ? null : (r.ol.find((o) => !erAvslort(r, o.plass))?.plass ?? null));

// Hva alle får se. Et øl som ikke er åpnet, har bare plassen sin, så ingen ser hva som kommer. Ølet som smakes,
// har bare plassen i en blind runde.
export function visRunde(r, erVert) {
  const na = smakesNa(r);
  const skjult = (o) => !erAvslort(r, o.plass) && (o.plass !== na || r.blind);
  return {
    kode: r.kode, blind: r.blind, avsluttet: r.avsluttet, opprettet: r.opprettet, startet: erStartet(r), na,
    avslort: avslorte(r), ol: r.ol.map((o) => (!erVert && skjult(o) ? { plass: o.plass } : { ...o })),
  };
}

async function lagRunde({ request, lager, klokke }) {
  const inn = await lesJson(request);
  const ol = Array.isArray(inn.ol) ? inn.ol : [];
  if (ol.length < 1 || ol.length > MAKS.ol) throw new Klientfeil(400, `En runde må ha mellom 1 og ${MAKS.ol} øl.`);
  if (!ol.every((o) => typeof o === "object" && o !== null && !Array.isArray(o))) throw new Klientfeil(400, "Ølene må være objekter.");
  const kopi = ol.map((o, i) => ({
    plass: i + 1, navn: tekst(o.navn, 120), gruppe: tekst(o.gruppe, 40), stil: tekst(o.stil, 80), score: tall(o.score, 0, 5),
    alkohol: tall(o.alkohol, 0, 100), cl: tall(o.cl, 0, 1000), pris: tall(o.pris, 0, 100000), id: tekst(o.id, 20), polet: lenke(o.polet),
  }));
  const na = klokke();
  const time = Math.floor(na / 3600000);
  const [nye, , , aktive] = await lager.kjor([
    ["INCR", nokkel.nye(time)], ["EXPIRE", nokkel.nye(time), 3600],
    ["ZREMRANGEBYSCORE", nokkel.aktive, 0, na - LEVETID * 1000], ["ZCARD", nokkel.aktive],
  ]);
  if (nye > MAKS.nyePerTime) throw new Klientfeil(429, "Det er startet mange runder den siste timen. Prøv igjen litt senere.");
  if (aktive >= MAKS.aktive) throw new Klientfeil(429, "Det er for mange aktive runder akkurat nå. Prøv igjen senere.");
  const vertNokkel = nyNokkel();
  for (let forsok = 0; forsok < 5; forsok++) {
    const kode = nyKode();
    const runde = { kode, opprettet: na, blind: inn.blind === true, startet: false, avsluttet: false, avslort: [],
      vert: hash(vertNokkel), ol: kopi };
    const [ok] = await lager.kjor([["SET", nokkel.runde(kode), JSON.stringify(runde), "NX", "EX", LEVETID]]);
    if (ok === "OK") {
      await lager.kjor([["ZADD", nokkel.aktive, na, kode], ["EXPIRE", nokkel.aktive, LEVETID]]);
      return { status: 201, body: { kode, vertNokkel, runde: visRunde(runde, true) } };
    }
  }
  throw new Error("Fant ingen ledig kode etter fem forsøk.");
}

async function hentRunde({ request, lager, kode }) {
  const [r] = await hentRundeEllerFeil(lager, kode);
  const oppgitt = request.headers.get("x-vertnokkel");
  return { status: 200, body: visRunde(r, Boolean(oppgitt) && lik(hash(oppgitt), r.vert)) };
}

async function bliMed({ request, lager, kode }) {
  const inn = await lesJson(request);
  const kallenavn = tekst(inn.kallenavn, MAKS.kallenavn);
  if (!kallenavn) throw new Klientfeil(400, "Skriv et kallenavn.");
  const [r, antall] = await hentRundeEllerFeil(lager, kode, [["HLEN", nokkel.deltakere(kode)]]);
  if (r.avsluttet) throw new Klientfeil(409, "Runden er avsluttet.");
  if (antall >= MAKS.deltakere) throw new Klientfeil(409, `Runden er full (${MAKS.deltakere} deltakere).`);
  const deltakerId = randomBytes(6).toString("base64url");
  const deltakerNokkel = nyNokkel();
  await lager.kjor([["HSET", nokkel.deltakere(kode), deltakerId, JSON.stringify({ kallenavn, nokkel: hash(deltakerNokkel) })], ...fornyAlle(kode)]);
  return { status: 201, body: { deltakerId, deltakerNokkel, kallenavn, runde: visRunde(r, false) } };
}

const GYLDIGE_STJERNER = new Set([1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);

async function giKarakter({ request, lager, kode }) {
  const inn = await lesJson(request);
  const stjerner = Number(inn.stjerner);
  if (!GYLDIGE_STJERNER.has(stjerner)) throw new Klientfeil(400, "Stjernene må være fra 1 til 5 i halve steg.");
  const kommentar = tekst(inn.kommentar, MAKS.kommentar);
  const id = tekst(inn.deltakerId, 20);
  const [r, deltaker] = await hentRundeEllerFeil(lager, kode, [["HGET", nokkel.deltakere(kode), id]]);
  const plass = Number(inn.plass);
  if (!Number.isInteger(plass) || plass < 1 || plass > r.ol.length) throw new Klientfeil(400, "Ukjent plass i rekka.");
  const d = tolk(deltaker);
  if (!d || !lik(hash(String(inn.deltakerNokkel ?? "")), d.nokkel)) throw new Klientfeil(403, "Du kan bare endre dine egne karakterer.");
  if (r.avsluttet) throw new Klientfeil(409, "Runden er avsluttet, så karakterene kan ikke endres.");
  if (erAvslort(r, plass)) throw new Klientfeil(409, `Øl ${plass} er avslørt, så karakteren kan ikke endres.`);
  if (!erStartet(r)) throw new Klientfeil(409, "Verten har ikke åpnet første øl ennå.");
  if (plass !== smakesNa(r)) throw new Klientfeil(409, `Øl ${plass} er ikke åpnet ennå.`);
  await lager.kjor([["HSET", nokkel.karakterer(kode), `${id}:${plass}`, JSON.stringify({ stjerner, kommentar })], ...fornyAlle(kode)]);
  return { status: 200, body: { ok: true } };
}

// Bare verten skriver runden, men fra flere vinduer: storskjermen og skjenkelista. Runden skrives derfor bare
// hvis den er lik den som ble lest, så to trykk i samme øyeblikk ikke skriver over hverandre, og ingen karakter
// havner på feil øl fordi en flytting skrev over en avsløring.
async function lagreRunde(lager, kode, lest, ny) {
  const [ok] = await lager.kjor([["EVAL", SETT_HVIS_LIK, 1, nokkel.runde(kode), lestSom.get(lest), JSON.stringify(ny), LEVETID],
    ...fornyAlle(kode).slice(1)]);
  if (ok !== "OK") throw new Klientfeil(409, "Runden ble endret fra et annet vindu samtidig. Prøv igjen.");
}

// Verten går videre: plass 0 åpner første øl, og plassen til ølet som smakes avslører det og åpner det neste.
// Karakterene for det avslørte ølet låses, og navnet, snittet og karakterene blir synlige for alle. Et øl som
// allerede er avslørt, eller 0 i en startet runde, gir 200 uten endring, så et dobbelttrykk eller to skjermer
// ikke hopper over et øl. En karakter som er underveis i det ølet avsløres, kan komme med i snittet.
async function neste({ request, lager, kode }) {
  const inn = await lesJson(request);
  const [r] = await hentRundeEllerFeil(lager, kode);
  if (!lik(hash(String(inn.vertNokkel ?? "")), r.vert)) throw new Klientfeil(403, "Bare verten kan gå videre.");
  if (r.avsluttet) throw new Klientfeil(409, "Runden er avsluttet.");
  const plass = Number.isInteger(inn.plass) ? inn.plass : NaN;
  if (!(plass >= 0 && plass <= r.ol.length)) throw new Klientfeil(400, "Ukjent plass i rekka.");
  const alleredeGjort = (runde) => (plass === 0 ? erStartet(runde) : erAvslort(runde, plass));
  if (alleredeGjort(r)) return { status: 200, body: visRunde(r, true) };
  if (plass !== 0 && !erStartet(r)) throw new Klientfeil(409, "Runden er ikke startet ennå.");
  if (plass !== 0 && plass !== smakesNa(r)) throw new Klientfeil(409, `Øl ${plass} er ikke åpnet ennå.`);
  const ny = plass === 0 ? { ...r, startet: true } : { ...r, avslort: [...new Set([...(r.avslort ?? []), plass])].sort((a, b) => a - b) };
  try {
    await lagreRunde(lager, kode, r, ny);
  } catch (e) {
    // Et trykk fra en annen skjerm kom først. Gjorde det det samme, er det ikke en feil.
    const [naa] = await hentRundeEllerFeil(lager, kode);
    if (e.status === 409 && naa.avsluttet) throw new Klientfeil(409, "Runden er avsluttet.");
    if (e.status === 409 && alleredeGjort(naa)) return { status: 200, body: visRunde(naa, true) };
    throw e;
  }
  return { status: 200, body: visRunde(ny, true) };
}

// Verten flytter øl som ikke er åpnet. De får nye plasser etter den nye rekkefølgen. Ølet som smakes og de
// avslørte står fast, og de er de eneste som kan ha karakterer, så ingen karakter havner på feil øl.
async function rekkefolge({ request, lager, kode }) {
  const inn = await lesJson(request);
  const [r] = await hentRundeEllerFeil(lager, kode);
  if (!lik(hash(String(inn.vertNokkel ?? "")), r.vert)) throw new Klientfeil(403, "Bare verten kan endre rekkefølgen.");
  if (r.avsluttet) throw new Klientfeil(409, "Runden er avsluttet.");
  const na = smakesNa(r);
  const lukket = r.ol.filter((o) => !erAvslort(r, o.plass) && o.plass !== na).map((o) => o.plass);
  const ny = Array.isArray(inn.rekkefolge) ? inn.rekkefolge : [];
  const sammeOl = ny.length === lukket.length && ny.every((p) => Number.isInteger(p)) && new Set(ny).size === ny.length
    && ny.every((p) => lukket.includes(p));
  if (!sammeOl) throw new Klientfeil(400, "Rekkefølgen må ha nøyaktig de ølene som ikke er åpnet. Hent runden på nytt.");
  const etterPlass = new Map(r.ol.map((o) => [o.plass, o]));
  const flyttet = new Map(ny.map((fra, i) => [lukket[i], { ...etterPlass.get(fra), plass: lukket[i] }]));
  const nyRunde = { ...r, ol: r.ol.map((o) => flyttet.get(o.plass) ?? o) };
  await lagreRunde(lager, kode, r, nyRunde);
  return { status: 200, body: visRunde(nyRunde, true) };
}

async function avslutt({ request, lager, kode }) {
  const inn = await lesJson(request);
  const [r] = await hentRundeEllerFeil(lager, kode);
  if (!lik(hash(String(inn.vertNokkel ?? "")), r.vert)) throw new Klientfeil(403, "Bare verten kan avslutte runden.");
  const ny = { ...r, avsluttet: true, avslort: r.ol.map((o) => o.plass) };
  await lagreRunde(lager, kode, r, ny);
  return { status: 200, body: visRunde(ny, true) };
}

// Antall karakterer per øl, og snitt, spredning og karakterene først når ølet er avslørt. Kallenavnene
// hentes bare når et øl er avslørt; ellers holder det med antall deltakere.
async function resultater({ lager, kode }) {
  const [r0] = await hentRundeEllerFeil(lager, kode, []);
  const trengerNavn = avslorte(r0).length > 0;
  const [kar, del] = await lager.kjor([["HGETALL", nokkel.karakterer(kode)],
    trengerNavn ? ["HGETALL", nokkel.deltakere(kode)] : ["HLEN", nokkel.deltakere(kode)]]);
  const deltakere = trengerNavn ? tilObjekt(del) : {};
  return { status: 200, body: regnUt(r0, tilObjekt(kar), deltakere, trengerNavn ? Object.keys(deltakere).length : del) };
}

const snitt = (l) => l.reduce((s, x) => s + x, 0) / l.length;

// Et øl som ikke er åpnet, har bare plassen. Ølet som smakes, har plassen og antall karakterer, og i en åpen
// runde også opplysningene om ølet. Snitt og karakterer kommer først når det er avslørt, i både blind og åpen runde.
export function regnUt(runde, karakterer, deltakere, antallDeltakere = Object.keys(deltakere).length) {
  const na = smakesNa(runde);
  const per = {};
  for (const [nok, v] of Object.entries(karakterer)) {
    const skille = nok.lastIndexOf(":");
    const id = nok.slice(0, skille), plass = Number(nok.slice(skille + 1));
    (per[plass] ??= []).push({ id, ...v });
  }
  const ol = runde.ol.map((o) => {
    const k = per[o.plass] ?? [];
    const s = k.map((x) => x.stjerner);
    const ut = { plass: o.plass, antall: s.length };
    const omOlet = { navn: o.navn, gruppe: o.gruppe, stil: o.stil, score: o.score, alkohol: o.alkohol, cl: o.cl, pris: o.pris, id: o.id, polet: o.polet };
    if (!erAvslort(runde, o.plass) && o.plass !== na) return { plass: o.plass };
    if (!erAvslort(runde, o.plass)) return runde.blind ? ut : { ...ut, ...omOlet };
    const m = s.length ? snitt(s) : null;
    return {
      ...ut, ...omOlet, snitt: m, min: s.length ? Math.min(...s) : null, maks: s.length ? Math.max(...s) : null,
      spredning: s.length ? Math.sqrt(snitt(s.map((x) => (x - m) ** 2))) : null,
      karakterer: k.map((x) => ({ kallenavn: deltakere[x.id]?.kallenavn ?? "Ukjent", stjerner: x.stjerner, kommentar: x.kommentar })),
    };
  });
  const harRatet = new Set(Object.keys(karakterer).map((nok) => nok.slice(0, nok.lastIndexOf(":"))));
  const ut = { kode: runde.kode, blind: runde.blind, avsluttet: runde.avsluttet, startet: erStartet(runde), na,
    avslort: avslorte(runde), harRatet: harRatet.size, deltakere: antallDeltakere, ol };
  if (runde.avsluttet) ut.sammendrag = sammendrag(ol, per, deltakere, runde);
  return ut;
}

function sammendrag(ol, per, deltakere, runde) {
  const ratet = ol.filter((o) => o.antall > 0);
  const best = (liste, verdi) => liste.reduce((a, b) => (a === null || verdi(b) > verdi(a) ? b : a), null);
  const kort = (o) => (o ? { plass: o.plass, navn: o.navn, snitt: o.snitt, score: o.score } : null);
  const favoritt = best(ratet, (o) => o.snitt + o.antall / 1000);
  const omstridt = best(ratet.filter((o) => o.antall >= 2), (o) => o.spredning);
  const overraskelse = best(ratet.filter((o) => o.score != null), (o) => Math.abs(o.snitt - o.score));
  const avvik = {};
  for (const o of runde.ol) {
    if (o.score == null) continue;
    for (const k of per[o.plass] ?? []) (avvik[k.id] ??= []).push(Math.abs(k.stjerner - o.score));
  }
  const venner = Object.entries(avvik).filter(([, l]) => l.length >= 3).map(([id, l]) => ({ id, avvik: snitt(l) }));
  const venn = venner.reduce((a, b) => (a === null || b.avvik < a.avvik ? b : a), null);
  return {
    favoritt: kort(favoritt),
    omstridt: omstridt ? { ...kort(omstridt), spredning: omstridt.spredning } : null,
    overraskelse: overraskelse ? { ...kort(overraskelse), forskjell: overraskelse.snitt - overraskelse.score } : null,
    untappdVenn: venn ? { kallenavn: deltakere[venn.id]?.kallenavn ?? "Ukjent", avvik: venn.avvik } : null,
  };
}
