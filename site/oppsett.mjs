// Adressen til API-et for smakerunden. Lokalt kjører tools/lokal-api.mjs på port 8787 på samme maskin som siden,
// også når siden åpnes fra en telefon på samme nett med en privat adresse (node tools/lokal-api.mjs --lan).
const lokalt = ["localhost", "127.0.0.1"].includes(location.hostname)
  || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+(\.\d+)?$/.test(location.hostname);
export const API = lokalt ? `http://${location.hostname}:8787/api/runde` : "https://olsmaking-api.vercel.app/api/runde";

// Av-bryteren for smakerunden på siden. Nødbryteren for API-et er SMAKERUNDE_AV på Vercel (se docs/deploy.md).
export const SMAKERUNDE = lokalt || true;

export async function api(sti, { metode = "GET", body, hoder = {} } = {}) {
  let svar;
  try {
    svar = await fetch(`${API}${sti}`, {
      method: metode, headers: body ? { "Content-Type": "application/json", ...hoder } : hoder,
      body: body ? JSON.stringify(body) : undefined, cache: "no-store",
    });
  } catch {
    throw new Error("Fikk ikke kontakt med smakerunden. Sjekk nettet og prøv igjen.");
  }
  const data = await svar.json().catch(() => ({}));
  if (!svar.ok) throw Object.assign(new Error(data.feil || `Noe gikk galt (${svar.status}).`), { status: svar.status });
  return data;
}

// Spør på nytt med fast mellomrom, men ikke når fanen er skjult, og stopp når stopp() sier det.
export function poll(fn, ms, { stoppEtter = 3 * 3600 * 1000 } = {}) {
  const start = Date.now();
  let tidtaker = null, stoppet = false;
  const neste = () => {
    if (stoppet || Date.now() - start > stoppEtter) return;
    tidtaker = setTimeout(kjor, ms);
  };
  const kjor = async () => {
    if (document.visibilityState !== "visible") return;
    try {
      if ((await fn()) === "stopp") stoppet = true;
    } finally {
      neste();
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !stoppet) {
      clearTimeout(tidtaker);
      kjor();
    }
  });
  kjor();
  return () => { stoppet = true; clearTimeout(tidtaker); };
}

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const nf1 = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const nf2 = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const huskLes = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
export const huskSkriv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privat modus: siden virker uten */ } };
