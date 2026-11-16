// API-et for smakerunden lokalt, med minnelageret: node tools/lokal-api.mjs
// Sidene på http://localhost:8000 bruker denne adressen når de kjører lokalt (se site/oppsett.mjs).
// Med --lan svarer det også på nettverket, så sidene kan prøves fra en telefon på samme Wi-Fi.
import http from "node:http";
import os from "node:os";
import { handle } from "../api/_lib/smakerunde.mjs";
import { minnelager } from "../api/_lib/lager.mjs";

const PORT = Number(process.env.PORT || 8787);
const lager = minnelager();
const LAN = process.argv.includes("--lan");
const adresser = LAN
  ? Object.values(os.networkInterfaces()).flat().filter((a) => a.family === "IPv4" && !a.internal).map((a) => a.address)
  : [];
const env = { ...process.env, VERCEL_ENV: "development", LAN_OPPRINNELSER: adresser.map((a) => `http://${a}:8000`).join(",") };

http.createServer(async (req, res) => {
  const deler = [];
  for await (const d of req) deler.push(d);
  const harKropp = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const svar = await handle(new Request(`http://localhost:${PORT}${req.url}`, {
    method: req.method,
    headers: Object.entries(req.headers).filter(([, v]) => typeof v === "string"),
    body: harKropp ? Buffer.concat(deler) : undefined,
  }), { env, lager });
  res.writeHead(svar.status, Object.fromEntries(svar.headers));
  res.end(Buffer.from(await svar.arrayBuffer()));
}).listen(PORT, LAN ? "0.0.0.0" : "127.0.0.1", () => {
  console.log(`Smakerunden lokalt: http://localhost:${PORT}/api/runde (minnelager)`);
  for (const a of adresser) console.log(`Fra telefonen: http://${a}:8000/`);
});
