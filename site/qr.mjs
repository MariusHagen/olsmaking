// QR-kode for lenken til smakerunden, uten bibliotek: byte-modus, feilretting M (det nest laveste av fire
// nivåer) og versjon 1 til 6, som rommer 106 tegn. Lenken er rundt 56 tegn. Ingen tilgang til siden, så den
// testes med node --test og leses av macOS' QR-leser med tools/sjekk-qr.mjs.

// Per versjon: antall dataord og feilrettingsord per blokk, og antall blokker, for nivå M.
const BLOKKER = [null, [16, 10, 1], [28, 16, 1], [44, 26, 1], [32, 18, 2], [43, 24, 2], [27, 16, 4]];
export const MAKS_TEGN = 106;

// Gange i GF(256) med polynomet x^8 + x^4 + x^3 + x^2 + 1, som QR-koder bruker.
function gang(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function generator(grad) {
  const g = new Array(grad).fill(0);
  g[grad - 1] = 1;
  let rot = 1;
  for (let i = 0; i < grad; i++) {
    for (let j = 0; j < grad; j++) {
      g[j] = gang(g[j], rot);
      if (j + 1 < grad) g[j] ^= g[j + 1];
    }
    rot = gang(rot, 2);
  }
  return g;
}

function feilretting(data, grad) {
  const g = generator(grad);
  const rest = new Array(grad).fill(0);
  for (const b of data) {
    const faktor = b ^ rest.shift();
    rest.push(0);
    g.forEach((k, i) => { rest[i] ^= gang(k, faktor); });
  }
  return rest;
}

// Dataordene med feilretting, flettet blokk for blokk slik standarden krever.
function kodeord(bytes, versjon) {
  const [perBlokk, ecPerBlokk, blokker] = BLOKKER[versjon];
  const kapasitet = perBlokk * blokker * 8;
  const bits = [];
  const legg = (verdi, lengde) => { for (let i = lengde - 1; i >= 0; i--) bits.push((verdi >>> i) & 1); };
  legg(0b0100, 4);
  legg(bytes.length, 8);
  for (const b of bytes) legg(b, 8);
  legg(0, Math.min(4, kapasitet - bits.length));
  legg(0, (8 - (bits.length % 8)) % 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((s, b) => (s << 1) | b, 0));
  for (let fyll = 0xec; data.length < perBlokk * blokker; fyll ^= 0xec ^ 0x11) data.push(fyll);
  const deler = Array.from({ length: blokker }, (_, i) => data.slice(i * perBlokk, (i + 1) * perBlokk));
  const ec = deler.map((d) => feilretting(d, ecPerBlokk));
  const ut = [];
  for (let i = 0; i < perBlokk; i++) for (const d of deler) ut.push(d[i]);
  for (let i = 0; i < ecPerBlokk; i++) for (const e of ec) ut.push(e[i]);
  return ut;
}

const MASKER = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

// Formatinformasjonen: nivå M (00) og masken, med BCH-kode og standardens XOR-maske.
export function formatBits(maske) {
  const data = maske;
  let rest = data;
  for (let i = 0; i < 10; i++) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
  return ((data << 10) | rest) ^ 0x5412;
}

// Poeng for hvor vanskelig koden er å lese, etter standardens fire regler. Masken med lavest poeng brukes.
function straff(m) {
  const n = m.length;
  let p = 0;
  const linjer = [...m, ...m.map((_, x) => m.map((rad) => rad[x]))];
  for (const l of linjer) {
    for (let i = 0, lop = 1; i < n; i++, lop++) {
      if (i + 1 < n && l[i + 1] === l[i]) continue;
      if (lop >= 5) p += lop - 2;
      lop = 0;
    }
    const s = l.join("");
    for (const monster of ["10111010000", "00001011101"]) for (let i = s.indexOf(monster); i >= 0; i = s.indexOf(monster, i + 1)) p += 40;
  }
  for (let y = 0; y + 1 < n; y++) for (let x = 0; x + 1 < n; x++) {
    const v = m[y][x];
    if (m[y][x + 1] === v && m[y + 1][x] === v && m[y + 1][x + 1] === v) p += 3;
  }
  const morke = m.flat().filter(Boolean).length;
  p += Math.floor(Math.abs(morke * 20 - n * n * 10) / (n * n)) * 10;
  return p;
}

// Modulene som rader med 0 (lys) og 1 (mørk), uten den hvite kanten rundt.
export function qrModuler(tekst) {
  const bytes = [...new TextEncoder().encode(tekst)];
  const versjon = BLOKKER.findIndex((b) => b && bytes.length <= b[0] * b[2] - 2);
  if (versjon < 1) throw new Error(`Teksten er for lang for QR-koden (høyst ${MAKS_TEGN} tegn).`);
  const n = 17 + 4 * versjon;
  const m = Array.from({ length: n }, () => new Array(n).fill(0));
  const fast = Array.from({ length: n }, () => new Array(n).fill(false));
  const sett = (x, y, mork) => { m[y][x] = mork ? 1 : 0; fast[y][x] = true; };

  for (let i = 0; i < n; i++) { sett(6, i, i % 2 === 0); sett(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < n && y >= 0 && y < n) sett(x, y, d !== 2 && d !== 4);
    }
  }
  if (versjon >= 2) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) sett(n - 7 + dx, n - 7 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const tegnFormat = (bits) => {
    const bit = (i) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) sett(8, i, bit(i));
    sett(8, 7, bit(6));
    sett(8, 8, bit(7));
    sett(7, 8, bit(8));
    for (let i = 9; i < 15; i++) sett(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) sett(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) sett(8, n - 15 + i, bit(i));
    sett(8, n - 8, true);
  };
  tegnFormat(0);

  const ord = kodeord(bytes, versjon);
  let i = 0;
  for (let hoyre = n - 1; hoyre >= 1; hoyre -= 2) {
    if (hoyre === 6) hoyre = 5;
    for (let steg = 0; steg < n; steg++) {
      for (let j = 0; j < 2; j++) {
        const x = hoyre - j;
        const y = ((hoyre + 1) & 2) === 0 ? n - 1 - steg : steg;
        if (fast[y][x] || i >= ord.length * 8) continue;
        m[y][x] = (ord[i >>> 3] >>> (7 - (i & 7))) & 1;
        i++;
      }
    }
  }

  let beste = null;
  for (let maske = 0; maske < 8; maske++) {
    const kopi = m.map((rad, y) => rad.map((v, x) => (!fast[y][x] && MASKER[maske](x, y) ? v ^ 1 : v)));
    const bits = formatBits(maske);
    const lagret = m.map((rad) => [...rad]);
    for (let y = 0; y < n; y++) m[y] = kopi[y];
    tegnFormat(bits);
    const p = straff(m);
    if (!beste || p < beste.p) beste = { p, maske, moduler: m.map((rad) => [...rad]) };
    for (let y = 0; y < n; y++) m[y] = lagret[y];
  }
  return { versjon, storrelse: n, maske: beste.maske, moduler: beste.moduler };
}

// SVG med hvit kant på fire moduler, som standarden krever, og mørke moduler på hvitt i både lyst og mørkt tema.
export function qrSvg(tekst, { tittel = "QR-kode" } = {}) {
  const { storrelse: n, moduler } = qrModuler(tekst);
  const kant = 4, side = n + 2 * kant;
  let sti = "";
  moduler.forEach((rad, y) => rad.forEach((v, x) => { if (v) sti += `M${x + kant} ${y + kant}h1v1h-1z`; }));
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges" role="img" aria-label="${esc(tittel)}">`
    + `<rect width="${side}" height="${side}" fill="#fff"/><path d="${sti}" fill="#000"/></svg>`;
}
