#!/usr/bin/env node
/**
 * Construction de la démonstration statique publiée sur GitHub Pages.
 *
 * La version publiée est en lecture seule : pas de console, pas d'import, pas
 * de sondes. Elle lisde les mêmes fichiers de données que le site dynamique et
 * affiche un bandeau qui dit qu'elle est une démonstration.
 *
 * Usage :
 *   node scripts/construire-statique.mjs            construit _site/
 *   node scripts/construire-statique.mjs --servir   construit puis sert _site/ sur le port 3001
 */

import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { join, extname, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normaliserBase } from "../public/js/partage/base.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const SORTIE = join(RACINE, "_site");
/** Routes de pages pré-rendues : un dossier par route, pour qu'un accès direct réponde 200. */
const ROUTES = ["chaines", "anime", "films", "recherche", "favoris"];
const PUBLIC = join(RACINE, "public");
const DONNEES = join(RACINE, "data");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json"
};

async function lireJson(nom, replis) {
  try {
    return JSON.parse(await readFile(join(DONNEES, nom), "utf8"));
  } catch {
    return replis;
  }
}

/** Valeur d'une option `--nom valeur` ou `--nom=valeur`, sinon undefined. */
export function option(nom) {
  const prefixe = `--${nom}=`;
  const argus = process.argv.slice(2);
  for (let i = 0; i < argus.length; i += 1) {
    if (argus[i].startsWith(prefixe)) return argus[i].slice(prefixe.length);
    if (argus[i] === `--${nom}`) return argus[i + 1] ?? "";
  }
  return undefined;
}

/**
 * Préfixe les adresses absolues de la page par la base de publication. Les
 * ancres (`#page`) et les adresses complètes ne sont pas touchées.
 */
export function prefixerHtml(html, base = "") {
  if (!base) return html;
  return html.replace(/(\s(?:href|src)=")\/(?!\/)/g, `$1${base}/`);
}

/**
 * Page de la coquille, prête à publier : adresses préfixées, drapeaux de la
 * démonstration inscrits dans la page (la politique de sécurité du serveur
 * dynamique interdit le script en ligne, GitHub Pages ne l'interdit pas).
 */
export function pagePour(html, base = "") {
  const marque = '<script type="module"';
  const drapeaux = `<script>window.STREAMTV_STATIQUE = true; window.STREAMTV_BASE = ${JSON.stringify(base)};</script>\n    `;
  return prefixerHtml(html, base).replace(marque, drapeaux + marque);
}

/** Manifeste de l'application, avec les adresses de la base. */
export function manifestePour(texte, base = "") {
  const manifeste = JSON.parse(texte);
  const prefixe = (valeur) => (typeof valeur === "string" && valeur.startsWith("/") ? `${base}${valeur}` : valeur);
  return (
    JSON.stringify(
      {
        ...manifeste,
        start_url: prefixe(manifeste.start_url ?? "/"),
        scope: prefixe(manifeste.scope ?? "/"),
        icons: (manifeste.icons ?? []).map((icone) => ({ ...icone, src: prefixe(icone.src) }))
      },
      null,
      2
    ) + "\n"
  );
}

async function construire() {
  const base = normaliserBase(option("base") ?? "");
  const sortie = option("sortie") ? resolve(option("sortie")) : SORTIE;

  // Le dossier publié peut aussi contenir la documentation : on la met de côté
  // le temps de la reconstruction, sinon `rm` l'emporterait.
  const gardees = new Map();
  for (const nom of (option("conserver") ?? "").split(",").map((n) => n.trim()).filter(Boolean)) {
    try {
      gardees.set(nom, await readFile(join(sortie, nom)));
    } catch {
      /* fichier absent : rien à conserver */
    }
  }

  await rm(sortie, { recursive: true, force: true });
  await mkdir(sortie, { recursive: true });

  await cp(PUBLIC, sortie, {
    recursive: true,
    filter: (source) => !source.includes(`${join(PUBLIC, "js", "admin")}`) && !source.endsWith("console.html")
  });

  const [chaines, anime, films, sources] = await Promise.all([
    lireJson("channels.json", { contenus: [] }),
    lireJson("anime.json", { contenus: [] }),
    lireJson("films.json", { contenus: [] }),
    lireJson("sources.json", { sources: [] })
  ]);

  await mkdir(join(sortie, "statique"), { recursive: true });
  await writeFile(
    join(sortie, "statique", "donnees.json"),
    JSON.stringify(
      {
        // Date du relevé, pas celle de la construction : deux constructions
        // des mêmes données donnent le même fichier, donc aucun diff inutile.
        date: chaines.date ?? new Date().toISOString(),
        plafondCartes: 24,
        attenteLecteur: 10,
        chaines: chaines.contenus ?? [],
        anime: anime.contenus ?? [],
        films: films.contenus ?? [],
        sources: (sources.sources ?? []).filter((s) => s.actif !== false).map((s) => ({ id: s.id, nom: s.nom, licence: s.licence, contenu: s.contenu }))
      },
      null,
      0
    ) + "\n"
  );

  const page = pagePour(await readFile(join(sortie, "index.html"), "utf8"), base);
  await writeFile(join(sortie, "index.html"), page);
  await writeFile(join(sortie, "404.html"), page);
  for (const route of ROUTES) {
    await mkdir(join(sortie, route), { recursive: true });
    await writeFile(join(sortie, route, "index.html"), page);
  }
  await writeFile(join(sortie, "manifeste.webmanifest"), manifestePour(await readFile(join(PUBLIC, "manifeste.webmanifest"), "utf8"), base));
  await writeFile(join(sortie, ".nojekyll"), "");
  for (const [nom, corps] of gardees) await writeFile(join(sortie, nom), corps);

  const octets = (await readFile(join(sortie, "statique", "donnees.json"))).length;
  console.log(`Démonstration construite dans ${sortie} : ${chaines.contenus?.length ?? 0} chaînes, ${anime.contenus?.length ?? 0} animés, ${films.contenus?.length ?? 0} films.`);
  console.log(`Données statiques : ${(octets / 1024).toFixed(0)} ko.`);
  console.log(base ? `Publiée sous la base ${base}.` : "Publiée à la racine du domaine.");
}

/** Petit serveur de vérification, pour contrôler _site/ avant publication. */
function servir(port = 3001, sortie = SORTIE, base = "") {
  const serveur = createServer(async (requete, reponse) => {
    const brut = decodeURIComponent(new URL(requete.url, "http://localhost").pathname);
    const chemin = base && (brut === base || brut.startsWith(`${base}/`)) ? brut.slice(base.length) || "/" : brut;
    const candidats = [join(sortie, chemin), join(sortie, chemin, "index.html"), join(sortie, "index.html")];
    for (const candidat of candidats) {
      try {
        const corps = await readFile(candidat);
        reponse.writeHead(200, { "content-type": TYPES[extname(candidat)] ?? "application/octet-stream" });
        return reponse.end(corps);
      } catch {
        /* essayer le candidat suivant */
      }
    }
    reponse.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    reponse.end("Introuvable");
  });
  serveur.listen(port, "0.0.0.0", () => console.log(`Démonstration statique : http://127.0.0.1:${port}${base}/`));
  return serveur;
}

const LANCE_DIRECTEMENT =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (LANCE_DIRECTEMENT) {
  await construire();
  if (process.argv.includes("--servir")) {
    servir(Number(process.env.PORT || 3001), option("sortie") ? resolve(option("sortie")) : SORTIE, normaliserBase(option("base") ?? ""));
  }
}
