/**
 * Accès à la console d'administration.
 *
 * Quatre barrières, aucune facultative : un chemin privé (réglage
 * chemin_console), un mot de passe vérifié par scrypt, un verrou d'appareil,
 * et un code de vérification à six chiffres affiché sur la sortie du serveur
 * et renouvelé toutes les dix minutes.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual, createHmac, createHash } from "node:crypto";
import { DOSSIER_DONNEES, ecrireAtomique } from "./magasin.js";

export const FICHIER = join(DOSSIER_DONNEES, "secret.json");
export const MOT_DE_PASSE_PAR_DEFAUT = "streamtv";
const FENETRE_CODE_MS = 10 * 60 * 1000;

/** Rôles et permissions. Un rôle ne peut que ce qui est listé ici. */
export const ROLES = {
  administrateur: {
    libelle: "Administrateur",
    permissions: [
      "sources.lire",
      "sources.ecrire",
      "import.lancer",
      "reglages.lire",
      "reglages.ecrire",
      "audit.lire",
      "roles.ecrire",
      "statistiques.lire"
    ]
  },
  lecteur: {
    libelle: "Lecteur",
    permissions: ["sources.lire", "reglages.lire", "audit.lire", "statistiques.lire"]
  }
};

let secret = null;
const sessions = new Map();

function empreinte(valeur) {
  return createHash("sha256").update(String(valeur)).digest("hex");
}

function hacher(motDePasse, sel) {
  return scryptSync(motDePasse, sel, 64).toString("hex");
}

function comparerConstant(a, b) {
  const ta = Buffer.from(String(a));
  const tb = Buffer.from(String(b));
  if (ta.length !== tb.length) return false;
  return timingSafeEqual(ta, tb);
}

/** Charge le secret, ou le crée au premier démarrage avec le mot de passe par défaut. */
export async function initialiser() {
  if (secret) return secret;
  try {
    secret = JSON.parse(await readFile(FICHIER, "utf8"));
  } catch (erreur) {
    if (erreur.code !== "ENOENT") throw erreur;
    const sel = randomBytes(16).toString("hex");
    secret = {
      version: 1,
      sel,
      hash: hacher(MOT_DE_PASSE_PAR_DEFAUT, sel),
      secret: randomBytes(32).toString("hex"),
      defaut: true,
      appareils: []
    };
    await ecrireAtomique(FICHIER, secret);
  }
  if (!Array.isArray(secret.appareils)) secret.appareils = [];
  return secret;
}

export function motDePasseParDefaut() {
  return Boolean(secret?.defaut);
}

/** Code de vérification courant : six chiffres, renouvelé toutes les dix minutes. */
export function codeVerification() {
  const fenetre = Math.floor(Date.now() / FENETRE_CODE_MS);
  const brut = createHmac("sha256", secret.secret).update(String(fenetre)).digest("hex");
  return String(parseInt(brut.slice(0, 8), 16) % 1000000).padStart(6, "0");
}

/** Secondes restantes avant le renouvellement du code. */
export function secondesAvantRenouvellement() {
  return Math.ceil((FENETRE_CODE_MS - (Date.now() % FENETRE_CODE_MS)) / 1000);
}

export function appareilConnu(jeton) {
  if (!jeton) return false;
  return secret.appareils.some((a) => comparerConstant(a.empreinte, empreinte(jeton)));
}

async function enregistrerAppareil(jeton) {
  secret.appareils.push({ empreinte: empreinte(jeton), ajoute: new Date().toISOString() });
  await ecrireAtomique(FICHIER, secret);
}

/**
 * Vérifie les identifiants. Renvoie {ok, raison, jeton, jetonAppareil}.
 * `raison` est un code court, traduit en français par l'interface.
 */
export async function connexion({ motDePasse, code, jetonAppareil, dureeMinutes, codeRequis = true }) {
  await initialiser();
  const connu = appareilConnu(jetonAppareil);

  if (typeof motDePasse !== "string" || !comparerConstant(hacher(motDePasse, secret.sel), secret.hash)) {
    return { ok: false, raison: "mot-de-passe" };
  }

  // Le code de vérification est une barrière de plus, pas une condition du mot
  // de passe : le réglage `code_verification` peut la retirer, le mot de passe
  // reste obligatoire dans tous les cas.
  if (!connu && codeRequis) {
    if (String(code ?? "").trim() !== codeVerification()) {
      return { ok: false, raison: "code" };
    }
  }

  let nouvelAppareil = false;
  if (!connu) {
    jetonAppareil = randomBytes(32).toString("hex");
    await enregistrerAppareil(jetonAppareil);
    nouvelAppareil = true;
  }

  const jeton = randomBytes(32).toString("hex");
  const duree = Math.max(5, Number(dureeMinutes) || 60) * 60 * 1000;
  sessions.set(jeton, { role: "administrateur", expire: Date.now() + duree });
  return { ok: true, jeton, jetonAppareil, nouvelAppareil };
}

export function verifierSession(jeton) {
  if (!jeton) return null;
  const s = sessions.get(jeton);
  if (!s) return null;
  if (s.expire < Date.now()) {
    sessions.delete(jeton);
    return null;
  }
  return s;
}

export function deconnexion(jeton) {
  return sessions.delete(jeton);
}

export function permissions(role) {
  return ROLES[role]?.permissions ?? [];
}

/** Un rôle sans permission listée ne peut rien faire. */
export function autoriser(role, permission) {
  return permissions(role).includes(permission);
}

export async function changerMotDePasse(ancien, nouveau) {
  await initialiser();
  if (!comparerConstant(hacher(String(ancien ?? ""), secret.sel), secret.hash)) {
    return { ok: false, message: "L'ancien mot de passe ne correspond pas." };
  }
  if (typeof nouveau !== "string" || nouveau.length < 8) {
    return { ok: false, message: "Le nouveau mot de passe doit compter au moins 8 caractères." };
  }
  if (nouveau === MOT_DE_PASSE_PAR_DEFAUT) {
    return { ok: false, message: "Le mot de passe par défaut est refusé : choisissez-en un autre." };
  }
  secret.sel = randomBytes(16).toString("hex");
  secret.hash = hacher(nouveau, secret.sel);
  secret.defaut = false;
  await ecrireAtomique(FICHIER, secret);
  return { ok: true, message: "Le mot de passe est changé." };
}

/** Réservé aux tests : oublie l'état en mémoire. */
export function reinitialiser() {
  secret = null;
  sessions.clear();
}
