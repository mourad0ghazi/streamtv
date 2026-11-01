/**
 * Routes de la console : tout ce qui se passe dans /api/admin/ en dehors des
 * sources, des réglages et du journal, qui vivaient déjà dans routeur.js.
 *
 * Le module ne connaît ni les cookies ni les sessions : l'aiguilleur lui passe
 * `exiger(permission)`, qui répond 401 ou 403 et renvoie null si l'accès est
 * refusé. Chaque route déclare donc sa permission en une ligne, lisible.
 */

import * as tableau from "./tableau.js";
import * as assistant from "./assistant.js";
import * as apparence from "./apparence.js";
import * as accueil from "./accueil.js";
import * as lecture from "./lecture.js";
import * as comptes from "./comptes.js";
import * as permissions from "./permissions.js";
import * as incidents from "./incidents.js";
import * as audit from "./audit.js";
import * as filmsAjoutes from "./films-ajoutes.js";

function auteurDe(session) {
  return session?.compte && session.compte !== "proprietaire" ? session.compte : session?.role ?? "console";
}

/** Une réponse d'erreur homogène : la console n'a qu'un format à lire. */
function refus(json, reponse, resultat, code = 400) {
  return json(reponse, code, { erreur: resultat.message ?? "Changement refusé.", refuses: resultat.refuses ?? null }), true;
}

