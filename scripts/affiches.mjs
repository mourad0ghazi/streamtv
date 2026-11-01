/**
 * Fabrique les affiches SVG du catalogue de démonstration.
 * Chaque affiche est un motif géométrique tiré d'une graine : même graine,
 * même affiche. Aucune image externe, aucune police distante, aucun dégradé.
 *
 * Usage : node scripts/affiches.mjs
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const SORTIE = join(RACINE, "public", "affiches");

const FOND = "#14181c";
const TRAIT = "#2a3238";
const ACCENT = "#e0821f";
const CLAIR = "#8fa0ac";

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
function graine(s) {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function affiche(nom, germe, motif) {
  const r = graine(germe);
  const piece = [];
  if (motif === "arcs") {
    for (let i = 0; i < 5; i += 1) {
      const rayon = 90 + i * 62;
      piece.push(
        `<circle cx="200" cy="${330 + i * 12}" r="${rayon}" fill="none" stroke="${i === 2 ? ACCENT : TRAIT}" stroke-width="${i === 2 ? 6 : 2}"/>`
      );
    }
  } else if (motif === "bandes") {
    for (let i = 0; i < 9; i += 1) {
      const y = 70 + i * 58;
      const largeur = 120 + Math.floor(r() * 200);
      piece.push(
        `<rect x="${40 + Math.floor(r() * 60)}" y="${y}" width="${largeur}" height="10" fill="${i === 4 ? ACCENT : TRAIT}"/>`
      );
    }
  } else if (motif === "colonnes") {
    for (let i = 0; i < 6; i += 1) {
      const h = 120 + Math.floor(r() * 300);
      piece.push(
        `<rect x="${46 + i * 54}" y="${520 - h}" width="26" height="${h}" fill="${i === 3 ? ACCENT : TRAIT}"/>`
      );
    }
  } else {
    for (let i = 0; i < 7; i += 1) {
      const cote = 40 + Math.floor(r() * 150);
      const x = Math.floor(r() * 300);
      const y = 80 + Math.floor(r() * 380);
      piece.push(
        `<rect x="${x}" y="${y}" width="${cote}" height="${cote}" fill="none" stroke="${i % 3 === 0 ? ACCENT : TRAIT}" stroke-width="${i % 3 === 0 ? 5 : 2}" transform="rotate(${Math.floor(r() * 40) - 20} ${x + cote / 2} ${y + cote / 2})"/>`
      );
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" width="400" height="600" role="img">
<title>Affiche de ${nom}</title>
<rect width="400" height="600" fill="${FOND}"/>
<rect x="0" y="556" width="400" height="4" fill="${ACCENT}"/>
${piece.join("\n")}
<text x="40" y="60" fill="${CLAIR}" font-family="ui-monospace, monospace" font-size="15" letter-spacing="3">STREAMTV</text>
</svg>
`;
  return svg;
}

const AFFICHES = [
  ["fi-0001.svg", 11, "arcs"],
  ["fi-0002.svg", 23, "bandes"],
  ["fi-0003.svg", 37, "colonnes"],
  ["fi-0004.svg", 41, "carres"],
  ["an-0001.svg", 53, "carres"],
  ["an-0002.svg", 67, "arcs"],
  ["an-0003.svg", 79, "colonnes"]
];

await mkdir(SORTIE, { recursive: true });
for (const [fichier, germe, motif] of AFFICHES) {
  await writeFile(join(SORTIE, fichier), affiche(fichier.replace(".svg", ""), germe, motif));
}
console.log(`${AFFICHES.length} affiches écrites dans public/affiches/`);
