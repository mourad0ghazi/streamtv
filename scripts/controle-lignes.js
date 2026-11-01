#!/usr/bin/env node
/**
 * Contrôle de longueur : aucun fichier de code au-delà de 900 lignes.
 *
 * Les fichiers de données (data/*.json) sont exclus : ce sont des catalogues
 * produits par l'import, pas du code, et leur longueur suit le nombre de
 * contenus. Tout le reste est mesuré, y compris les tests et la documentation.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIMITE = 900;
const IGNORES = new Set([".git", "node_modules", "_site", "amont", "coverage"]);
const EXTENSIONS = new Set([".js", ".mjs", ".css", ".html", ".md", ".json"]);
const EXCLUS = [/^data[/\\].*\.json$/, /^package-lock\.json$/];

async function parcourir(dossier, resultat) {
  for (const entree of await readdir(dossier, { withFileTypes: true })) {
    if (IGNORES.has(entree.name)) continue;
    const absolu = join(dossier, entree.name);
    if (entree.isDirectory()) {
      await parcourir(absolu, resultat);
      continue;
    }
    const cheminRelatif = relative(RACINE, absolu).split(sep).join("/");
    if (!EXTENSIONS.has(cheminRelatif.slice(cheminRelatif.lastIndexOf(".")))) continue;
    if (EXCLUS.some((motif) => motif.test(cheminRelatif))) continue;
    resultat.push(cheminRelatif);
  }
  return resultat;
}

const fichiers = await parcourir(RACINE, []);
const trop = [];
for (const fichier of fichiers) {
  const contenu = await readFile(join(RACINE, fichier), "utf8");
  const lignes = contenu.split("\n").length;
  if (lignes > LIMITE) trop.push({ fichier, lignes });
}

if (trop.length) {
  for (const { fichier, lignes } of trop) console.error(`  ${fichier} : ${lignes} lignes (limite ${LIMITE})`);
  console.error(`${trop.length} fichier(s) au-delà de ${LIMITE} lignes.`);
  process.exit(1);
}

console.log(`Contrôle de longueur : ${fichiers.length} fichiers, aucun au-delà de ${LIMITE} lignes.`);
