// Rekka lagret i nettleseren, så den er der uendret når dere smaker uker etter innkjøpet, selv om et øl er
// utsolgt eller borte fra dataene. Ingen tilgang til siden, så den testes med node --test.

export const NOKKEL = "olsmaking.rekke";
const TEKST = ["id", "navn", "gruppe", "stil"];
const TALL = ["alkohol", "cl", "pris", "flasker", "kostnad"];
const KANSKJE_TALL = ["score", "innsjekker"];
// Lenkene vises som href, så bare de to stedene dataene lenker til, slipper gjennom.
const LENKER = { polet: "https://www.vinmonopolet.no/", untappd: "https://untappd.com/" };
const VALG_TALL = ["personer", "budsjett", "antall", "alkoholfrie"];

// Det som trengs for å vise ølet og starte en smakerunde. Lagerstatus lagres ikke.
function plukk(o) {
  const ut = {};
  for (const f of [...TEKST, ...TALL, ...KANSKJE_TALL]) ut[f] = o[f] ?? null;
  ut.nett = Boolean(o.nett);
  for (const f of Object.keys(LENKER)) ut[f] = o[f] ?? "";
  return ut;
}

const gyldigOl = (o) => typeof o === "object" && o !== null
  && TEKST.every((f) => typeof o[f] === "string") && /^[0-9A-Za-z_-]{1,20}$/.test(o.id)
  && TALL.every((f) => Number.isFinite(o[f]))
  && KANSKJE_TALL.every((f) => o[f] === null || Number.isFinite(o[f]))
  && Object.entries(LENKER).every(([f, start]) => o[f] === "" || (typeof o[f] === "string" && o[f].startsWith(start)));

export function tilLagring({ valg, rekke, alkoholfrie, laste, lagret }) {
  return JSON.stringify({
    versjon: 1,
    lagret,
    valg: { butikk: valg.butikk, personer: valg.personer, budsjett: valg.budsjett, antall: valg.antall,
      alkoholfrie: valg.alkoholfrie, typer: [...valg.typer] },
    rekke: rekke.map(plukk),
    alkoholfrie: alkoholfrie.map(plukk),
    laste: [...laste],
  });
}

// Den lagrede rekka, eller null hvis det som ligger der, er ødelagt eller fra en annen versjon av siden.
export function fraLagring(tekst) {
  let v;
  try {
    v = JSON.parse(tekst);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null || v.versjon !== 1) return null;
  if (typeof v.lagret !== "string" || Number.isNaN(Date.parse(v.lagret))) return null;
  const valg = v.valg;
  if (typeof valg !== "object" || valg === null || typeof valg.butikk !== "string") return null;
  if (!VALG_TALL.every((f) => Number.isInteger(valg[f]))) return null;
  if (!Array.isArray(valg.typer) || !valg.typer.every((t) => typeof t === "string")) return null;
  if (!Array.isArray(v.rekke) || !Array.isArray(v.alkoholfrie) || v.rekke.length === 0) return null;
  if (![...v.rekke, ...v.alkoholfrie].every(gyldigOl)) return null;
  const ider = new Set([...v.rekke, ...v.alkoholfrie].map((o) => o.id));
  return {
    lagret: v.lagret,
    valg: { butikk: valg.butikk, personer: valg.personer, budsjett: valg.budsjett, antall: valg.antall,
      alkoholfrie: valg.alkoholfrie, typer: [...valg.typer] },
    rekke: v.rekke.map(plukk),
    alkoholfrie: v.alkoholfrie.map(plukk),
    laste: Array.isArray(v.laste) ? v.laste.filter((id) => ider.has(id)) : [],
  };
}
