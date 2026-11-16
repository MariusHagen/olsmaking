// Lageret for smakerundene: Upstash Redis via REST-API-et, eller et minnelager med de samme kommandoene,
// brukt lokalt og i tester. Databasen deles med lunsjprosjektet, så hver kommando må ha en nøkkel med
// prefikset, og ingenting annet slipper gjennom.

export const PREFIKS = "olsmaking:";

// Skriver en verdi bare hvis den lagrede er lik den som ble lest, i ett steg hos Redis. Svarer «OK», eller 0
// hvis noen har skrevet i mellomtiden. Det eneste skriptet som slipper gjennom.
export const SETT_HVIS_LIK = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3]) else return 0 end";

function sjekkNokler(kommandoer) {
  for (const k of kommandoer) {
    const skript = String(k[0]).toUpperCase() === "EVAL";
    if (skript && k[1] !== SETT_HVIS_LIK) throw new Error("Bare skriptet SETT_HVIS_LIK kan kjøres.");
    const nokler = skript ? k.slice(3, 3 + Number(k[2])) : [k[1]];
    if (nokler.length === 0 || !nokler.every((n) => typeof n === "string" && n.startsWith(PREFIKS))) {
      throw new Error(`Kommando uten prefiks på nøkkelen: ${k[0]} ${nokler.join(" ")}`);
    }
  }
}

export function upstashLager(url, token, hent = fetch) {
  return {
    async kjor(kommandoer) {
      sjekkNokler(kommandoer);
      const svar = await hent(`${url}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(kommandoer),
      });
      if (!svar.ok) throw new Error(`Upstash svarer ${svar.status}`);
      return (await svar.json()).map((r) => {
        if (r.error) throw new Error(`Upstash: ${r.error}`);
        return r.result;
      });
    },
  };
}

// På Vercel må Upstash være satt opp: et minnelager der ville mistet rundene mellom kallene.
export function lagerFraMiljo(env) {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return upstashLager(url, token);
  if (env.VERCEL) throw new Error("Upstash-variablene mangler på Vercel.");
  return minnelager();
}

// Svarene har samme form som fra Upstash: tekst, tall, null, og HGETALL som en flat liste.
export function minnelager(klokke = () => Date.now()) {
  const data = new Map();
  let antall = 0;
  const lever = (k) => {
    const e = data.get(k);
    if (e && e.utloper != null && e.utloper <= klokke()) {
      data.delete(k);
      return undefined;
    }
    return e;
  };
  const samling = (k) => {
    let e = lever(k);
    if (!e) {
      e = { verdi: new Map(), utloper: null };
      data.set(k, e);
    }
    return e.verdi;
  };
  const kommando = {
    GET: (k) => lever(k)?.verdi ?? null,
    SET: (k, v, ...valg) => {
      if (valg.includes("NX") && lever(k)) return null;
      const i = valg.indexOf("EX");
      data.set(k, { verdi: String(v), utloper: i >= 0 ? klokke() + Number(valg[i + 1]) * 1000 : null });
      return "OK";
    },
    INCR: (k) => {
      const e = lever(k);
      const n = (e ? Number(e.verdi) : 0) + 1;
      data.set(k, { verdi: String(n), utloper: e?.utloper ?? null });
      return n;
    },
    EXPIRE: (k, s) => {
      const e = lever(k);
      if (!e) return 0;
      e.utloper = klokke() + Number(s) * 1000;
      return 1;
    },
    TTL: (k) => {
      const e = lever(k);
      if (!e) return -2;
      return e.utloper == null ? -1 : Math.ceil((e.utloper - klokke()) / 1000);
    },
    HSET: (k, ...par) => {
      const h = samling(k);
      let nye = 0;
      for (let i = 0; i < par.length; i += 2) {
        if (!h.has(par[i])) nye++;
        h.set(par[i], String(par[i + 1]));
      }
      return nye;
    },
    HGET: (k, f) => lever(k)?.verdi.get(f) ?? null,
    HGETALL: (k) => (lever(k) ? [...lever(k).verdi].flat() : []),
    HLEN: (k) => lever(k)?.verdi.size ?? 0,
    ZADD: (k, poeng, m) => {
      const z = samling(k);
      const ny = !z.has(m);
      z.set(m, Number(poeng));
      return ny ? 1 : 0;
    },
    ZREMRANGEBYSCORE: (k, min, maks) => {
      const e = lever(k);
      if (!e) return 0;
      let n = 0;
      for (const [m, s] of e.verdi) {
        if (s >= Number(min) && s <= Number(maks)) {
          e.verdi.delete(m);
          n++;
        }
      }
      return n;
    },
    ZCARD: (k) => lever(k)?.verdi.size ?? 0,
    EVAL: (_skript, _antall, k, forventet, ny, sekunder) => ((lever(k)?.verdi ?? null) === forventet ? kommando.SET(k, ny, "EX", sekunder) : 0),
  };
  return {
    async kjor(kommandoer) {
      sjekkNokler(kommandoer);
      antall += kommandoer.length;
      return kommandoer.map(([navn, ...arg]) => {
        const f = kommando[navn.toUpperCase()];
        if (!f) throw new Error(`Minnelageret kan ikke ${navn}`);
        return f(...arg);
      });
    },
    // For testene: hvor mange kommandoer som er kjørt, hvilke nøkler som lever, og levetiden deres.
    get antall() { return antall; },
    nokler: () => [...data.keys()].filter((k) => lever(k)),
    ttl: (k) => kommando.TTL(k),
  };
}
