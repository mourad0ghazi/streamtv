/**
 * Serveur HTTP du site, écrit à la main sur le module node:http.
 * Aucune dépendance : il sert les fichiers de public/, rend index.html pour les
 * routes de pages, et laisse routeur.js répondre sous /api/.
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { charger } from "./magasin.js";
import * as reglages from "./reglages.js";
import * as auth from "./auth.js";
import * as sonde from "./sonde.js";
import { traiter, PUBLIC, VERSION } from "./routeur.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".woff2": "font/woff2"
};

/** Pages rendues par la coquille cliente : toutes renvoient index.html. */
const PAGES = [
  /^\/$/,
  /^\/chaines(\/[\w-]+)?$/,
  /^\/anime(\/[\w-]+)?$/,
  /^\/films(\/[\w-]+)?$/,
  /^\/recherche$/,
  /^\/favoris$/
];

/**
 * Cadres autorisés à afficher le site dans une iframe. La prévisualisation de
 * l'atelier sert le site depuis un autre domaine : un cadre fermé à
 * « SAMEORIGIN » y donnerait une page blanche. La liste reste nominative, se
 * règle par la variable d'environnement STREAMTV_CADRES, et la directive
 * frame-ancestors remplace x-frame-options, qui ne sait pas nommer plusieurs
 * origines.
 */
const CADRES_AUTORISES = process.env.STREAMTV_CADRES?.trim() || "https://*.e2b.app https://*.arena.ai https://arena.ai";

const ENTETES_SECURITE = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' https: data:",
    "media-src 'self' https: blob:",
    "connect-src 'self' https:",
    "font-src 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    `frame-ancestors 'self' ${CADRES_AUTORISES}`
  ].join("; ")
};

function envoyer(reponse, code, type, corps, entetes = {}) {
  reponse.writeHead(code, {
    "content-type": type,
    "content-length": Buffer.byteLength(corps),
    ...ENTETES_SECURITE,
    ...entetes
  });
  reponse.end(corps);
}

/**
 * Sert un fichier avec un ETag et la revalidation qui va avec.
 *
 * Seul `/vendor/` est marqué immuable : hls.js ne change pas sans changer de
 * nom. Tout le reste (scripts, styles, affiches) est servi en `no-cache` : le
 * navigateur redemande, le serveur répond 304 si rien n'a bougé. Une version
 * oubliée ne peut donc plus figer un ancien script chez un visiteur, ce qui
 * arrivait avec `immutable` sur une adresse inchangée.
 */
async function servirFichier(requete, reponse, chemin, { immuable = false, type } = {}) {
  try {
    const info = await stat(chemin);
    if (!info.isFile()) return false;
    const etag = `"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`;
    const cache = immuable ? "public, max-age=31536000, immutable" : "no-cache";

    if (requete && requete.headers?.["if-none-match"] === etag) {
      reponse.writeHead(304, { etag, "cache-control": cache, ...ENTETES_SECURITE });
      reponse.end();
      return true;
    }

    const corps = await readFile(chemin);
    envoyer(reponse, 200, type ?? TYPES[extname(chemin)] ?? "application/octet-stream", corps, { "cache-control": cache, etag });
    return true;
  } catch {
    return false;
  }
}

/**
 * Surface d'administration : le port dédié à la console. Il ne sert que la
 * console et ce qu'elle charge, jamais les pages du catalogue ; sa racine mène
 * à l'adresse privée de la console, puisque ce port n'est pas public. Les
 * quatre barrières de la console (chemin privé, mot de passe, verrou
 * d'appareil, code de vérification) restent entières : ce port ne les remplace
 * pas, il les déplace au même endroit sans rien laisser deviner du catalogue.
 */
const SURFACES = new Set(["site", "administration"]);

