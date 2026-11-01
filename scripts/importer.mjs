#!/usr/bin/env node
/**
 * Construit data/sources.json et data/channels.json à partir d'un relevé local
 * de l'index public iptv-org (domaine public, licence Unlicense).
 *
 * Le relevé n'est pas versionné : il se télécharge à part, voir README.md.
 * Chaque contenu produit porte la source dont il vient et la licence de cette
 * source ; aucune adresse n'est inventée ni complétée à la main.
 *
 * Usage :
 *   node scripts/importer.mjs --amont ./amont/iptv-org --max 1475
 */

import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Les 18 catégories du catalogue, dans leur ordre d'affichage. */
export const CATEGORIES = [
  "Information",
  "Sport",
  "Divertissement",
  "Cinéma",
  "Séries",
  "Jeunesse",
  "Animation",
  "Documentaire",
  "Musique",
  "Culture",
  "Éducation",
  "Science",
  "Voyage",
  "Cuisine",
  "Style de vie",
  "Religion",
  "Affaires",
  "Généraliste"
];

/** Correspondance entre les catégories de l'index amont et les nôtres. */
const CORRESPONDANCE = {
  news: "Information",
  legislative: "Information",
  public: "Information",
  weather: "Information",
  sports: "Sport",
  entertainment: "Divertissement",
  comedy: "Divertissement",
  interactive: "Divertissement",
  movies: "Cinéma",
  classic: "Cinéma",
  series: "Séries",
  kids: "Jeunesse",
  family: "Jeunesse",
  animation: "Animation",
  documentary: "Documentaire",
  outdoor: "Documentaire",
  music: "Musique",
  relax: "Musique",
  culture: "Culture",
  education: "Éducation",
  science: "Science",
  travel: "Voyage",
  cooking: "Cuisine",
  lifestyle: "Style de vie",
  auto: "Style de vie",
  religious: "Religion",
  business: "Affaires",
  general: "Généraliste"
};

const JOUR = new Date().toISOString().slice(0, 10);

function analyserArguments(argv) {
  const options = { amont: "amont/iptv-org", max: 1475, plafondPays: 30 };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === "--amont") options.amont = argv[++i];
    else if (t === "--max") options.max = Number(argv[++i]);
    else if (t === "--plafond-pays") options.plafondPays = Number(argv[++i]);
  }
  return options;
}

async function lireJson(dossier, nom) {
  return JSON.parse(await readFile(join(dossier, nom), "utf8"));
}

/** Hauteur annoncée par la qualité amont, 0 si inconnue. */
function hauteur(qualite) {
  const r = /^(\d{3,4})p$/.exec(qualite ?? "");
  return r ? Number(r[1]) : 0;
}

/** Un flux utilisable sans contournement : HTTPS, sans référent ni agent imposés. */
function fluxAcceptable(flux) {
  if (!flux.url) return false;
  if (!flux.url.startsWith("https://")) return false;
  if (flux.referrer || flux.user_agent) return false;
  return flux.url.startsWith("https://") && (flux.url.includes(".m3u8") || flux.url.includes(".mpd"));
}

function meilleurFlux(fluxs) {
  return fluxs
    .filter(fluxAcceptable)
    .sort((a, b) => hauteur(b.quality) - hauteur(a.quality))[0] ?? null;
}

function categoriser(categoriesAmont) {
  for (const c of categoriesAmont ?? []) {
    const vers = CORRESPONDANCE[c];
    if (vers) return vers;
  }
  return null;
}

const NOM_PAYS = new Intl.DisplayNames(["fr"], { type: "region" });

/** Nom français du pays, replié sur le code si la table ne connaît pas la région. */
function nomPays(code, replis) {
  try {
    return NOM_PAYS.of(code) ?? replis;
  } catch {
    return replis;
  }
}

function licenceSource() {
  return (
    "Index iptv-org, domaine public (Unlicense), relevé du " +
    JOUR +
    " ; flux servi par un tiers, non vérifié par StreamTV"
  );
}

async function ecrireAtomique(chemin, contenu) {
  await mkdir(dirname(chemin), { recursive: true });
  const temporaire = `${chemin}.${process.pid}.tmp`;
  await writeFile(temporaire, contenu);
  await rename(temporaire, chemin);
}

