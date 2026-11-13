// Vercel-funksjonen for smakerunden. All logikk ligger i _lib/smakerunde.mjs, som også testene bruker.
import { handle } from "./_lib/smakerunde.mjs";
import { lagerFraMiljo } from "./_lib/lager.mjs";

let lager;
const ctx = {
  env: process.env,
  // Lageret lages først når en rute trenger det, så nødbryteren virker selv om Upstash mangler.
  get lager() {
    return (lager ??= lagerFraMiljo(process.env));
  },
};

const kjor = (request) => handle(request, ctx);
export { kjor as GET, kjor as POST, kjor as PUT, kjor as OPTIONS };
