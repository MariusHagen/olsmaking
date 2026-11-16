// Lar macOS' egen QR-leser (Vision, via swift) lese QR-koder fra site/qr.mjs, én i hver versjon fra 1 til 6.
// Kjøres for hånd på en Mac: node tools/sjekk-qr.mjs. Gjør ingen kall ut.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { qrModuler } from "../site/qr.mjs";

const LENKE = "https://mariushagen.github.io/olsmaking/smak.html#ABC234";
const TEKSTER = [
  "Smak øl",
  "http://10.0.0.5:8000/smak",
  "http://10.143.136.81:8000/smak.html#C9TL22",
  LENKE,
  `${LENKE}&juleøl=${"x".repeat(13)}`,
  `${LENKE}&${"y".repeat(49)}`,
];

const SWIFT = String.raw`
import Foundation
import Vision
let inn = FileHandle.standardInput.readDataToEndOfFile()
let koder = try! JSONSerialization.jsonObject(with: inn) as! [[[Int]]]
for moduler in koder {
  let n = moduler.count, kant = 4, skala = 8, side = (n + 2 * kant) * skala
  var piksler = [UInt8](repeating: 255, count: side * side)
  for y in 0..<n { for x in 0..<n where moduler[y][x] == 1 {
    for dy in 0..<skala { for dx in 0..<skala { piksler[((y + kant) * skala + dy) * side + (x + kant) * skala + dx] = 0 } }
  } }
  let bilde = CGImage(width: side, height: side, bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: side,
    space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGBitmapInfo(rawValue: 0),
    provider: CGDataProvider(data: Data(piksler) as CFData)!, decode: nil, shouldInterpolate: false, intent: .defaultIntent)!
  let foresporsel = VNDetectBarcodesRequest()
  foresporsel.symbologies = [.qr]
  try! VNImageRequestHandler(cgImage: bilde).perform([foresporsel])
  let lest = foresporsel.results?.first?.payloadStringValue ?? ""
  print(lest.data(using: .utf8)!.base64EncodedString())
}
`;

const koder = TEKSTER.map((t) => ({ tekst: t, ...qrModuler(t) }));
const versjoner = koder.map((k) => k.versjon);
if (versjoner.join() !== "1,2,3,4,5,6") throw new Error(`Tekstene gir versjon ${versjoner.join(", ")}, ikke 1 til 6.`);

const mappe = mkdtempSync(join(tmpdir(), "sjekk-qr-"));
try {
  const fil = join(mappe, "les.swift");
  writeFileSync(fil, SWIFT);
  const ut = execFileSync("swift", [fil], { input: JSON.stringify(koder.map((k) => k.moduler)), encoding: "utf8" });
  const lest = ut.trim().split("\n").map((l) => Buffer.from(l, "base64").toString("utf8"));
  let feil = 0;
  koder.forEach((k, i) => {
    const ok = lest[i] === k.tekst;
    if (!ok) feil++;
    console.log(`versjon ${k.versjon}, maske ${k.maske}, ${k.tekst.length} tegn: ${ok ? "lest riktig" : `FEIL, leste «${lest[i] ?? ""}»`}`);
  });
  if (feil) process.exit(1);
} finally {
  rmSync(mappe, { recursive: true, force: true });
}
