/**
 * Relais de flux : le serveur va chercher le flux, le navigateur le reçoit
 * depuis le site.
 *
 * Pourquoi ce relais existe. hls.js lit les playlists et les segments avec
 * `fetch` : le navigateur applique donc la règle CORS, et le serveur de la
 * chaîne doit répondre `Access-Control-Allow-Origin`. La grande majorité des
 * 8 199 chaînes du catalogue n'envoient pas cet en-tête : le flux est bon, VLC
 * le lit, le navigateur refuse. En passant par ce module, la requête part du
 * serveur (pas de CORS côté navigateur, pas de contenu mixte), avec un
 * User-Agent et un Referer choisis par l'administrateur.
 *
 * Ce que le relais ne peut pas faire :
 *   - rendre lisible un flux mort, géo-bloqué ou chiffré ;
 *   - lire un MPEG-TS brut ou du DASH dans un navigateur : il n'y a pas de
 *     transcodage ici, seulement un transport ;
 *   - contourner un jeton signé ou une authentification du diffuseur.
 *
 * Deux façons d'appeler le relais, et deux seulement :
 *   /flux?url=…  l'adresse doit figurer dans le catalogue chargé ;
 *   /flux?t=…    jeton signé, produit par le serveur pour un segment ou une
 *                playlist imbriquée.
 * Un relais ouvert accepterait n'importe quelle adresse : le serveur
 * deviendrait un tremplin vers son propre réseau. Les deux voies ci-dessus
 * l'en empêchent, et les adresses privées sont refusées même si elles étaient
 * signées.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { request as requeteHttp } from "node:http";
import { request as requeteHttps } from "node:https";
import { lookup as resoudreDns } from "node:dns";
import { isIP } from "node:net";

import { contenus, instantane } from "./magasin.js";
import * as auth from "./auth.js";
import * as lecture from "./lecture.js";

export const CHEMIN = "/flux";
const PROFONDEUR_MAX = 5;
const REDIRECTIONS_MAX = 5;
const DELAI_ENTETES_MS = 15000;
const PLAFOND_PLAYLIST = 2 * 1024 * 1024;
const RELAIS_SIMULTANES = 48;

let enCours = 0;

/* ------------------------------------------------------------------ */
/* Jetons signés                                                       */
/* ------------------------------------------------------------------ */

function signerBrut(url, profondeur, secret) {
  return createHmac("sha256", secret).update(`${url}\u0000${profondeur}`).digest("base64url").slice(0, 32);
}

/** Jeton compact : adresse en base64url, profondeur, puis signature. */
export async function signer(url, profondeur = 0) {
  const secret = await auth.cleRelais();
  const charge = Buffer.from(url, "utf8").toString("base64url");
  return `${charge}.${profondeur}.${signerBrut(url, profondeur, secret)}`;
}

