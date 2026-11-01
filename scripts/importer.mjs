#!/usr/bin/env node
/**
 * Construit data/sources.json, data/channels.json et data/playlists.json à
 * partir d'un relevé local de l'index public iptv-org (domaine public,
 * licence Unlicense).
 *
 * Le relevé n'est pas versionné : il se télécharge à part, voir README.md.
 * La liste des playlists déclarées par le porteur du projet vit dans
 * data/playlists-declarees.txt ; l'import mesure, pour chacune, combien de
 * chaînes du catalogue elle contient.
 *
 * Usage :
 *   node scripts/importer.mjs --amont ./amont/iptv-org
 *   node scripts/importer.mjs --amont ./amont/iptv-org --plafond-pays 30
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
const NOM_PAYS = new Intl.DisplayNames(["fr"], { type: "region" });

function analyserArguments(argv) {
  // 0 signifie « aucune limite » pour les deux plafonds.
  const options = { amont: "amont/iptv-org", max: 0, plafondPays: 0, httpsSeulement: true };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === "--amont") options.amont = argv[++i];
    else if (t === "--max") options.max = Number(argv[++i]);
    else if (t === "--plafond-pays") options.plafondPays = Number(argv[++i]);
    else if (t === "--autoriser-http") options.httpsSeulement = false;
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

/**
 * Un flux utilisable sans contournement : HTTPS par défaut, sans référent ni
 * agent imposés. Un flux HTTP n'est pas lisible depuis un site servi en HTTPS,
 * le navigateur le bloque comme contenu mixte : il n'entre donc pas, sauf si
 * l'appelant demande explicitement `--autoriser-http`.
 */
function fluxAcceptable(flux, httpsSeulement) {
  if (!flux.url) return false;
  if (httpsSeulement ? !flux.url.startsWith("https://") : !flux.url.startsWith("http")) return false;
  if (flux.referrer || flux.user_agent) return false;
  return flux.url.includes(".m3u8") || flux.url.includes(".mpd");
}

function meilleurFlux(fluxs, httpsSeulement) {
  return fluxs.filter((f) => fluxAcceptable(f, httpsSeulement)).sort((a, b) => hauteur(b.quality) - hauteur(a.quality))[0] ?? null;
}

/**
 * Catégorie du catalogue pour une chaîne amont. Une chaîne sans catégorie
 * déclarée est généraliste ; une chaîne classée « xxx » n'entre pas.
 */
function categoriser(categoriesAmont) {
  const liste = categoriesAmont ?? [];
  if (liste.includes("xxx")) return null;
  for (const c of liste) {
    const vers = CORRESPONDANCE[c];
    if (vers) return vers;
  }
  return "Généraliste";
}

function nomPays(code, replis) {
  try {
    return NOM_PAYS.of(code) ?? replis;
  } catch {
    return replis;
  }
}

function licenceSource(httpsSeulement) {
  const socle =
    "Index iptv-org, domaine public (Unlicense), relevé du " + JOUR + " ; flux servi par un tiers, non vérifié par StreamTV";
  return httpsSeulement ? socle : socle + " ; comprend des flux HTTP, lisibles seulement sur un site servi en HTTP";
}

async function ecrireAtomique(chemin, contenu) {
  await mkdir(dirname(chemin), { recursive: true });
  const temporaire = `${chemin}.${process.pid}.tmp`;
  await writeFile(temporaire, contenu);
  await rename(temporaire, chemin);
}

/** Lit la liste déclarée par le porteur : « Libellé: adresse », une par ligne. */
async function lirePlaylistsDeclarees() {
  const texte = await readFile(join(RACINE, "data", "playlists-declarees.txt"), "utf8");
  const entrees = [];
  for (const ligne of texte.split(/\r?\n/)) {
    const propre = ligne.trim();
    if (!propre) continue;
    const separateur = propre.indexOf("https://");
    if (separateur < 0) continue;
    const libelle = propre.slice(0, separateur).replace(/:\s*$/, "").trim();
    const url = propre.slice(separateur).trim();
    const morceau = /\/iptv\/(countries|subdivisions)\/([a-z0-9-]+)\.m3u$/.exec(url);
    if (!morceau) continue;
    entrees.push({
      libelle,
      url,
      portee: morceau[1] === "countries" ? "pays" : "subdivision",
      code: morceau[2].toUpperCase(),
      pays: morceau[1] === "countries" ? morceau[2].toUpperCase() : morceau[2].split("-")[0].toUpperCase()
    });
  }
  return entrees;
}

