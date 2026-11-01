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
import { traiter, PUBLIC } from "./routeur.js";

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

async function servirFichier(reponse, chemin, { immuable = false } = {}) {
  try {
    const info = await stat(chemin);
    if (!info.isFile()) return false;
    const corps = await readFile(chemin);
    envoyer(reponse, 200, TYPES[extname(chemin)] ?? "application/octet-stream", corps, {
      "cache-control": immuable ? "public, max-age=31536000, immutable" : "no-cache",
      etag: `"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`
    });
    return true;
  } catch {
    return false;
  }
}

export function creerServeur() {
  return createServer(async (requete, reponse) => {
    try {
      const url = new URL(requete.url, "http://localhost");
      const chemin = decodeURIComponent(url.pathname);

      if (await traiter(requete, reponse)) return;

      if (requete.method !== "GET" && requete.method !== "HEAD") {
        return envoyer(reponse, 405, "text/plain; charset=utf-8", "Méthode non autorisée.");
      }

      const cheminConsole = reglages.valeur("chemin_console");
      if (chemin === cheminConsole || chemin === `${cheminConsole}/`) {
        const fichier = join(PUBLIC, "console.html");
        if (await servirFichier(reponse, fichier)) return;
      }

      if (PAGES.some((motif) => motif.test(chemin))) {
        const fichier = join(PUBLIC, "index.html");
        if (await servirFichier(reponse, fichier)) return;
      }

      const relatif = normalize(chemin).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
      if (relatif && !relatif.startsWith("..")) {
        const absolu = join(PUBLIC, relatif);
        const immuable = ["/js/", "/css/", "/affiches/", "/vendor/"].some((prefixe) => chemin.startsWith(prefixe));
        if (absolu.startsWith(PUBLIC) && (await servirFichier(reponse, absolu, { immuable }))) return;
      }

      if (chemin.startsWith("/api/")) {
        return envoyer(reponse, 404, "application/json; charset=utf-8", JSON.stringify({ erreur: "Route inconnue." }));
      }

      return envoyer(reponse, 404, "text/html; charset=utf-8", pageIntrouvable(chemin));
    } catch (erreur) {
      console.error("Erreur de traitement :", erreur);
      envoyer(reponse, 500, "text/plain; charset=utf-8", "Erreur interne du serveur.");
    }
  });
}

function pageIntrouvable(chemin) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Page introuvable</title>
<link rel="stylesheet" href="/css/base.css?v=3.18.0"></head>
<body><main class="page"><h1>Cette page n'existe pas</h1>
<p>L'adresse <code>${chemin.replace(/[<>&"]/g, "")}</code> ne correspond à aucune page de StreamTV.</p>
<p><a class="lien" href="/">Revenir au catalogue</a></p></main></body></html>`;
}

async function demarrer() {
  await charger();
  await reglages.charger();
  await auth.initialiser();

  const port = Number(process.env.PORT) || 3000;
  const serveur = creerServeur();

  await new Promise((resoudre) => serveur.listen(port, "0.0.0.0", resoudre));

  const cheminConsole = reglages.valeur("chemin_console");
  console.log(`StreamTV écoute sur http://127.0.0.1:${port}`);
  console.log(`Console : http://127.0.0.1:${port}${cheminConsole}`);
  console.log(`Code de vérification : ${auth.codeVerification()} (renouvellement dans ${auth.secondesAvantRenouvellement()} s)`);
  if (auth.motDePasseParDefaut()) {
    console.log("Attention : le mot de passe par défaut de la console est encore actif. Changez-le avant toute mise en ligne.");
  }

  const intervalle = setInterval(() => {
    console.log(`Code de vérification : ${auth.codeVerification()} (renouvellement dans ${auth.secondesAvantRenouvellement()} s)`);
  }, 60000);
  intervalle.unref();

  const minutes = reglages.valeur("intervalle_sonde_minutes");
  const sondeur = setInterval(async () => {
    const { instantane } = await import("./magasin.js");
    await sonde.sonderTout(instantane().sources.sources ?? []);
  }, minutes * 60 * 1000);
  sondeur.unref();

  return serveur;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await demarrer();
}

export { demarrer };
