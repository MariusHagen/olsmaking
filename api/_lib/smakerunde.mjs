// API-et for smakerunden. Én funksjon som ruter selv, med Web-standard Request og Response, så testene og
// den lokale serveren kan kalle den direkte uten Vercel.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { PREFIKS } from "./lager.mjs";

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
  const tillatt = env.VERCEL_ENV === "production" ? PROD : [...PROD, ...LOKALT];
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
  const ruter = { "GET:": hentRunde, "POST:deltaker": bliMed, "PUT:karakter": giKarakter, "GET:resultater": resultater, "POST:avslutt": avslutt };
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

async function hentRundeEllerFeil(lager, kode, ekstra = []) {
  const [r, ...resten] = await lager.kjor([["GET", nokkel.runde(kode)], ...ekstra]);
  if (!r) throw new Klientfeil(404, "Fant ingen runde med den koden. Sjekk koden, eller om runden er slettet.");
  return [tolk(r), ...resten];
}

// Hva alle får se. I en blind runde som ikke er avsluttet, har hvert øl bare plassen sin.
export function visRunde(r, erVert) {
  const skjult = r.blind && !r.avsluttet && !erVert;
  return {
    kode: r.kode, blind: r.blind, avsluttet: r.avsluttet, opprettet: r.opprettet,
    ol: r.ol.map((o) => (skjult ? { plass: o.plass } : { ...o })),
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
    const runde = { kode, opprettet: na, blind: inn.blind === true, avsluttet: false, vert: hash(vertNokkel), ol: kopi };
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
  await lager.kjor([["HSET", nokkel.karakterer(kode), `${id}:${plass}`, JSON.stringify({ stjerner, kommentar })], ...fornyAlle(kode)]);
  return { status: 200, body: { ok: true } };
}

async function avslutt({ request, lager, kode }) {
  const inn = await lesJson(request);
  const [r] = await hentRundeEllerFeil(lager, kode);
  if (!lik(hash(String(inn.vertNokkel ?? "")), r.vert)) throw new Klientfeil(403, "Bare verten kan avslutte runden.");
  const ny = { ...r, avsluttet: true };
  await lager.kjor([["SET", nokkel.runde(kode), JSON.stringify(ny), "EX", LEVETID], ...fornyAlle(kode).slice(1)]);
  return { status: 200, body: visRunde(ny, true) };
}

// Antall, snitt og spredning per øl. Navn, Untappd, kallenavn og kommentarer bare når de kan vises.
async function resultater({ lager, kode }) {
  const [r0] = await hentRundeEllerFeil(lager, kode, []);
  const visAlt = !r0.blind || r0.avsluttet;
  const ekstra = [["HGETALL", nokkel.karakterer(kode)], ...(visAlt ? [["HGETALL", nokkel.deltakere(kode)]] : [])];
  const [kar, del] = await lager.kjor(ekstra);
  return { status: 200, body: regnUt(r0, tilObjekt(kar), tilObjekt(del)) };
}

const snitt = (l) => l.reduce((s, x) => s + x, 0) / l.length;

export function regnUt(runde, karakterer, deltakere) {
  const visAlt = !runde.blind || runde.avsluttet;
  const per = {};
  for (const [nok, v] of Object.entries(karakterer)) {
    const skille = nok.lastIndexOf(":");
    const id = nok.slice(0, skille), plass = Number(nok.slice(skille + 1));
    (per[plass] ??= []).push({ id, ...v });
  }
  const ol = runde.ol.map((o) => {
    const k = per[o.plass] ?? [];
    const s = k.map((x) => x.stjerner);
    const m = s.length ? snitt(s) : null;
    const grunn = {
      plass: o.plass, antall: s.length, snitt: m, min: s.length ? Math.min(...s) : null, maks: s.length ? Math.max(...s) : null,
      spredning: s.length ? Math.sqrt(snitt(s.map((x) => (x - m) ** 2))) : null,
    };
    if (!visAlt) return grunn;
    return { ...grunn, navn: o.navn, gruppe: o.gruppe, stil: o.stil, score: o.score, alkohol: o.alkohol, cl: o.cl, pris: o.pris, id: o.id, polet: o.polet,
      karakterer: k.map((x) => ({ kallenavn: deltakere[x.id]?.kallenavn ?? "Ukjent", stjerner: x.stjerner, kommentar: x.kommentar })) };
  });
  const harRatet = new Set(Object.keys(karakterer).map((nok) => nok.slice(0, nok.lastIndexOf(":"))));
  const ut = { kode: runde.kode, blind: runde.blind, avsluttet: runde.avsluttet, harRatet: harRatet.size, ol };
  if (visAlt) ut.deltakere = Object.keys(deltakere).length;
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
