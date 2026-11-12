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

// Et øl kan bare være med hvis færre enn «maks» andre i gruppa er minst like billige og minst like gode.
// Lista kommer ut sortert på kostnad.
function utenDominerte(liste, maks) {
  const sortert = [...liste].sort((a, b) => a.kostnad - b.kostnad || b.justert - a.justert);
  return sortert.filter((o, i) => sortert.slice(0, i).filter((x) => x.justert >= o.justert).length < maks);
}

// Høyst så mange øl per gruppe: ett når det er minst like mange grupper som øl, ellers så jevnt som mulig,
// og litt flere der andre grupper har for få øl til å fylle sin del.
function maksPerGruppe(lister, n) {
  for (let maks = Math.max(1, Math.ceil(n / lister.length)); maks < n; maks++) {
    if (sum(lister, (l) => Math.min(maks, l.length)) >= n) return maks;
  }
  return n;
}

// Det settet med nøyaktig n øl, høyst «maks» per gruppe, som gir høyest samlet score innenfor budsjettet.
// Dynamisk programmering over øl, antall fra gruppa, antall i alt og kroner, med et bitsett per øl for å
// finne tilbake til valgene. Noen millioner enkle steg.
function besteSett(grupper, n, budsjett, maks) {
  const dyrest = (l) => sum(l.map((o) => o.kostnad).sort((a, b) => b - a).slice(0, maks), (x) => x);
  const B = Math.min(budsjett, sum(grupper, dyrest));
  const R = B + 1;          // én rad per antall i alt, én kolonne per krone
  const S = (n + 1) * R;    // tilstander for ett antall fra gruppa
  // dp[m * R + b]: høyeste score med m øl som koster høyst b kroner.
  let dp = new Float64Array(S).fill(-Infinity);
  dp.fill(0, 0, R);
  const spor = [];
  for (const liste of grupper) {
    const K = Math.min(maks, liste.length);
    const lag = [dp, ...Array.from({ length: K }, () => new Float64Array(S).fill(-Infinity))];
    const bits = [];
    for (const o of liste) {
      const bit = new Uint8Array(Math.ceil(((K + 1) * S) / 8));
      // Synkende antall fra gruppa, så lag[k - 1] ennå ikke har tatt med dette ølet: hvert øl brukes høyst én gang.
      for (let k = K; k >= 1; k--) {
        const naa = lag[k], foer = lag[k - 1];
        for (let m = n; m >= 1; m--) {
          const iN = m * R, iF = (m - 1) * R - o.kostnad;
          for (let b = B; b >= o.kostnad; b--) {
            const t = foer[iF + b] + o.justert;
            if (t > naa[iN + b]) {
              naa[iN + b] = t;
              const idx = k * S + iN + b;
              bit[idx >> 3] |= 1 << (idx & 7);
            }
          }
        }
      }
      bits.push(bit);
    }
    const ny = new Float64Array(S).fill(-Infinity);
    const kValg = new Uint8Array(S);
    for (let k = 0; k <= K; k++) {
      for (let i = 0; i < S; i++) {
        if (lag[k][i] > ny[i]) {
          ny[i] = lag[k][i];
          kValg[i] = k;
        }
      }
    }
    spor.push({ liste, kValg, bits });
    dp = ny;
  }
  if (dp[n * R + B] === -Infinity) return null;

  // Baklengs: hvor mange som kom fra hver gruppe, og innenfor gruppa det siste ølet som forbedret tilstanden.
  const rekke = [];
  let m = n, b = B;
  for (let g = spor.length - 1; g >= 0; g--) {
    const { liste, kValg, bits } = spor[g];
    let k = kValg[m * R + b];
    for (let t = liste.length - 1; t >= 0 && k > 0; t--) {
      const idx = k * S + m * R + b;
      if (bits[t][idx >> 3] & (1 << (idx & 7))) {
        rekke.push(liste[t]);
        k -= 1;
        m -= 1;
        b -= liste[t].kostnad;
      }
    }
  }
  return rekke;
}

// valg: { butikk: butikknavn eller NETT, personer, budsjett, antall, alkoholfritt, typer }
// typer er navnene på smaksgruppene som skal være med. Mangler den, er alle med.
export function velg(data, valg) {
  const alle = kandidater(data, valg);
  let budsjett = Math.floor(valg.budsjett);
  let alkoholfritt = null;
  if (valg.alkoholfritt) {
    alkoholfritt = alle.filter((o) => o.gruppe === ALKOHOLFRITT && o.kostnad <= budsjett).sort(etterScore)[0] ?? null;
    if (alkoholfritt) budsjett -= alkoholfritt.kostnad;
  }
  const typer = valg.typer ? data.rekkefolge.filter((g) => valg.typer.includes(g)) : data.rekkefolge;
  if (typer.length === 0) return { rekke: [], alkoholfritt, feil: "Velg minst én type." };
  const lister = typer.map((g) => alle.filter((o) => o.gruppe === g)).filter((l) => l.length > 0);
  const n = valg.antall;
  const finnes = sum(lister, (l) => l.length);
  if (n > finnes) {
    return { rekke: [], alkoholfritt, maksAntall: finnes,
      feil: `Bare ${finnes} øl av disse typene passer her. Velg ${finnes} øl eller færre, eller flere typer.` };
  }
  const maks = maksPerGruppe(lister, n);
  const grupper = lister.map((l) => utenDominerte(l, maks));
  const billigst = sum(grupper.flatMap((l) => l.slice(0, maks).map((o) => o.kostnad)).sort((a, b) => a - b).slice(0, n), (x) => x);
  const rekke = billigst <= budsjett ? besteSett(grupper, n, budsjett, maks) : null;
  if (!rekke) {
    const trengs = billigst + (alkoholfritt?.kostnad ?? 0);
    return { rekke: [], alkoholfritt, minstBudsjett: trengs,
      feil: `Budsjettet holder ikke til ${n} øl. Det trengs minst ${trengs} kr, eller færre øl.` };
  }
  rekke.sort((a, b) => data.rekkefolge.indexOf(a.gruppe) - data.rekkefolge.indexOf(b.gruppe) || a.alkohol - b.alkohol);
  return { rekke, alkoholfritt, maksPerType: maks, feil: null };
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