/** Vérifie un jeton. Renvoie {url, profondeur} ou null. */
export async function verifier(jeton) {
  if (typeof jeton !== "string" || jeton.length > 4000) return null;
  const morceaux = jeton.split(".");
  if (morceaux.length !== 3) return null;
  const [charge, profondeurTexte, signature] = morceaux;
  const profondeur = Number.parseInt(profondeurTexte, 10);
  if (!Number.isInteger(profondeur) || profondeur < 0 || profondeur > PROFONDEUR_MAX) return null;
  let url;
  try {
    url = Buffer.from(charge, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const secret = await auth.cleRelais();
  const attendu = signerBrut(url, profondeur, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(attendu);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { url, profondeur };
}

/* ------------------------------------------------------------------ */
/* Adresses autorisées                                                 */
/* ------------------------------------------------------------------ */

/** Adresse privée, de bouclage, ou réservée : jamais relayée. */
export function adresseInterne(ip) {
  const brute = String(ip ?? "").replace(/^\[|\]$/g, "");
  const version = isIP(brute);
  if (version === 4) {
    const [a, b] = brute.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true;
    return false;
  }
  if (version === 6) {
    const minuscule = brute.toLowerCase();
    if (minuscule === "::" || minuscule === "::1") return true;
    if (minuscule.startsWith("fc") || minuscule.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(minuscule)) return true;
    const mappee = minuscule.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mappee) return adresseInterne(mappee[1]);
    return false;
  }
  return true;
}

/**
 * Contrôle syntaxique d'une cible. Renvoie null si elle convient, sinon le
 * message français qui explique le refus.
 */
export function cibleAcceptable(url) {
  let cible;
  try {
    cible = new URL(url);
  } catch {
    return "L'adresse du flux n'est pas une adresse valide.";
  }
  if (cible.protocol !== "http:" && cible.protocol !== "https:") {
    return "Seules les adresses http et https sont relayées.";
  }
  if (cible.username || cible.password) {
    return "Une adresse de flux ne doit pas porter d'identifiant ni de mot de passe.";
  }
  const hote = cible.hostname.replace(/^\[|\]$/g, "");
  if (!hote) return "L'adresse du flux n'a pas d'hôte.";
  if (isIP(hote) && adresseInterne(hote)) {
    return "Cette adresse désigne le réseau local ou une adresse réservée : le relais refuse de la servir.";
  }
  if (hote === "localhost" || hote.endsWith(".localhost") || hote.endsWith(".internal") || hote.endsWith(".local")) {
    return "Cette adresse désigne le réseau local : le relais refuse de la servir.";
  }
  return null;
}

/** Résolution DNS filtrée : le nom peut être public, l'adresse non. */
function resolutionSure(hote, options, rappel) {
  resoudreDns(hote, { all: true }, (erreur, adresses) => {
    if (erreur) return rappel(erreur);
    const liste = Array.isArray(adresses) ? adresses : [adresses];
    if (!liste.length) return rappel(new Error("Aucune adresse pour cet hôte."));
    const interdite = liste.find((adresse) => adresseInterne(adresse.address));
    if (interdite) return rappel(new Error("adresse-interne"));
    rappel(null, liste[0].address, liste[0].family);
  });
}

/**
 * Le catalogue chargé, en mémoire, pour reconnaître les adresses du site.
 * Reconstruit quand le magasin remplace un bloc : une comparaison de référence
 * suffit, et coûte moins qu'un parcours de 8 199 entrées à chaque requête.
 */
let index = null;
let blocIndexe = null;

function adressesDuCatalogue() {
  const bloc = instantane().chaines;
  if (index && blocIndexe === bloc) return index;
  const ensemble = new Set();
  for (const famille of ["chaines", "anime", "films"]) {
    for (const contenu of contenus(famille)) {
      if (typeof contenu.url === "string") ensemble.add(contenu.url);
      for (const episode of contenu.episodes ?? []) {
        if (typeof episode.url === "string") ensemble.add(episode.url);
      }
    }
  }
  index = ensemble;
  blocIndexe = bloc;
  return ensemble;
}

export function duCatalogue(url) {
  return adressesDuCatalogue().has(url);
}

/* ------------------------------------------------------------------ */
/* Réécriture des playlists HLS                                        */
/* ------------------------------------------------------------------ */

/** Résout une adresse relative, sans jamais laisser passer un autre protocole. */
export function resoudre(uri, base) {
  try {
    const complete = new URL(uri, base);
    if (complete.protocol !== "http:" && complete.protocol !== "https:") return null;
    return complete.toString();
  } catch {
    return null;
  }
}

const BALISES_A_URI = ["#EXT-X-KEY", "#EXT-X-MAP", "#EXT-X-MEDIA", "#EXT-X-I-FRAME-STREAM-INF", "#EXT-X-SESSION-KEY", "#EXT-X-PART", "#EXT-X-PRELOAD-HINT"];

/**
 * Réécrit une playlist HLS pour que variantes, segments, clés et init maps
 * repassent tous par le relais.
 *
 * `signerLien(url)` renvoie l'adresse du relais pour une cible ; il est injecté
 * pour que la réécriture reste une fonction pure, testable sans réseau.
 */
export function reecrirePlaylist(texte, base, signerLien) {
  const lignes = String(texte ?? "").split(/\r?\n/);
  const sortie = [];
  for (const ligne of lignes) {
    const propre = ligne.trim();
    if (!propre) {
      sortie.push("");
      continue;
    }
    if (propre.startsWith("#")) {
      if (BALISES_A_URI.some((balise) => propre.startsWith(balise))) {
        sortie.push(
          ligne.replace(/URI="([^"]+)"/g, (tout, uri) => {
            const absolue = resoudre(uri, base);
            return absolue ? `URI="${signerLien(absolue)}"` : tout;
          })
        );
      } else {
        sortie.push(ligne);
      }
      continue;
    }
    // Une ligne ordinaire est une URI : segment, variante ou sous-playlist.
    const absolue = resoudre(propre, base);
    sortie.push(absolue ? signerLien(absolue) : propre);
  }
  return sortie.join("\n");
}

/* ------------------------------------------------------------------ */
/* Relais                                                              */
/* ------------------------------------------------------------------ */

function entetesVersObjet(brut) {
  const resultat = {};
  for (const [cle, valeur] of Object.entries(brut ?? {})) {
    if (valeur !== undefined) resultat[cle.toLowerCase()] = Array.isArray(valeur) ? valeur.join(", ") : String(valeur);
  }
  return resultat;
}

