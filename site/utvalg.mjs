// Regner ut smakerekka fra data/juleol.json. Ingen tilgang til siden, så den kan testes med node --test.

export const NETT = "nett";
export const ALKOHOLFRITT = "Alkoholfritt";
// Så mange innsjekker skal til før Untappd-snittet veier like mye som snittet i smaksgruppa.
const SIKKER = 30;
// Lageret kan være et døgn gammelt, så et øl må ha litt mer på lager enn rekka trenger.
const MARGIN = 2;

const etterScore = (a, b) => b.justert - a.justert;
const sum = (liste, f) => liste.reduce((s, x) => s + f(x), 0);

// Rundt 7 cl per person, og 5 cl av øl på 10 % eller mer. Flaskene er nok når siden kan vise «ca. 7 cl» eller
// «ca. 5 cl»: krevde vi hele målet, fikk et sterkt øl på 33 cl dobbelt så mye til sju personer fordi én flaske ga 4,7 cl.
export function flasker(ol, personer) {
  const maal = ol.alkohol >= 10 ? 5 : 7;
  return Math.max(1, Math.ceil((personer * (maal - 0.5)) / ol.cl - 1e-9));
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
  return i < 0 ? 0 : (ol.lager?.[i] ?? 0);
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

// Det settet med nøyaktig n øl, høyst grenser[g] fra gruppe g, som gir høyest samlet score innenfor
// budsjettet. Dynamisk programmering over øl, antall fra gruppa, antall i alt og kroner, med et bitsett per
// øl for å finne tilbake til valgene. Noen millioner enkle steg.
function besteSett(grupper, n, budsjett, grenser) {
  const dyrest = (l, g) => sum(l.map((o) => o.kostnad).sort((a, b) => b - a).slice(0, grenser[g]), (x) => x);
  const B = Math.min(budsjett, sum(grupper.map((l, g) => dyrest(l, g)), (x) => x));
  const R = B + 1;          // én rad per antall i alt, én kolonne per krone
  const S = (n + 1) * R;    // tilstander for ett antall fra gruppa
  // dp[m * R + b]: høyeste score med m øl som koster høyst b kroner.
  let dp = new Float64Array(S).fill(-Infinity);
  dp.fill(0, 0, R);
  const spor = [];
  for (const [g, liste] of grupper.entries()) {
    const K = Math.min(grenser[g], liste.length);
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

// Låste øl med dagens tall. Et øl som ikke lenger finnes i dataene, kommer fra det som ble lagret, og merkes.
function medLaste(data, valg, laste, snitt) {
  return laste.map((lagret) => {
    const naa = data.ol.find((o) => o.id === lagret.id);
    const m = medTall(naa ?? lagret, valg.personer, snitt);
    return naa ? { ...m, utsolgt: !tilgjengelig(data, m, valg.butikk) } : { ...m, mangler: true };
  });
}

// valg: { butikk: butikknavn eller NETT, personer, budsjett, antall, alkoholfrie, typer, laste }
// typer er navnene på smaksgruppene som skal være med. Mangler den, er alle med.
// alkoholfrie er et antall. Gamle lenker har alkoholfritt: true, som betyr ett.
// laste er øl som skal være med uansett, som hele objekter, så de kan komme fra en lagret rekke.
export function velg(data, valg) {
  const budsjett = Math.floor(valg.budsjett);
  const onsket = valg.alkoholfrie ?? (valg.alkoholfritt ? 1 : 0);
  const laste = medLaste(data, valg, valg.laste ?? [], gruppesnitt(data));
  const lasteOl = laste.filter((o) => o.gruppe !== ALKOHOLFRITT);
  const lasteAf = laste.filter((o) => o.gruppe === ALKOHOLFRITT);
  const ingen = { rekke: [], alkoholfrie: [] };
  if (lasteOl.length > valg.antall) {
    return { ...ingen, feil: `Du har låst ${lasteOl.length} øl, men valgt ${valg.antall}. Velg flere øl, eller lås opp noen.` };
  }
  if (lasteAf.length > onsket) {
    return { ...ingen, feil: `Du har låst ${lasteAf.length} alkoholfrie, men valgt ${onsket}. Velg flere alkoholfrie, eller lås opp noen.` };
  }
  const lastKost = sum(laste, (o) => o.kostnad);
  if (lastKost > budsjett) {
    return { ...ingen, feil: `De låste ølene koster ${lastKost} kr, mer enn budsjettet. Øk budsjettet, eller lås opp noen.` };
  }
  const lastId = new Set(laste.map((o) => o.id));
  const alle = kandidater(data, valg).filter((o) => !lastId.has(o.id));
  const af = alle.filter((o) => o.gruppe === ALKOHOLFRITT);
  const etterKostnad = [...af].sort((a, b) => a.kostnad - b.kostnad);
  const besteSomPasser = (k) => {
    const ut = [];
    let igjen = budsjett - lastKost;
    for (const o of [...af].sort(etterScore)) {
      if (ut.length < k && o.kostnad <= igjen) {
        ut.push(o);
        igjen -= o.kostnad;
      }
    }
    return ut;
  };
  // De beste alkoholfrie først. Går ikke rekka opp da, prøves billigere alkoholfrie, og så færre.
  // De låste alkoholfrie er med i alle forsøkene, og bare de ledige plassene prøves.
  const forsok = [];
  // De beste som passer, teller bare når det ble så mange som ønsket; ellers går forsøket med de billigste først.
  for (let k = Math.min(onsket - lasteAf.length, af.length); k >= 0; k--) {
    const beste = besteSomPasser(k);
    if (beste.length === k) forsok.push(beste);
    forsok.push(etterKostnad.slice(0, k));
  }
  let forste = null;
  for (const ledige of forsok) {
    const alkoholfrie = [...lasteAf, ...ledige];
    const kost = sum(alkoholfrie, (o) => o.kostnad);
    if (kost > budsjett) continue;
    const r = { ...rekkeFor(data, valg, alle, budsjett - kost, lasteOl), alkoholfrie };
    if (!r.feil) return r;
    if (r.minstBudsjett != null) r.minstBudsjett += kost;
    forste ??= r;
    // Feil som ikke handler om budsjettet, blir ikke bedre av andre alkoholfrie.
    if (r.minstBudsjett == null) return r;
  }
  if (forste?.minstBudsjett != null) {
    forste.feil = `Budsjettet holder ikke til ${valg.antall} øl. Det trengs minst ${forste.minstBudsjett} kr, eller færre øl.`;
  }
  return forste;
}

// Den beste rekka for typene, antallet og budsjettet, uten de alkoholfrie. De låste er med uansett og teller
// i grensen per type: hver type får grensen minus sine låste, og bare de ledige plassene velges.
function rekkeFor(data, valg, alle, budsjett, laste = []) {
  const typer = valg.typer ? data.rekkefolge.filter((g) => valg.typer.includes(g)) : data.rekkefolge;
  if (typer.length === 0 && laste.length === 0) return { rekke: [], feil: "Velg minst én type." };
  const ordne = (r) => r.sort((a, b) => data.rekkefolge.indexOf(a.gruppe) - data.rekkefolge.indexOf(b.gruppe) || a.alkohol - b.alkohol);
  const lastKost = sum(laste, (o) => o.kostnad);
  const n = valg.antall - laste.length;
  const lastI = (g) => laste.filter((o) => o.gruppe === g).length;
  const lister = typer.map((g) => alle.filter((o) => o.gruppe === g));
  const finnes = sum(lister, (l) => l.length);
  if (n > finnes) {
    const mulig = finnes + laste.length;
    return { rekke: [], maksAntall: mulig,
      feil: `Bare ${mulig} øl av disse typene passer her. Velg ${mulig} øl eller færre, eller flere typer.` };
  }
  // Grensen regnes for hele rekka, med de låste, og er aldri lavere enn de låste av én type.
  const fulle = typer.map((g, i) => lister[i].length + lastI(g)).filter((x) => x > 0).map((x) => ({ length: x }));
  // Låste øl fra typer som ikke er valgt, tar plasser, men hører ikke til noen av de valgte typene.
  const iValgte = valg.antall - laste.filter((o) => !typer.includes(o.gruppe)).length;
  const maks = Math.max(fulle.length ? maksPerGruppe(fulle, iValgte) : 1, ...laste.map((o) => lastI(o.gruppe)));
  if (n === 0) {
    if (lastKost > budsjett) return { rekke: [], minstBudsjett: lastKost, feil: "budsjett" };
    return { rekke: ordne([...laste]), maksPerType: maks, feil: null };
  }
  const med = typer.map((g, i) => ({ liste: lister[i], grense: maks - lastI(g) })).filter((x) => x.liste.length > 0 && x.grense > 0);
  const grenser = med.map((x) => x.grense);
  const grupper = med.map((x) => utenDominerte(x.liste, x.grense));
  const billigst = sum(grupper.flatMap((l, g) => l.slice(0, grenser[g]).map((o) => o.kostnad)).sort((a, b) => a - b).slice(0, n), (x) => x);
  const rekke = billigst <= budsjett - lastKost ? besteSett(grupper, n, budsjett - lastKost, grenser) : null;
  if (!rekke) return { rekke: [], minstBudsjett: billigst + lastKost, feil: "budsjett" };
  return { rekke: ordne([...laste, ...rekke]), maksPerType: maks, feil: null };
}

// De beste andre ølene fra samme gruppe som holder budsjettet når de byttes inn på denne plassen.
export function bytter(data, valg, rekke, alkoholfrie, plass, maks = 3) {
  const naa = rekke[plass];
  const brukt = sum(rekke, (o) => o.kostnad) + sum(alkoholfrie ?? [], (o) => o.kostnad);
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
