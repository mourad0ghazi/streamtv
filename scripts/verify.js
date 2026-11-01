#!/usr/bin/env node
/**
 * Contrôle d'une instance démarrée.
 *
 * Usage :
 *   node scripts/verify.js --base http://127.0.0.1:3000
 *
 * Chaque vérification est une requête réelle. Sortie : une erreur arrête la
 * sortie avec le code 1 ; un avertissement n'empêche pas la publication.
 */

const arguments_ = process.argv.slice(2);
const indexBase = arguments_.indexOf("--base");
const BASE = (indexBase >= 0 ? arguments_[indexBase + 1] : "http://127.0.0.1:3000").replace(/\/$/, "");

const erreurs = [];
const avertissements = [];
const reussites = [];

async function demander(chemin, options = {}) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), 10000);
  try {
    return await fetch(`${BASE}${chemin}`, { signal: controleur.signal, redirect: "manual", ...options });
  } finally {
    clearTimeout(minuteur);
  }
}

async function verifierPage(chemin, marqueur) {
  try {
    const reponse = await demander(chemin);
    if (reponse.status !== 200) {
      erreurs.push(`${chemin} répond ${reponse.status}`);
      return;
    }
    const corps = await reponse.text();
    if (!corps.includes(marqueur)) {
      erreurs.push(`${chemin} ne contient pas « ${marqueur} »`);
      return;
    }
    reussites.push(`${chemin} s'ouvre`);
  } catch (erreur) {
    erreurs.push(`${chemin} injoignable : ${erreur.message}`);
  }
}

async function verifierJson(chemin, controle, description) {
  try {
    const reponse = await demander(chemin);
    if (!reponse.ok) {
      erreurs.push(`${chemin} répond ${reponse.status}`);
      return null;
    }
    const charge = await reponse.json();
    const probleme = controle(charge);
    if (probleme) {
      erreurs.push(`${chemin} : ${probleme}`);
      return null;
    }
    reussites.push(description);
    return charge;
  } catch (erreur) {
    erreurs.push(`${chemin} : ${erreur.message}`);
    return null;
  }
}

await verifierPage("/", "StreamTV");
await verifierPage("/chaines", "StreamTV");
await verifierPage("/anime", "StreamTV");
await verifierPage("/films", "StreamTV");

const etat = await verifierJson(
  "/api/etat",
  (e) => (e.compte?.chaines > 0 ? null : "aucune chaîne au catalogue"),
  "l'état du catalogue répond"
);

const chaines = await verifierJson(
  "/api/chaines",
  (p) => {
    if (!Array.isArray(p.contenus)) return "pas de tableau de contenus";
    if (p.contenus.length > (p.taille ?? 0)) return "plus de cartes que le plafond";
    return null;
  },
  "le catalogue des chaînes est paginé"
);

const anime = await verifierJson(
  "/api/anime",
  (p) => ((p.contenus?.length ?? 0) >= 3 ? null : "moins de trois animés"),
  "les animés s'affichent (au moins trois)"
);

const films = await verifierJson(
  "/api/films",
  (p) => ((p.contenus?.length ?? 0) >= 3 ? null : "moins de trois films"),
  "les films s'affichent (au moins trois)"
);

await verifierJson(
  "/api/sources",
  (p) => (p.sources?.every((s) => s.licence && s.licence.length > 5) ? null : "une source est publiée sans licence"),
  "les sources publient leur licence"
);

await verifierJson(
  "/api/recherche?q=sintel",
  (p) => (Array.isArray(p.resultats) ? null : "pas de résultats"),
  "la recherche répond"
);

/* Les fichiers appelés par la page d'accueil doivent répondre. */
try {
  const page = await (await demander("/")).text();
  const references = [...page.matchAll(/(?:href|src)="(\/[^"?#]+)(\?[^"]*)?"/g)].map((m) => m[1] + (m[2] ?? ""));
  for (const reference of new Set(references)) {
    const reponse = await demander(reference);
    if (reponse.status !== 200) erreurs.push(`ressource ${reference} répond ${reponse.status}`);
  }
  reussites.push(`${new Set(references).size} ressources de la page d'accueil répondent`);
} catch (erreur) {
  erreurs.push(`lecture de la page d'accueil impossible : ${erreur.message}`);
}

/* La console doit refuser l'accès sans session. */
try {
  const reponse = await demander("/api/admin/sources");
  if (reponse.status !== 401) erreurs.push(`/api/admin/sources répond ${reponse.status} sans session (401 attendu)`);
  else reussites.push("la console refuse l'accès sans session");
} catch (erreur) {
  erreurs.push(`/api/admin/sources injoignable : ${erreur.message}`);
}

/* Attente d'un bandeau de démonstration cohérent avec le réglage. */
if (etat && etat.bandeauDemo === true) {
  avertissements.push("le bandeau de démonstration est actif : ne publiez pas cette configuration comme site réel");
}

/* Mot de passe par défaut : un seul avertissement attendu, en local. */
try {
  const session = await (await demander("/api/admin/session")).json();
  if (session.motDePasseParDefaut) {
    avertissements.push("le mot de passe par défaut de la console est actif (attendu en local, à changer avant publication)");
  }
} catch {
  avertissements.push("l'état de la console n'a pas pu être lu");
}

for (const reussite of reussites) console.log(`  ok    ${reussite}`);
for (const avertissement of avertissements) console.warn(`  note  ${avertissement}`);
for (const erreur of erreurs) console.error(`  échec ${erreur}`);

console.log(`\n${reussites.length} vérifications réussies, ${avertissements.length} avertissement(s), ${erreurs.length} erreur(s).`);
if (erreurs.length) process.exit(1);