/** En-têtes envoyés au serveur du flux : c'est là que VLC imite un lecteur. */
async function entetesSortants(entetes, options) {
  const etatLecture = await lecture.statut();
  const sortants = {
    "user-agent": etatLecture.proxy_agent || "VLC/3.0.20 LibVLC/3.0.20",
    accept: entetes.accept || "*/*",
    "accept-language": "fr,fr-FR;q=0.9,en;q=0.8",
    connection: "keep-alive"
  };
  if (entetes.range) sortants.range = entetes.range;
  if (entetes["if-none-match"]) sortants["if-none-match"] = entetes["if-none-match"];
  if (entetes["if-modified-since"]) sortants["if-modified-since"] = entetes["if-modified-since"];
  if (etatLecture.proxy_referer !== "aucun") {
    try {
      sortants.referer = new URL(options.cible).origin + "/";
    } catch {
      // Adresse déjà validée : pas d'origine, pas de Referer.
    }
  }
  return sortants;
}

function estPlaylist(cible, entetes) {
  const type = String(entetes["content-type"] ?? "").toLowerCase();
  if (type.includes("mpegurl") || type.includes("m3u")) return true;
  return /\.m3u8?(?:$|\?)/i.test(cible);
}

/**
 * Va chercher une adresse et la rend au client, en flux, sans la charger en
 * mémoire. Renvoie quand la réponse est terminée.
 */
export async function relayer({ cible, methode, entetes, reponse, profondeur = 0, options = {} }) {
  await preparer();
  const etatLecture = await lecture.statut();
  if (!options.boucleLocale) {
    const refus = cibleAcceptable(cible);
    if (refus) return envoyerErreur(reponse, 403, refus);
  }
  if (enCours >= RELAIS_SIMULTANES) {
    return envoyerErreur(reponse, 503, "Trop de flux relayés en même temps. Réessayez dans un instant.");
  }
  enCours += 1;
  try {
    return await relayerUne(cible, methode, entetes, reponse, profondeur, options);
  } finally {
    enCours -= 1;
  }
}

async function relayerUne(cible, methode, entetes, reponse, profondeur, options, redirection = 0) {
  const cibleUrl = new URL(cible);
  const transport = cibleUrl.protocol === "https:" ? requeteHttps : requeteHttp;
  const sortants = await entetesSortants(entetes, { cible });

  const resultat = await new Promise((resoudre) => {
    const requete = transport(
      cibleUrl,
      {
        method: methode === "HEAD" ? "HEAD" : "GET",
        headers: sortants,
        lookup: options.boucleLocale ? undefined : resolutionSure,
        timeout: DELAI_ENTETES_MS
      },
      (amont) => resoudre({ amont })
    );
    requete.on("timeout", () => requete.destroy(new Error("delai")));
    requete.on("error", (erreur) => resoudre({ erreur }));
    requete.end();
  });

  if (resultat.erreur) {
    const message = resultat.erreur.message === "adresse-interne"
      ? "Cette adresse désigne le réseau local : le relais refuse de la servir."
      : resultat.erreur.message === "delai"
        ? "Le serveur du flux n'a pas répondu dans le délai prévu."
        : "Le serveur du flux est injoignable.";
    return envoyerErreur(reponse, 502, message);
  }

  const amont = resultat.amont;
  const entetesAmont = entetesVersObjet(amont.headers);
  const code = amont.statusCode ?? 502;

  // Redirections : suivies une à une, avec le même contrôle d'adresse.
  if ([301, 302, 303, 307, 308].includes(code) && entetesAmont.location) {
    amont.resume();
    if (redirection >= REDIRECTIONS_MAX) {
      return envoyerErreur(reponse, 502, "Le serveur du flux enchaîne trop de redirections.");
    }
    const suivante = resoudre(entetesAmont.location, cible);
    if (!suivante) return envoyerErreur(reponse, 502, "La redirection du flux mène à une adresse invalide.");
    return relayerUne(suivante, methode, entetes, reponse, profondeur, options, redirection + 1);
  }

  if (code >= 400) {
    amont.resume();
    const message = code === 404
      ? "Le serveur du flux répond 404 : cette chaîne n'est plus diffusée à cette adresse."
      : code === 403 || code === 401
        ? "Le diffuseur refuse l'accès depuis ce serveur (droits, région ou jeton). Le relais n'y peut rien."
        : `Le serveur du flux a répondu ${code}.`;
    return envoyerErreur(reponse, code === 404 ? 404 : 502, message);
  }

  const communs = {
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  };

  if (estPlaylist(cible, entetesAmont)) {
    if (profondeur >= PROFONDEUR_MAX) {
      amont.resume();
      return envoyerErreur(reponse, 400, "Trop de niveaux de playlist : le relais s'arrête.");
    }
    const corps = await lireAvecPlafond(amont, PLAFOND_PLAYLIST);
    if (corps === null) {
      return envoyerErreur(reponse, 502, "La playlist dépasse la taille admise par le relais.");
    }
    const texte = reecrirePlaylist(corps.toString("utf8"), cible, (url) => `${CHEMIN}?t=${encodeURIComponent(jetonTemporaire(url, profondeur + 1))}`);
    reponse.writeHead(200, {
      "content-type": "application/vnd.apple.mpegurl; charset=utf-8",
      "content-length": Buffer.byteLength(texte),
      ...communs
    });
    return reponse.end(methode === "HEAD" ? undefined : texte);
  }

  const entetesSortie = {
    "content-type": entetesAmont["content-type"] ?? "application/octet-stream",
    "accept-ranges": entetesAmont["accept-ranges"] ?? "bytes",
    ...communs
  };
  if (entetesAmont["content-length"]) entetesSortie["content-length"] = entetesAmont["content-length"];
  if (entetesAmont["content-range"]) entetesSortie["content-range"] = entetesAmont["content-range"];
  reponse.writeHead(code === 206 ? 206 : 200, entetesSortie);

  if (methode === "HEAD") {
    amont.resume();
    return reponse.end();
  }

  amont.pipe(reponse);
  amont.on("error", () => reponse.destroy());
  reponse.on("close", () => amont.destroy());
  return undefined;
}

