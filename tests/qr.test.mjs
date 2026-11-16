// QR-koden fra site/qr.mjs: versjon, størrelse, faste mønstre og formatinformasjon. At koden faktisk kan leses,
// sjekker tools/sjekk-qr.mjs med macOS' QR-leser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { qrModuler, qrSvg, formatBits, MAKS_TEGN } from "../site/qr.mjs";

const tekst = (lengde) => "x".repeat(lengde);

test("minste versjon som har plass, og feil når teksten er for lang", () => {
  for (const [lengde, versjon] of [[1, 1], [14, 1], [15, 2], [26, 2], [27, 3], [42, 3], [43, 4], [62, 4], [63, 5], [84, 5], [85, 6], [106, 6]]) {
    const q = qrModuler(tekst(lengde));
    assert.equal(q.versjon, versjon, `${lengde} tegn`);
    assert.equal(q.storrelse, 17 + 4 * versjon);
    assert.equal(q.moduler.length, q.storrelse);
    assert.ok(q.moduler.every((rad) => rad.length === q.storrelse && rad.every((v) => v === 0 || v === 1)));
  }
  assert.throws(() => qrModuler(tekst(MAKS_TEGN + 1)), /for lang/);
  assert.equal(qrModuler("ø".repeat(53)).versjon, 6, "æøå er to byte hver");
  assert.throws(() => qrModuler("ø".repeat(54)), /for lang/);
});

test("finnermønstrene, tidsmønsteret og den mørke modulen står der de skal", () => {
  for (const lengde of [10, 56, 106]) {
    const { moduler: m, storrelse: n, versjon } = qrModuler(tekst(lengde));
    for (const [x0, y0] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) {
        const d = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        assert.equal(m[y0 + dy][x0 + dx], d === 2 ? 0 : 1, `finner ved ${x0},${y0}`);
      }
    }
    for (let i = 8; i < n - 8; i++) {
      assert.equal(m[6][i], i % 2 === 0 ? 1 : 0, "tidsmønster i rad 6");
      assert.equal(m[i][6], i % 2 === 0 ? 1 : 0, "tidsmønster i kolonne 6");
    }
    assert.equal(m[n - 8][8], 1, "den mørke modulen");
    if (versjon >= 2) {
      assert.deepEqual(m[n - 9].slice(n - 9, n - 4), [1, 1, 1, 1, 1], "justeringsmønsteret, øverste rad");
      assert.deepEqual(m[n - 7].slice(n - 9, n - 4), [1, 0, 1, 0, 1], "justeringsmønsteret, midten");
    }
  }
});

test("formatinformasjonen sier nivå M og masken, er lik i begge kopiene og har gyldig BCH-kode", () => {
  const { moduler: m, storrelse: n, maske } = qrModuler("https://mariushagen.github.io/olsmaking/smak.html#ABC234");
  const forste = [0, 1, 2, 3, 4, 5, 7, 8].map((y) => m[y][8]).concat([7, 5, 4, 3, 2, 1, 0].map((x) => m[8][x]));
  const andre = [...Array(8)].map((_, i) => m[8][n - 1 - i]).concat([...Array(7)].map((_, i) => m[n - 7 + i][8]));
  const tall = (bits) => bits.reduce((s, b, i) => s | (b << i), 0);
  assert.equal(tall(forste), tall(andre));
  assert.equal(tall(forste), formatBits(maske));
  const ren = tall(forste) ^ 0x5412;
  assert.equal(ren >>> 13, 0b00, "nivå M");
  assert.equal((ren >>> 10) & 7, maske);
  let rest = ren;
  for (let i = 14; i >= 10; i--) if ((rest >>> i) & 1) rest ^= 0x537 << (i - 10);
  assert.equal(rest, 0, "BCH-koden går opp");
});

test("SVG-en har hvit kant på fire moduler og er mørk på hvitt", () => {
  const svg = qrSvg("Smak øl", { tittel: 'Bli med "nå"' });
  assert.match(svg, /viewBox="0 0 29 29"/);
  assert.match(svg, /<rect width="29" height="29" fill="#fff"\/>/);
  assert.match(svg, /fill="#000"/);
  assert.match(svg, /aria-label="Bli med &quot;nå&quot;"/);
});
