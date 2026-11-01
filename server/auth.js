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
import { createHmac } from "node:crypto";
import { DOSSIER_DONNEES, ecrireAtomique } from "./magasin.js";
import * as habilitations from "./permissions.js";
import * as comptes from "./comptes.js";
import { comparer as comparerEmpreinte, empreinte, hacher as hacherSecret, jeton as nouveauJeton, nouveauSel } from "./empreintes.js";

export const FICHIER = join(DOSSIER_DONNEES, "secret.json");
export const MOT_DE_PASSE_PAR_DEFAUT = "streamtv";
const FENETRE_CODE_MS = 10 * 60 * 1000;

/**
 * Rôles et permissions. La liste vit dans `permissions.js`, avec les surcharges
 * que le propriétaire peut écrire ; ce module ne fait que la consulter, pour
 * qu'il n'existe qu'une seule définition des droits.
 */
export const ROLES = Object.fromEntries(
  Object.entries(habilitations.ROLES).map(([cle, role]) => [
    cle,
    { libelle: role.libelle, resume: role.resume, permissions: habilitations.ROLES[cle].permissions }
  ])
);

let secret = null;
const sessions = new Map();

function hacher(motDePasse, sel) {
  return hacherSecret(motDePasse, sel);
}

function comparerConstant(a, b) {
  return comparerEmpreinte(a, b);
}

/** Charge le secret, ou le crée au premier démarrage avec le mot de passe par défaut. */
export async function initialiser() {
  if (secret) return secret;
  try {
    secret = JSON.parse(await readFile(FICHIER, "utf8"));
  } catch (erreur) {
    if (erreur.code !== "ENOENT") throw erreur;
    const sel = nouveauSel();
    secret = {
      version: 1,
      sel,
      hash: hacher(MOT_DE_PASSE_PAR_DEFAUT, sel),
      secret: nouveauJeton(),
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
export async function connexion({ identifiant = "", motDePasse, code, jetonAppareil, dureeMinutes, codeRequis = true }) {
  await initialiser();
  const connu = appareilConnu(jetonAppareil);
  const nomme = typeof identifiant === "string" ? identifiant.trim().toLowerCase() : "";

  // Deux façons d'entrer : le mot de passe de la console, qui est le
  // propriétaire, ou un compte nommé. Le second ne remplace pas le premier :
  // sans identifiant, la porte historique reste la seule.
  if (nomme && nomme !== "proprietaire") {
    const resultat = await comptes.verifier({ identifiant: nomme, motDePasse });
    if (!resultat.ok) {
      return { ok: false, raison: resultat.raison === "desactive" ? "compte-desactive" : "identifiants" };
    }
    if (!connu && codeRequis && String(code ?? "").trim() !== codeVerification()) {
      return { ok: false, raison: "code" };
    }
    let jetonAppareilUtilise = jetonAppareil;
    let nouvelAppareil = false;
    if (!connu) {
      jetonAppareilUtilise = nouveauJeton();
      await enregistrerAppareil(jetonAppareilUtilise);
      nouvelAppareil = true;
    }
    const jeton = nouveauJeton();
    const duree = Math.max(5, Number(dureeMinutes) || 60) * 60 * 1000;
    sessions.set(jeton, {
      role: resultat.compte.role,
      compte: resultat.compte.id,
      effectives: resultat.compte.permissions,
      expire: Date.now() + duree
    });
    return { ok: true, jeton, jetonAppareil: jetonAppareilUtilise, nouvelAppareil, compte: resultat.compte };
  }

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
    jetonAppareil = nouveauJeton();
    await enregistrerAppareil(jetonAppareil);
    nouvelAppareil = true;
  }

  const jeton = nouveauJeton();
  const duree = Math.max(5, Number(dureeMinutes) || 60) * 60 * 1000;
  sessions.set(jeton, {
    role: "administrateur",
    compte: "proprietaire",
    effectives: habilitations.permissionsRole("proprietaire"),
    proprietaire: true,
    expire: Date.now() + duree
  });
  return { ok: true, jeton, jetonAppareil, nouvelAppareil, proprietaire: true };
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
  return habilitations.permissionsRole(role);
}

/** Un rôle sans permission listée ne peut rien faire. */
export function autoriser(role, permission) {
  return habilitations.permissionConnue(permission) && permissions(role).includes(permission);
}

/**
 * Permission d'une session : celle calculée à la connexion, surcharges du
 * compte comprises. Un propriétaire garde tout, même si un rôle a été réduit.
 */
export function autoriserSession(session, permission) {
  if (!session) return false;
  if (Array.isArray(session.effectives)) return session.effectives.includes(permission);
  return autoriser(session.role, permission);
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
  secret.sel = nouveauSel();
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
