// Regner ut smakerekka fra data/juleol.json. Ingen tilgang til siden, så den kan testes med node --test.

export const NETT = "nett";
export const ALKOHOLFRITT = "Alkoholfritt";
// Så mange innsjekker skal til før Untappd-snittet veier like mye som snittet i smaksgruppa.
const SIKKER = 30;
// Lageret kan være et døgn gammelt, så et øl må ha litt mer på lager enn rekka trenger.
const MARGIN = 2;

const etterScore = (a, b) => b.justert - a.justert;
const sum = (liste, f) => liste.reduce((s, x) => s + f(x), 0);

// Rundt 7 cl per person, og 5 cl av øl på 10 % eller mer.
export function flasker(ol, personer) {
  const maal = ol.alkohol >= 10 ? 5 : 7;
  return Math.max(1, Math.ceil((personer * maal) / ol.cl - 1e-9));
}

export function justertScore(score, innsjekker, snitt) {
  return (innsjekker * score + SIKKER * snitt) / (innsjekker + SIKKER);
}

export function gruppesnitt(data) {
  const s = {};
  for (const o of data.ol) {
    if (o.score == null) continue;
    s[o.gruppe] ??= { sum: 0, n: 0 };
    s[o.gruppe].sum += o.score;
    s[o.gruppe].n += 1;
  }
  return Object.fromEntries(Object.entries(s).map(([g, { sum, n }]) => [g, sum / n]));
}

export function paLager(data, ol, butikk) {
  const i = data.butikker.indexOf(butikk);
  return i < 0 ? 0 : (ol.lager[i] ?? 0);
}

function medTall(o, personer, snitt) {
  const f = flasker(o, personer);
  return {
    ...o,
    flasker: f,
    // Hele kroner, rundet opp, så rekka aldri går over budsjettet.
    kostnad: Math.ceil(f * o.pris),
    justert: o.score == null ? null : justertScore(o.score, o.innsjekker, snitt[o.gruppe] ?? o.score),
  };
}

function tilgjengelig(data, o, butikk) {
  if (butikk === NETT) return o.nett;
  return paLager(data, o, butikk) >= o.flasker + MARGIN;
}

// Ølene som kan være med for disse valgene, med antall flasker, kostnad og justert score.
export function kandidater(data, valg) {
  const snitt = gruppesnitt(data);
  return data.ol
    .map((o) => medTall(o, valg.personer, snitt))
    .filter((o) => o.score != null && tilgjengelig(data, o, valg.butikk));
}

// Innenfor én gruppe er et øl bare aktuelt hvis ingen billigere har like høy score.
function pareto(liste) {
  const ut = [];
  let best = -Infinity;
  for (const o of [...liste].sort((a, b) => a.kostnad - b.kostnad || b.justert - a.justert)) {
    if (o.justert > best) {
      ut.push(o);
      best = o.justert;
    }
  }
  return ut;
}

// Det settet med nøyaktig n øl, høyst ett per gruppe, som gir høyest samlet score innenfor budsjettet.
// Dynamisk programmering over grupper, antall og kroner: noen millioner enkle steg.
function besteSett(grupper, n, budsjett) {
  const B = Math.min(budsjett, sum(grupper, (l) => l[l.length - 1].kostnad));
  const dp = Array.from({ length: n + 1 }, (_, k) => new Float64Array(B + 1).fill(k === 0 ? 0 : -Infinity));
  const valgt = [];
  for (let g = 0; g < grupper.length; g++) {
    const liste = grupper[g];
    const v = Array.from({ length: n + 1 }, () => new Int16Array(B + 1));
    // Synkende antall, så dp[k - 1] fortsatt er fra gruppene før: høyst ett øl fra denne gruppa.
    for (let k = Math.min(n, g + 1); k >= 1; k--) {
      const naa = dp[k], foer = dp[k - 1];
      for (let c = 0; c < liste.length; c++) {
        const { kostnad, justert } = liste[c];
        for (let b = kostnad; b <= B; b++) {
          const t = foer[b - kostnad] + justert;
          if (t > naa[b]) {
            naa[b] = t;
            v[k][b] = c + 1;
          }
        }
      }
    }
    valgt.push(v);
  }
  if (dp[n][B] === -Infinity) return null;
  const rekke = [];
  let k = n, b = B;
  for (let g = grupper.length - 1; g >= 0 && k > 0; g--) {
    const c = valgt[g][k][b];
    if (c) {
      const o = grupper[g][c - 1];
      rekke.push(o);
      k -= 1;
      b -= o.kostnad;
    }
  }
  return rekke.reverse();
}

// valg: { butikk: butikknavn eller NETT, personer, budsjett, antall, alkoholfritt }
export function velg(data, valg) {
  const alle = kandidater(data, valg);
  let budsjett = Math.floor(valg.budsjett);
  let alkoholfritt = null;
  if (valg.alkoholfritt) {
    alkoholfritt = alle.filter((o) => o.gruppe === ALKOHOLFRITT && o.kostnad <= budsjett).sort(etterScore)[0] ?? null;
    if (alkoholfritt) budsjett -= alkoholfritt.kostnad;
  }
  const grupper = data.rekkefolge.map((g) => pareto(alle.filter((o) => o.gruppe === g))).filter((l) => l.length > 0);
  const n = valg.antall;
  if (n > grupper.length) {
    return { rekke: [], alkoholfritt, maksAntall: grupper.length,
      feil: `Bare ${grupper.length} smaksgrupper har øl som passer her. Velg ${grupper.length} øl eller færre.` };
  }
  const billigst = sum(grupper.map((l) => l[0].kostnad).sort((a, b) => a - b).slice(0, n), (x) => x);
  const rekke = billigst <= budsjett ? besteSett(grupper, n, budsjett) : null;
  if (!rekke) {
    const trengs = billigst + (alkoholfritt?.kostnad ?? 0);
    return { rekke: [], alkoholfritt, minstBudsjett: trengs,
      feil: `Budsjettet holder ikke til ${n} øl. Det trengs minst ${trengs} kr, eller færre øl.` };
  }
  return { rekke, alkoholfritt, feil: null };
}

// De beste andre ølene fra samme gruppe som holder budsjettet når de byttes inn på denne plassen.
export function bytter(data, valg, rekke, alkoholfritt, plass, maks = 3) {
  const naa = rekke[plass];
  const brukt = sum(rekke, (o) => o.kostnad) + (alkoholfritt?.kostnad ?? 0);
  const rom = Math.floor(valg.budsjett) - brukt + naa.kostnad;
  const iRekka = new Set(rekke.map((o) => o.id));
  return kandidater(data, valg)
    .filter((o) => o.gruppe === naa.gruppe && !iRekka.has(o.id) && o.kostnad <= rom)
    .sort(etterScore)
    .slice(0, maks);
}

// Rekka fra en delt lenke: de samme ølene med dagens pris og lager. Øl som ikke lenger holder, merkes.
export function fraVarenumre(data, valg, ider) {
  const snitt = gruppesnitt(data);
  return ider
    .map((id) => data.ol.find((o) => o.id === id))
    .filter(Boolean)
    .map((o) => {
      const m = medTall(o, valg.personer, snitt);
      return { ...m, utsolgt: !tilgjengelig(data, m, valg.butikk) };
    });
}
