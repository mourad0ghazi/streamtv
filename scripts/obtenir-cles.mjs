#!/usr/bin/env node
/**
 * Acquisition des clés d'API films (TMDb, OMDb) sans inscription.
 *
 * Le paquet `freekeys` ne fait rien de magique : il tire au hasard une clé dans
 * une liste publique codée en dur. Ces clés sont partagées par toute la
 * communauté, donc limitées en débit et révocables sans préavis. Ce script en
 * rassemble un petit pool, pour pouvoir changer de clé quand l'une est refusée,
 * et l'écrit dans `data/cles-api.json` (jamais versionné).
 *
 * Usage :
 *   node scripts/obtenir-cles.mjs                 pool de 12 clés par service
 *   node scripts/obtenir-cles.mjs --nombre 20
 *   node scripts/obtenir-cles.mjs --tmdb <clé> --omdb <clé>   (clé personnelle)
 *
 * `freekeys` est une dépendance de développement : le site n'en a aucune à
 * l'exécution. Sans le paquet, le script le dit et n'écrit rien.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const FICHIER = join(RACINE, "data", "cles-api.json");

function option(nom) {
  const argus = process.argv.slice(2);
  const i = argus.findIndex((a) => a === `--${nom}` || a.startsWith(`--${nom}=`));
  if (i < 0) return undefined;
  return argus[i].includes("=") ? argus[i].split("=").slice(1).join("=") : argus[i + 1];
}

const nombre = Math.max(1, Math.min(40, Number(option("nombre")) || 12));

async function chargerFreekeys() {
  try {
    const module = await import("freekeys");
    return module.default ?? module;
  } catch {
    return null;
  }
}

async function existant() {
  try {
    return JSON.parse(await readFile(FICHIER, "utf8"));
  } catch {
    return null;
  }
}

const freekeys = await chargerFreekeys();
const ancien = await existant();

const personnelles = { tmdb: option("tmdb"), omdb: option("omdb") };

if (!freekeys) {
  if (!personnelles.tmdb && !personnelles.omdb) {
    console.error("Le paquet freekeys n'est pas installé.");
    console.error("  npm install --save-dev freekeys");
    console.error("puis relancez : node scripts/obtenir-cles.mjs");
    console.error("Ou donnez directement vos clés : --tmdb <clé> --omdb <clé>");
    process.exit(1);
  }
}

const tmdb = new Set(ancien?.tmdb ?? []);
const omdb = new Set(ancien?.omdb ?? []);

if (personnelles.tmdb) tmdb.add(personnelles.tmdb.trim());
if (personnelles.omdb) omdb.add(personnelles.omdb.trim());

if (freekeys) {
  // Le paquet tire au hasard : quelques appels suffisent à couvrir son pool.
  for (let i = 0; i < nombre * 4 && (tmdb.size < nombre || omdb.size < nombre); i += 1) {
    const cles = await freekeys();
    if (cles?.tmdb_key) tmdb.add(cles.tmdb_key);
    if (cles?.imdb_key) omdb.add(cles.imdb_key);
  }
}

if (!tmdb.size && !omdb.size) {
  console.error("Aucune clé obtenue. Le paquet a répondu sans clé : rien n'a été écrit.");
  process.exit(1);
}

const bloc = {
  version: 1,
  date: new Date().toISOString(),
  origine: personnelles.tmdb || personnelles.omdb ? "clé personnelle et pool public" : "pool public freekeys",
  avertissement:
    "Clés publiques partagées : débit limité, révocation possible sans préavis. Pour un usage sérieux, créez votre clé TMDb et posez-la dans TMDB_API_KEY.",
  tmdb: [...tmdb],
  omdb: [...omdb]
};

await mkdir(join(RACINE, "data"), { recursive: true });
await writeFile(FICHIER, JSON.stringify(bloc, null, 2) + "\n", "utf8");

console.log(`Clés écrites dans data/cles-api.json : ${bloc.tmdb.length} TMDb, ${bloc.omdb.length} OMDb.`);
console.log("Ce fichier n'est pas versionné : il reste chez vous.");
if (!personnelles.tmdb) {
  console.log("Rappel : ces clés sont publiques. Pour un usage durable, préférez TMDB_API_KEY dans l'environnement.");
}
