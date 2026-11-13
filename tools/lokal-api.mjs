// API-et for smakerunden lokalt, med minnelageret: node tools/lokal-api.mjs
// Sidene på http://localhost:8000 bruker denne adressen når de kjører lokalt (se site/oppsett.mjs).
import http from "node:http";
import { handle } from "../api/_lib/smakerunde.mjs";
import { minnelager } from "../api/_lib/lager.mjs";

const PORT = Number(process.env.PORT || 8787);
const lager = minnelager();
const env = { ...process.env, VERCEL_ENV: "development" };

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
}).listen(PORT, "127.0.0.1", () => console.log(`Smakerunden lokalt: http://localhost:${PORT}/api/runde (minnelager)`));