async function principal() {
  const options = analyserArguments(process.argv.slice(2));
  const amont = join(RACINE, options.amont);

  const [channels, streams, logos, blocklist, countries] = await Promise.all([
    lireJson(amont, "channels.json"),
    lireJson(amont, "streams.json"),
    lireJson(amont, "logos.json"),
    lireJson(amont, "blocklist.json"),
    lireJson(amont, "countries.json")
  ]);

  const exclus = new Set(blocklist.map((b) => b.channel));
  const parId = new Map(channels.map((c) => [c.id, c]));
  const logoParChaine = new Map();
  for (const l of logos) {
    if (l.channel && l.in_use && !logoParChaine.has(l.channel)) logoParChaine.set(l.channel, l.url);
  }
  const paysParCode = new Map(countries.map((c) => [c.code, c]));

  const fluxParChaine = new Map();
  for (const flux of streams) {
    if (!flux.channel || !parId.has(flux.channel)) continue;
    if (exclus.has(flux.channel)) continue;
    if (!fluxAcceptable(flux)) continue;
    const liste = fluxParChaine.get(flux.channel) ?? [];
    liste.push(flux);
    fluxParChaine.set(flux.channel, liste);
  }

  const candidats = [];
  for (const [id, fluxs] of fluxParChaine) {
    const chaine = parId.get(id);
    if (!chaine || chaine.is_nsfw) continue;
    const pays = paysParCode.get(chaine.country);
    if (!pays) continue;
    const categorie = categoriser(chaine.categories);
    if (!categorie) continue;
    const flux = meilleurFlux(fluxs);
    if (!flux) continue;
    candidats.push({ chaine, flux, pays, categorie });
  }

  candidats.sort((a, b) => a.chaine.name.localeCompare(b.chaine.name, "fr"));

  // Tourniquet par pays : chaque pays place ses chaînes à tour de rôle, ce qui
  // évite qu'un pays très fourni ne remplisse le catalogue à lui seul.
  const parPays = new Map();
  for (const c of candidats) {
    const cle = c.pays.code;
    if (!parPays.has(cle)) parPays.set(cle, []);
    parPays.get(cle).push(c);
  }
  const files = [...parPays.keys()].sort().map((cle) => ({ cle, file: parPays.get(cle), pris: 0 }));

  const selection = [];
  let tour = 0;
  while (selection.length < options.max) {
    let ajout = 0;
    for (const f of files) {
      if (selection.length >= options.max) break;
      if (f.pris >= options.plafondPays) continue;
      const suivant = f.file[f.pris];
      if (!suivant) continue;
      f.pris += 1;
      selection.push(suivant);
      ajout += 1;
    }
    tour += 1;
    if (ajout === 0) break;
  }

  const sourcesParPays = new Map();
  const contenus = selection.map(({ chaine, flux, pays, categorie }, index) => {
    const sourceId = `iptv-${pays.code.toLowerCase()}`;
    if (!sourcesParPays.has(sourceId)) {
      sourcesParPays.set(sourceId, {
        id: sourceId,
        nom: `${nomPays(pays.code, pays.name)} (index iptv-org)`,
        type: "direct",
        contenu: "chaine",
        url: `https://iptv-org.github.io/iptv/countries/${pays.code.toLowerCase()}.m3u`,
        licence: licenceSource(),
        pays: pays.code,
        langue: pays.languages?.[0] ?? "und",
        actif: true,
        priorite: 5
      });
    }
    return {
      id: `ch-${String(index + 1).padStart(4, "0")}`,
      nom: chaine.name,
      categorie,
      pays: pays.code,
      langue: pays.languages?.[0] ?? "und",
      logo: logoParChaine.get(chaine.id) ?? "",
      source: sourceId,
      url: flux.url,
      qualite: flux.quality ?? ""
    };
  });

  const date = new Date().toISOString();
  const fixes = await lireJson(join(RACINE, "data"), "sources-vod.json");
  const sources = {
    version: 1,
    date,
    sources: [...fixes.sources, ...sourcesParPays.values()]
  };
  const canaux = { version: 1, date, contenus };

  await ecrireAtomique(join(RACINE, "data", "sources.json"), JSON.stringify(sources, null, 2) + "\n");
  await ecrireAtomique(join(RACINE, "data", "channels.json"), JSON.stringify(canaux, null, 2) + "\n");

  const parCategorie = {};
  for (const c of contenus) parCategorie[c.categorie] = (parCategorie[c.categorie] ?? 0) + 1;
  const manquantes = CATEGORIES.filter((c) => !parCategorie[c]);

  console.log(`chaînes retenues : ${contenus.length}`);
  console.log(`sources : ${sources.sources.length}`);
  console.log(`pays représentés : ${new Set(contenus.map((c) => c.pays)).size}`);
  console.log(`catégories remplies : ${Object.keys(parCategorie).length}/18`);
  console.log(JSON.stringify(parCategorie, null, 2));
  if (manquantes.length) console.log(`catégories vides : ${manquantes.join(", ")}`);
  console.log(`tours du tourniquet : ${tour}`);
}

await principal();
