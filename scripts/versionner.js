#!/usr/bin/env node
/**
 * Version des modules dans les adresses.
 *
 * Une page qui ne s'ouvre qu'en vidant le cache est un bug : chaque module
 * porte donc la version du paquet dans son adresse, et le service worker tient
 * sa liste de préchargement à jour à partir des mêmes fichiers.
 *
 * Usage :
 *   node scripts/versionner.js --ecrire    met à jour les adresses et le service worker
 *   node scripts/versionner.js --verifier  échoue si une adresse ou une entrée manque
 */

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, extname, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(RACINE, "public");

const PAGES = ["/", "/chaines", "/anime", "/films", "/recherche", "/favoris"];
const FIXES = ["/manifeste.webmanifest", "/icone.svg"];

/** Tous les fichiers .js et .css servis, en chemins absolus d'URL. */
async function fichiersServis() {
  const resultat = [];
  async function parcourir(dossier) {
    const entrees = await readdir(dossier, { withFileTypes: true });
    for (const entree of entrees) {
      const absolu = join(dossier, entree.name);
      if (entree.isDirectory()) {
        await parcourir(absolu);
        continue;
      }
      const extension = extname(entree.name);
      if (extension !== ".js" && extension !== ".css") continue;
      resultat.push("/" + relative(PUBLIC, absolu).split(sep).join("/"));
    }
  }
  await parcourir(join(PUBLIC, "js"));
  await parcourir(join(PUBLIC, "css"));
  try {
    await stat(join(PUBLIC, "vendor", "hls.js"));
    resultat.push("/vendor/hls.js");
  } catch {
    /* pas de copie locale de hls.js : rien à versionner */
  }
  return resultat.sort();
}

async function fichiersTexte() {
  const textes = [join(PUBLIC, "index.html"), join(PUBLIC, "console.html"), join(PUBLIC, "sw.js")];
  async function parcourir(dossier) {
    for (const entree of await readdir(dossier, { withFileTypes: true })) {
      const absolu = join(dossier, entree.name);
      if (entree.isDirectory()) await parcourir(absolu);
      else if (entree.name.endsWith(".js")) textes.push(absolu);
    }
  }
  await parcourir(join(PUBLIC, "js"));
  return textes;
}

const REFERENCE = /(\/(?:js|css|vendor)\/[A-Za-z0-9._/-]+?\.(?:js|css))(\?v=[0-9A-Za-z.-]+)?/g;

function listerPrecache(fichiers, version) {
  // hls.js n'entre pas dans le préchargement : il pèse plus de 600 ko et ne
  // sert qu'au premier direct lancé. Il reste versionné dans son adresse.
  return [...PAGES, ...fichiers.filter((f) => !f.startsWith("/vendor/")).map((f) => `${f}?v=${version}`), ...FIXES];
}

async function ecrire(version) {
  const fichiers = await fichiersServis();

  for (const chemin of await fichiersTexte()) {
    const avant = await readFile(chemin, "utf8");
    const apres = avant.replace(REFERENCE, (_tout, cheminModule) => `${cheminModule}?v=${version}`);
    if (apres !== avant) await writeFile(chemin, apres);
  }

  const swChemin = join(PUBLIC, "sw.js");
  const sw = await readFile(swChemin, "utf8");
  const liste = listerPrecache(fichiers, version);
  const bloc = `const PRECACHE = [\n${liste.map((entree) => `  ${JSON.stringify(entree)}`).join(",\n")}\n];`;
  const misAJour = sw
    .replace(/const VERSION = "[^"]*";/, `const VERSION = "${version}";`)
    .replace(/const PRECACHE = \[[\s\S]*?\];/, bloc);
  if (misAJour !== sw) await writeFile(swChemin, misAJour);

  console.log(`version ${version} : ${fichiers.length} modules, ${liste.length} entrées de préchargement.`);
}

async function verifier(version) {
  const problemes = [];
  const fichiers = await fichiersServis();

  for (const chemin of await fichiersTexte()) {
    const texte = await readFile(chemin, "utf8");
    for (const correspondance of texte.matchAll(REFERENCE)) {
      const [tout, module, requete] = correspondance;
      if (chemin.endsWith("sw.js") && tout.includes("?v=")) continue;
      if (requete !== `?v=${version}`) {
        problemes.push(`${relative(RACINE, chemin)} : ${module} sans la version ${version}`);
      }
    }
  }

  const sw = await readFile(join(PUBLIC, "sw.js"), "utf8");
  const attendu = listerPrecache(fichiers, version);
  const bloc = /const PRECACHE = \[([\s\S]*?)\];/.exec(sw);
  const present = bloc ? [...bloc[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
  for (const entree of attendu) {
    if (!present.includes(entree)) problemes.push(`service worker : entrée absente ${entree}`);
  }
  for (const entree of present) {
    if (!attendu.includes(entree)) problemes.push(`service worker : entrée inattendue ${entree}`);
  }
  const versionSw = /const VERSION = "([^"]*)";/.exec(sw);
  if (versionSw?.[1] !== version) problemes.push(`service worker : version ${versionSw?.[1]} au lieu de ${version}`);

  if (problemes.length) {
    for (const probleme of problemes) console.error(`  ${probleme}`);
    console.error(`${problemes.length} problème(s) de version.`);
    process.exit(1);
  }
  console.log(`version ${version} : ${fichiers.length} modules et ${attendu.length} entrées conformes.`);
}

const version = JSON.parse(await readFile(join(RACINE, "package.json"), "utf8")).version;
if (process.argv.includes("--verifier")) await verifier(version);
else await ecrire(version);