export async function traiterConsole(contexte) {
  const { chemin, methode, requete, reponse, exiger, json, lireCorps, version } = contexte;
  const racine = "/api/admin/";

  if (chemin === `${racine}tableau-de-bord` && methode === "GET") {
    if (!(await exiger("tableau.lire"))) return true;
    return json(reponse, 200, await tableau.tableauDeBord({ version })), true;
  }

  /* -------------------------------------------------------------- */
  /* Assistant et diagnostic                                         */
  /* -------------------------------------------------------------- */

  if (chemin === `${racine}diagnostic` && methode === "GET") {
    if (!(await exiger("ia.utiliser"))) return true;
    return json(reponse, 200, { ...(await assistant.diagnostic()), exemples: assistant.EXEMPLES, historique: assistant.historiqueActions() }), true;
  }

  if (chemin === `${racine}assistant` && methode === "POST") {
    if (!(await exiger("ia.utiliser"))) return true;
    const corps = await lireCorps(requete);
    const proposition = await assistant.demander(corps.phrase);
    if (proposition.diagnostic) {
      return json(reponse, 200, { ...proposition, diagnostic: await assistant.diagnostic() }), true;
    }
    return json(reponse, 200, proposition), true;
  }

  if (chemin === `${racine}assistant/appliquer` && methode === "POST") {
    const session = await exiger("ia.utiliser");
    if (!session) return true;
    const corps = await lireCorps(requete);
    const resultat = await assistant.appliquer(corps.actions, { auteur: auteurDe(session) });
    return json(reponse, resultat.ok ? 200 : 400, resultat), true;
  }

  if (chemin === `${racine}assistant/annuler` && methode === "POST") {
    const session = await exiger("ia.utiliser");
    if (!session) return true;
    const resultat = await assistant.annuler({ auteur: auteurDe(session) });
    return json(reponse, resultat.ok ? 200 : 400, resultat), true;
  }

  /* -------------------------------------------------------------- */
  /* Apparence                                                       */
  /* -------------------------------------------------------------- */

  if (chemin === `${racine}apparence` && methode === "GET") {
    if (!(await exiger("affichage.lire"))) return true;
    return json(reponse, 200, await apparence.etat()), true;
  }

  if (chemin === `${racine}apparence` && methode === "POST") {
    const session = await exiger("affichage.ecrire");
    if (!session) return true;
    const corps = await lireCorps(requete);
    const avant = apparence.valeurs();
    const resultat = await apparence.modifier(corps);
    if (!resultat.applique) return refus(json, reponse, resultat);
    await audit.journaliser("A14", { avant, apres: apparence.valeurs() }, auteurDe(session));
    return json(reponse, 200, await apparence.etat()), true;
  }

  /* -------------------------------------------------------------- */
  /* Accueil                                                         */
  /* -------------------------------------------------------------- */

  if (chemin === `${racine}accueil` && methode === "GET") {
    if (!(await exiger("accueil.lire"))) return true;
    return json(reponse, 200, { sections: accueil.valeurs(), types: accueil.TYPES }), true;
  }

  if (chemin === `${racine}accueil` && methode === "POST") {
    const session = await exiger("accueil.ecrire");
    if (!session) return true;
    const corps = await lireCorps(requete);
    const avant = accueil.valeurs();
    let resultat;
    if (corps.sections !== undefined) resultat = await accueil.remplacer(corps.sections);
    else if (corps.ajouter !== undefined) resultat = await accueil.ajouter(corps.ajouter);
    else if (corps.modifier !== undefined) resultat = await accueil.modifier(corps.modifier.id, corps.modifier.champs ?? {});
    else if (corps.deplacer !== undefined) resultat = await accueil.deplacer(corps.deplacer.id, corps.deplacer.sens);
    else if (corps.supprimer !== undefined) resultat = await accueil.supprimer(corps.supprimer);
    else resultat = { ok: false, message: "Action d'accueil inconnue." };
    if (!resultat.ok) return refus(json, reponse, resultat);
    await audit.journaliser("A15", { avant: avant.map((s) => s.id), apres: accueil.valeurs().map((s) => s.id) }, auteurDe(session));
    return json(reponse, 200, { sections: resultat.sections ?? accueil.valeurs(), types: accueil.TYPES }), true;
  }

  /* -------------------------------------------------------------- */
  /* Lecture                                                         */
  /* -------------------------------------------------------------- */

  if (chemin === `${racine}lecture` && methode === "GET") {
    if (!(await exiger("lecture.lire"))) return true;
    return json(reponse, 200, { statut: await lecture.statut(), description: lecture.DESCRIPTION, valeurs: lecture.valeurs() }), true;
  }

  if (chemin === `${racine}lecture` && methode === "POST") {
    const session = await exiger("lecture.ecrire");
    if (!session) return true;
    const corps = await lireCorps(requete);
    const resultat = await lecture.modifier(corps);
    if (!resultat.applique) return refus(json, reponse, resultat);
    const champs = Object.keys(resultat.acceptes);
    await audit.journaliser("A13", { champs, cleChangee: champs.includes("cle") }, auteurDe(session));
    return json(reponse, 200, { statut: await lecture.statut(), valeurs: lecture.valeurs() }), true;
  }

  if (chemin === `${racine}lecture/attestation` && methode === "POST") {
    const session = await exiger("lecture.ecrire");
    if (!session) return true;
    const corps = await lireCorps(requete);
    const resultat = await lecture.attester({ droits: corps.droits, auteur: corps.auteur, note: corps.note });
    if (!resultat.ok) return refus(json, reponse, resultat);
    await audit.journaliser("A13", { attestation: resultat.attestation.droits, auteur: resultat.attestation.auteur }, auteurDe(session));
    return json(reponse, 200, { statut: await lecture.statut(), attestation: resultat.attestation }), true;
  }

  /* -------------------------------------------------------------- */
  /* Utilisateurs et permissions                                     */
  /* -------------------------------------------------------------- */

  if (chemin === `${racine}utilisateurs` && methode === "GET") {
    if (!(await exiger("utilisateurs.lire"))) return true;
    return json(reponse, 200, {
      comptes: await comptes.lister(),
      roles: permissions.listeRoles(),
      catalogue: permissions.PERMISSIONS,
      groupes: permissions.GROUPES
    }), true;
  }

  if (chemin === `${racine}utilisateurs` && methode === "POST") {
    const session = await exiger("utilisateurs.ecrire");
    if (!session) return true;
    const corps = await lireCorps(requete);
    const resultat = await comptes.creer(corps);
    if (!resultat.ok) return refus(json, reponse, resultat);
    await audit.journaliser("A41", { action: "creation", compte: resultat.compte.identifiant, role: resultat.compte.role }, auteurDe(session));
    return json(reponse, 201, { compte: resultat.compte, comptes: await comptes.lister() }), true;
  }

  if (chemin.startsWith(`${racine}utilisateurs/`)) {
    const id = decodeURIComponent(chemin.slice(`${racine}utilisateurs/`.length));
    if (methode === "POST") {
      const session = await exiger("utilisateurs.ecrire");
      if (!session) return true;
      const corps = await lireCorps(requete);
      const resultat = await comptes.modifier(id, corps);
      if (!resultat.ok) return refus(json, reponse, resultat);
      await audit.journaliser("A41", { action: "modification", compte: resultat.compte.identifiant, role: resultat.compte.role }, auteurDe(session));
      return json(reponse, 200, { compte: resultat.compte, comptes: await comptes.lister() }), true;
    }
    if (methode === "DELETE") {
      const session = await exiger("utilisateurs.ecrire");
      if (!session) return true;
      const resultat = await comptes.supprimer(id);
      if (!resultat.ok) return refus(json, reponse, resultat);
      await audit.journaliser("A41", { action: "suppression", compte: id }, auteurDe(session));
      return json(reponse, 200, { comptes: await comptes.lister() }), true;
    }
  }

  if (chemin === `${racine}permissions` && methode === "GET") {
    if (!(await exiger("utilisateurs.lire"))) return true;
    return json(reponse, 200, {
      roles: permissions.listeRoles(),
      catalogue: permissions.PERMISSIONS,
      groupes: permissions.GROUPES
    }), true;
  }

  if (chemin === `${racine}permissions` && methode === "POST") {
    const session = await exiger("roles.ecrire");
    if (!session) return true;
    const corps = await lireCorps(requete);
    const resultat = await permissions.changerRole(corps.role, corps.permissions);
    if (!resultat.ok) return refus(json, reponse, resultat);
    await audit.journaliser("A40", { role: resultat.role, permissions: resultat.permissions }, auteurDe(session));
    return json(reponse, 200, { roles: permissions.listeRoles() }), true;
  }

  /* -------------------------------------------------------------- */
  /* Films ajoutés par TMDb                                          */
  /* -------------------------------------------------------------- */

  if (chemin === `${racine}films/ajoutes` && methode === "GET") {
    if (!(await exiger("catalogue.lire"))) return true;
    return json(reponse, 200, { films: await filmsAjoutes.lister(), plafond: 200 }), true;
  }

  if (chemin === `${racine}films/ajoutes` && methode === "POST") {
    const session = await exiger("catalogue.ecrire");
    if (!session) return true;
    const corps = await lireCorps(requete);
    const resultat = await filmsAjoutes.ajouter({ tmdbId: corps.tmdbId });
    if (!resultat.ok) return refus(json, reponse, resultat);
    await audit.journaliser("A16", { film: resultat.film.id, tmdb: resultat.film.tmdbId, titre: resultat.film.titre }, auteurDe(session));
    return json(reponse, 201, resultat), true;
  }

  if (chemin.startsWith(`${racine}films/ajoutes/`) && methode === "DELETE") {
    const session = await exiger("catalogue.ecrire");
    if (!session) return true;
    const id = decodeURIComponent(chemin.slice(`${racine}films/ajoutes/`.length));
    const resultat = await filmsAjoutes.supprimer(id);
    if (!resultat.ok) return refus(json, reponse, resultat);
    await audit.journaliser("A16", { film: id, action: "suppression" }, auteurDe(session));
    return json(reponse, 200, resultat), true;
  }

  /* -------------------------------------------------------------- */
  /* Incidents                                                       */
  /* -------------------------------------------------------------- */

  if (chemin === `${racine}incidents` && methode === "GET") {
    if (!(await exiger("incidents.lire"))) return true;
    await incidents.rafraichir();
    return json(reponse, 200, { incidents: await incidents.lister({ limite: 100 }), total: await incidents.total() }), true;
  }

  if (chemin === `${racine}incidents/vider` && methode === "POST") {
    const session = await exiger("incidents.lire");
    if (!session) return true;
    await incidents.vider();
    await audit.journaliser("A52", { action: "vidage" }, auteurDe(session));
    return json(reponse, 200, { incidents: [], total: 0 }), true;
  }

  return false;
}