async function principal() {
  const options = analyserArguments(process.argv.slice(2));
  const amont = join(RACINE, options.amont);

  const [channels, streams, logos, blocklist, countries, feeds, declarees] = await Promise.all([
    lireJson(amont, "channels.json"),
    lireJson(amont, "streams.json"),
    lireJson(amont, "logos.json"),
    lireJson(amont, "blocklist.json"),
    lireJson(amont, "countries.json"),
    lireJson(amont, "feeds.json"),
    lirePlaylistsDeclarees()
  ]);

  const exclus = new Set(blocklist.map((b) => b.channel));
  const parId = new Map(channels.map((c) => [c.id, c]));
  const paysParCode = new Map(countries.map((c) => [c.code, c]));

  const logoParChaine = new Map();
  for (const l of logos) {
    if (l.channel && l.in_use && !logoParChaine.has(l.channel)) logoParChaine.set(l.channel, l.url);
  }

  // Un flux utilisable par chaîne, le meilleur en qualité.
  const fluxParChaine = new Map();
  for (const flux of streams) {
    if (!flux.channel || !parId.has(flux.channel) || exclus.has(flux.channel)) continue;
    if (!fluxAcceptable(flux, options.httpsSeulement)) continue;
    const liste = fluxParChaine.get(flux.channel) ?? [];
    liste.push(flux);
    fluxParChaine.set(flux.channel, liste);
  }

  // Zones de diffusion : une chaîne peut viser une subdivision déclarée.
  const subdivisionsDeclarees = new Set(declarees.filter((p) => p.portee === "subdivision").map((p) => p.code));
  const zoneParChaine = new Map();
  for (const feed of feeds) {
    if (!feed.channel || !Array.isArray(feed.broadcast_area)) continue;
    const zones = feed.broadcast_area.map((z) => String(z).split("/")[1]).filter(Boolean);
    const subdivision = zones.find((z) => subdivisionsDeclarees.has(z));
    if (subdivision && !zoneParChaine.has(feed.channel)) zoneParChaine.set(feed.channel, subdivision);
  }

  const candidats = [];
  for (const [id, fluxs] of fluxParChaine) {
    const chaine = parId.get(id);
    if (!chaine || chaine.is_nsfw) continue;
    const pays = paysParCode.get(chaine.country);
    if (!pays) continue;
    const categorie = categoriser(chaine.categories);
    if (!categorie) continue;
    const flux = meilleurFlux(fluxs, options.httpsSeulement);
    if (!flux) continue;
    candidats.push({ chaine, flux, pays, categorie, region: zoneParChaine.get(id) ?? "" });
  }

  candidats.sort(
    (a, b) =>
      a.chaine.name.localeCompare(b.chaine.name, "fr") ||
      a.pays.code.localeCompare(b.pays.code) ||
      a.chaine.id.localeCompare(b.chaine.id)
  );

  // Tourniquet par pays : chaque pays place ses chaînes à tour de rôle, ce qui
  // évite qu'un pays très fourni ne remplisse le catalogue à lui seul quand un
  // plafond est demandé. Sans plafond, la boucle ne fait qu'un tour complet.
  const parPays = new Map();
  for (const c of candidats) {
    const cle = c.pays.code;
    if (!parPays.has(cle)) parPays.set(cle, []);
    parPays.get(cle).push(c);
  }
  const files = [...parPays.keys()].sort().map((cle) => ({ cle, file: parPays.get(cle), pris: 0 }));

  const selection = [];
  const limiteGlobale = options.max > 0 ? options.max : Number.POSITIVE_INFINITY;
  const limiteParPays = options.plafondPays > 0 ? options.plafondPays : Number.POSITIVE_INFINITY;
  let tours = 0;
  while (selection.length < limiteGlobale) {
    let ajout = 0;
    for (const f of files) {
      if (selection.length >= limiteGlobale) break;
      if (f.pris >= limiteParPays) continue;
      const suivant = f.file[f.pris];
      if (!suivant) continue;
      f.pris += 1;
      selection.push(suivant);
      ajout += 1;
    }
    tours += 1;
    if (ajout === 0) break;
  }

  const sourcesParPays = new Map();
  const contenus = selection.map(({ chaine, flux, pays, categorie, region }, index) => {
    const sourceId = `iptv-${pays.code.toLowerCase()}`;
    if (!sourcesParPays.has(sourceId)) {
      sourcesParPays.set(sourceId, {
        id: sourceId,
        nom: `${nomPays(pays.code, pays.name)} (index iptv-org)`,
        type: "direct",
        contenu: "chaine",
        url: `https://iptv-org.github.io/iptv/countries/${pays.code.toLowerCase()}.m3u`,
        licence: licenceSource(options.httpsSeulement),
        pays: pays.code,
        langue: pays.languages?.[0] ?? "und",
        actif: true,
        priorite: 5
      });
    }
    const contenu = {
      id: `ch-${String(index + 1).padStart(5, "0")}`,
      nom: chaine.name,
      categorie,
      pays: pays.code,
      langue: pays.languages?.[0] ?? "und",
      logo: logoParChaine.get(chaine.id) ?? "",
      source: sourceId,
      url: flux.url,
      qualite: flux.quality ?? ""
    };
    if (region) contenu.region = region;
    return contenu;
  });

  const date = new Date().toISOString();
  const fixes = await lireJson(join(RACINE, "data"), "sources-vod.json");
  const sources = { version: 1, date, sources: [...fixes.sources, ...sourcesParPays.values()] };
  const canaux = { version: 1, date, contenus };

  await ecrireAtomique(join(RACINE, "data", "sources.json"), JSON.stringify(sources, null, 2) + "\n");
  await ecrireAtomique(join(RACINE, "data", "channels.json"), JSON.stringify(canaux, null, 2) + "\n");

  // Couverture : combien de chaînes chaque playlist déclarée contient.
  const parPaysCompte = new Map();
  const parRegionCompte = new Map();
  for (const c of contenus) {
    parPaysCompte.set(c.pays, (parPaysCompte.get(c.pays) ?? 0) + 1);
    if (c.region) parRegionCompte.set(c.region, (parRegionCompte.get(c.region) ?? 0) + 1);
  }
  const playlists = {
    version: 1,
    date,
    note:
      "Couverture des playlists déclarées dans data/playlists-declarees.txt. Le décompte est calculé sur data/channels.json : une playlist de pays compte ses chaînes, une playlist de subdivision compte les chaînes dont la zone de diffusion est cette subdivision.",
    total: declarees.length,
    playlists: declarees.map((p) => ({
      libelle: p.libelle,
      url: p.url,
      portee: p.portee,
      code: p.code,
      contenus: p.portee === "pays" ? (parPaysCompte.get(p.code) ?? 0) : (parRegionCompte.get(p.code) ?? 0)
    }))
  };
  await ecrireAtomique(join(RACINE, "data", "playlists.json"), JSON.stringify(playlists, null, 1) + "\n");

  const parCategorie = {};
  for (const c of contenus) parCategorie[c.categorie] = (parCategorie[c.categorie] ?? 0) + 1;
  const manquantes = CATEGORIES.filter((c) => !parCategorie[c]);
  const vides = playlists.playlists.filter((p) => p.contenus === 0);

  console.log(`chaînes retenues : ${contenus.length}${options.httpsSeulement ? " (HTTPS seulement)" : " (HTTP accepté)"}`);
  console.log(`sources : ${sources.sources.length}`);
  console.log(`pays représentés : ${new Set(contenus.map((c) => c.pays)).size}`);
  console.log(`chaînes avec subdivision : ${contenus.filter((c) => c.region).length}`);
  console.log(`playlists déclarées : ${playlists.total}, vides dans ce relevé : ${vides.length}`);
  console.log(`catégories remplies : ${Object.keys(parCategorie).length}/18`);
  console.log(JSON.stringify(parCategorie, null, 2));
  if (manquantes.length) console.log(`catégories vides : ${manquantes.join(", ")}`);
  console.log(`tours du tourniquet : ${tours}`);
}

await principal();