/**
 * Jeton signé, calculé sans `await` : la réécriture d'une playlist est
 * synchrone. Le secret est mémorisé dès la première requête du relais.
 */
let secretMemorise = null;
function jetonTemporaire(url, profondeur) {
  const charge = Buffer.from(url, "utf8").toString("base64url");
  return `${charge}.${profondeur}.${signerBrut(url, profondeur, secretMemorise)}`;
}

/** À appeler une fois avant de servir : mémorise le secret de signature. */
export async function preparer() {
  secretMemorise = await auth.cleRelais();
  return Boolean(secretMemorise);
}

function lireAvecPlafond(flux, plafond) {
  return new Promise((resoudre) => {
    const morceaux = [];
    let taille = 0;
    let tropGrand = false;
    flux.on("data", (morceau) => {
      if (tropGrand) return;
      taille += morceau.length;
      if (taille > plafond) {
        tropGrand = true;
        flux.destroy();
        return;
      }
      morceaux.push(morceau);
    });
    flux.on("end", () => resoudre(tropGrand ? null : Buffer.concat(morceaux)));
    flux.on("error", () => resoudre(null));
    flux.on("close", () => resoudre(tropGrand ? null : Buffer.concat(morceaux)));
  });
}

function envoyerErreur(reponse, code, message) {
  const corps = JSON.stringify({ erreur: message });
  reponse.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(corps),
    "cache-control": "no-store"
  });
  reponse.end(corps);
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Entrée du relais                                                    */
/* ------------------------------------------------------------------ */

/**
 * Sert /flux. Renvoie true quand la requête a été traitée, false si ce n'est
 * pas le relais.
 */
export async function traiter({ requete, reponse, recherche }) {
  await lecture.rafraichir();
  const methode = requete.method;
  if (methode !== "GET" && methode !== "HEAD") {
    envoyerErreur(reponse, 405, "Le relais accepte GET et HEAD.");
    return true;
  }
  if ((await lecture.statut()).proxy_actif !== true) {
    envoyerErreur(reponse, 503, "Le relais des flux est fermé. Il s'ouvre dans la console, onglet Lecture et diffusion.");
    return true;
  }
  await preparer();

  let cible = null;
  let profondeur = 0;

  if (recherche.get("t")) {
    const jeton = await verifier(recherche.get("t"));
    if (!jeton) {
      envoyerErreur(reponse, 403, "Ce jeton de flux est invalide ou expiré. Rechargez la page de la chaîne.");
      return true;
    }
    cible = jeton.url;
    profondeur = jeton.profondeur;
  } else if (recherche.get("url")) {
    const demandee = recherche.get("url");
    if (!duCatalogue(demandee)) {
      envoyerErreur(reponse, 403, "Cette adresse ne fait pas partie du catalogue : le relais ne sert que les flux du site.");
      return true;
    }
    cible = demandee;
  } else {
    envoyerErreur(reponse, 400, "Adresse de flux manquante : indiquez url ou t.");
    return true;
  }

  await relayer({
    cible,
    methode,
    entetes: requete.headers,
    reponse,
    profondeur,
    // Aucune exception, même en test : le relais refuse toujours le réseau
    // local. Les tests qui ont besoin d'une origine locale appellent `relayer`
    // directement, avec l'option explicite.
    options: {}
  });
  return true;
}