export function creerServeur(options = {}) {
  const surface = SURFACES.has(options.surface) ? options.surface : "site";
  const administration = surface === "administration";

  return createServer(async (requete, reponse) => {
    try {
      const url = new URL(requete.url, "http://localhost");
      const chemin = decodeURIComponent(url.pathname);

      if (await traiter(requete, reponse, { surface })) return;

      if (requete.method !== "GET" && requete.method !== "HEAD") {
        return envoyer(reponse, 405, "text/plain; charset=utf-8", "Méthode non autorisée.");
      }

      const cheminConsole = reglages.valeur("chemin_console");
      if (administration && (chemin === "/" || chemin === "")) {
        reponse.writeHead(302, { location: cheminConsole, "cache-control": "no-store", ...ENTETES_SECURITE });
        return reponse.end();
      }
      if (chemin === cheminConsole || chemin === `${cheminConsole}/`) {
        const fichier = join(PUBLIC, "console.html");
        if (await servirFichier(requete, reponse, fichier)) return;
      }

      // La documentation que la console cite depuis chacun de ses onglets.
      if (chemin === "/docs/ADMINISTRATION.md") {
        if (await servirFichier(requete, reponse, join(RACINE, "docs", "ADMINISTRATION.md"), { type: "text/markdown; charset=utf-8" })) return;
      }

      if (!administration && PAGES.some((motif) => motif.test(chemin))) {
        const fichier = join(PUBLIC, "index.html");
        if (await servirFichier(requete, reponse, fichier)) return;
      }

      const relatif = normalize(chemin).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
      // Sur le port d'administration, seules les ressources de la console sont
      // servies : une page du catalogue n'a rien à y faire.
      const autorisee = !administration || RESOURCES_ADMIN.some((prefixe) => chemin.startsWith(prefixe));
      if (relatif && !relatif.startsWith("..") && autorisee) {
        const absolu = join(PUBLIC, relatif);
        const immuable = chemin.startsWith("/vendor/");
        if (absolu.startsWith(PUBLIC) && (await servirFichier(requete, reponse, absolu, { immuable }))) return;
      }

      if (chemin.startsWith("/api/")) {
        return envoyer(reponse, 404, "application/json; charset=utf-8", JSON.stringify({ erreur: "Route inconnue." }));
      }

      if (administration) {
        return envoyer(reponse, 404, "text/html; charset=utf-8", pageAdministrationIntrouvable(chemin, cheminConsole));
      }
      return envoyer(reponse, 404, "text/html; charset=utf-8", pageIntrouvable(chemin));
    } catch (erreur) {
      console.error("Erreur de traitement :", erreur);
      envoyer(reponse, 500, "text/plain; charset=utf-8", "Erreur interne du serveur.");
    }
  });
}

/** Ce que la console charge : ses scripts, ses styles, son icône, sa documentation. */
const RESOURCES_ADMIN = ["/js/", "/css/", "/affiches/", "/vendor/", "/icone.svg", "/manifeste.webmanifest"];

function pageAdministrationIntrouvable(chemin, cheminConsole) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Port d'administration</title>
<link rel="stylesheet" href="/css/base.css?v=${VERSION}"></head>
<body><main class="page"><h1>Ce port sert l'administration</h1>
<p>L'adresse <code>${chemin.replace(/[<>&"]/g, "")}</code> n'existe pas ici. Le catalogue se trouve sur le port du site.</p>
<p><a class="lien" href="${cheminConsole}">Ouvrir la console d'administration</a></p></main></body></html>`;
}

function pageIntrouvable(chemin) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Page introuvable</title>
<link rel="stylesheet" href="/css/base.css?v=${VERSION}"></head>
<body><main class="page"><h1>Cette page n'existe pas</h1>
<p>L'adresse <code>${chemin.replace(/[<>&"]/g, "")}</code> ne correspond à aucune page de StreamTV.</p>
<p><a class="lien" href="/">Revenir au catalogue</a></p></main></body></html>`;
}

export async function demarrer(options = {}) {
  const surface = SURFACES.has(options.surface) ? options.surface : "site";
  const administration = surface === "administration";

  await charger();
  await reglages.charger();
  await auth.initialiser();

  const port = Number(options.port ?? process.env.PORT) || (administration ? 3002 : 3000);
  const hote = options.hote ?? process.env.STREAMTV_HOTE ?? "0.0.0.0";
  const serveur = creerServeur({ surface });

  await new Promise((resoudre) => serveur.listen(port, hote, resoudre));

  const cheminConsole = reglages.valeur("chemin_console");
  if (administration) {
    console.log(`Administration StreamTV sur http://127.0.0.1:${port} (racine renvoyée vers la console)`);
  } else {
    console.log(`StreamTV écoute sur http://127.0.0.1:${port}`);
  }
  console.log(`Console : http://127.0.0.1:${port}${cheminConsole}`);
  console.log(`Code de vérification : ${auth.codeVerification()} (renouvellement dans ${auth.secondesAvantRenouvellement()} s)`);
  if (administration && reglages.valeur("console_sans_mot_de_passe") === true) {
    console.log("Accès libre : la console de ce port s'ouvre sans mot de passe. Le site garde le sien.");
    console.log("Pour fermer ce port aux autres machines : STREAMTV_HOTE=127.0.0.1 npm run admin");
  } else if (auth.motDePasseParDefaut()) {
    console.log("Attention : le mot de passe par défaut de la console est encore actif. Changez-le avant toute mise en ligne.");
  }

  const intervalle = setInterval(() => {
    console.log(`Code de vérification : ${auth.codeVerification()} (renouvellement dans ${auth.secondesAvantRenouvellement()} s)`);
  }, 60000);
  intervalle.unref();

  // Une seule surface sonde : le port d'administration ne fait que lire.
  if (!administration) {
    const minutes = reglages.valeur("intervalle_sonde_minutes");
    const sondeur = setInterval(async () => {
      const { instantane } = await import("./magasin.js");
      await sonde.sonderTout(instantane().sources.sources ?? []);
    }, minutes * 60 * 1000);
    sondeur.unref();
  }

  return serveur;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await demarrer();
}
