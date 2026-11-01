/**
 * Aiguillage des requêtes : pages publiques, API publique, API de la console.
 *
 * Une règle par mécanisme : la pagination et le plafond de cartes viennent de
 * catalogue.paginer et du réglage plafond_cartes, pour les trois familles.
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  contenus,
  sourcesPubliques,
  sourceParId,
  instantane,
  DOSSIER_DONNEES,
  ecrireAtomique
} from "./magasin.js";
import * as catalogue from "../public/js/partage/catalogue.js";
import * as reglages from "./reglages.js";
import * as audit from "./audit.js";
import * as auth from "./auth.js";
import * as sonde from "./sonde.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(RACINE, "public");

const TAILLE_CORPS_MAX = 64 * 1024;

function json(reponse, code, charge, entetes = {}) {
  const corps = JSON.stringify(charge);
  reponse.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(corps),
    ...entetes
  });
  reponse.end(corps);
}

function lireCookies(requete) {
  const brut = requete.headers.cookie ?? "";
  const resultat = {};
  for (const morceau of brut.split(";")) {
    const index = morceau.indexOf("=");
    if (index < 0) continue;
    resultat[morceau.slice(0, index).trim()] = decodeURIComponent(morceau.slice(index + 1).trim());
  }
  return resultat;
}

function lireCorps(requete) {
  return new Promise((resoudre, rejeter) => {
    let taille = 0;
    const morceaux = [];
    requete.on("data", (morceau) => {
      taille += morceau.length;
      if (taille > TAILLE_CORPS_MAX) {
        rejeter(new Error("Corps de requête trop volumineux."));
        requete.destroy();
        return;
      }
      morceaux.push(morceau);
    });
    requete.on("end", () => {
      if (!morceaux.length) return resoudre({});
      try {
        resoudre(JSON.parse(Buffer.concat(morceaux).toString("utf8")));
      } catch {
        rejeter(new Error("Corps de requête illisible : JSON attendu."));
      }
    });
    requete.on("error", rejeter);
  });
}

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

function licenceDeContenu(item, famille) {
  if (item.licence) return item.licence;
  const ids = item.sources ?? (item.source ? [item.source] : []);
  const libelles = ids.map((id) => sourceParId(id)?.licence).filter(Boolean);
  return libelles[0] ?? "Licence non renseignée";
}

function chainesFiltrees(requete) {
  return catalogue.filtrerChaines(contenus("chaines"), requete);
}

function categoriesChaines() {
  return catalogue.categoriesDe(contenus("chaines"));
}

function paysChaines() {
  return catalogue.paysDe(contenus("chaines"));
}

function ficheChaine(id) {
  const chaine = contenus("chaines").find((c) => c.id === id);
  if (!chaine) return null;
  const source = sourceParId(chaine.source);
  return { ...chaine, licence: licenceDeContenu(chaine, "chaines"), licenceSource: source?.licence ?? null, nomSource: source?.nom ?? null };
}

/** Réponse de la page Animé : rangées non vides, facettes des filtres. */
function reponseAnime(filtres) {
  const plafond = reglages.valeur("plafond_cartes");
  const tous = contenus("anime");
  const retenus = catalogue.filtrerAnime(tous, filtres);
  return {
    total: retenus.length,
    contenus: retenus,
    facettes: catalogue.facettesAnime(tous),
    rangees: catalogue.rangeesAnime(retenus, plafond)
  };
}

function ficheAnime(id) {
  const serie = contenus("anime").find((a) => a.id === id);
  if (!serie) return null;
  return {
    ...serie,
    licence: licenceDeContenu(serie, "anime"),
    sourcesDetail: (serie.sources ?? []).map((sid) => {
      const s = sourceParId(sid);
      return { id: sid, nom: s?.nom ?? sid, licence: s?.licence ?? "Licence non renseignée" };
    })
  };
}

/** Réponse de la page Films : rangées non vides, facettes des filtres. */
function reponseFilms(filtres) {
  const plafond = reglages.valeur("plafond_cartes");
  const maxGenre = reglages.valeur("rangees_genre_max");
  const tous = contenus("films");
  const retenus = catalogue.filtrerFilms(tous, filtres);
  return {
    total: retenus.length,
    contenus: retenus,
    facettes: catalogue.facettesFilms(tous),
    ...catalogue.rangeesFilms(retenus, plafond, maxGenre)
  };
}

function ficheFilm(id) {
  const film = contenus("films").find((f) => f.id === id);
  if (!film) return null;
  return {
    ...film,
    licence: licenceDeContenu(film, "films"),
    sourcesDetail: (film.sources ?? []).map((sid) => {
      const s = sourceParId(sid);
      return { id: sid, nom: s?.nom ?? sid, licence: s?.licence ?? "Licence non renseignée" };
    })
  };
}

/** Recherche globale : plafonnée, chaque résultat porte son type en toutes lettres. */
function rechercher(terme) {
  const plafond = reglages.valeur("plafond_cartes");
  return catalogue.rechercher(
    { chaines: contenus("chaines"), anime: contenus("anime"), films: contenus("films") },
    terme,
    plafond
  );
}

/* ------------------------------------------------------------------ */
/* Signalements                                                        */
/* ------------------------------------------------------------------ */

const FICHIER_SIGNALEMENTS = join(DOSSIER_DONNEES, "signalements.json");

async function compteursSignalements() {
  try {
    const bloc = JSON.parse(await readFile(FICHIER_SIGNALEMENTS, "utf8"));
    return bloc.compteurs && typeof bloc.compteurs === "object" ? bloc.compteurs : {};
  } catch (erreur) {
    if (erreur.code !== "ENOENT") throw erreur;
    return {};
  }
}

async function signaler(famille, id) {
  const plafond = reglages.valeur("plafond_signalements");
  const compteurs = await compteursSignalements();
  const cle = `${famille}:${id}`;
  compteurs[cle] = (compteurs[cle] ?? 0) + 1;
  const retire = compteurs[cle] > plafond;
  await ecrireAtomique(FICHIER_SIGNALEMENTS, { version: 1, compteurs });
  if (retire) {
    const bloc = instantane()[famille];
    if (bloc) {
      const restants = bloc.contenus.filter((c) => c.id !== id);
      if (restants.length !== bloc.contenus.length) {
        const { enregistrerCatalogue } = await import("./magasin.js");
        await enregistrerCatalogue(famille, { ...bloc, date: new Date().toISOString(), contenus: restants });
        await audit.journaliser("A30", { famille, id, signalements: compteurs[cle] }, "signalements");
      }
    }
  }
  return { compte: compteurs[cle], plafond, retire };
}

/* ------------------------------------------------------------------ */
/* Console                                                             */
/* ------------------------------------------------------------------ */

async function exigerSession(requete, reponse, permission) {
  const session = auth.verifierSession(lireCookies(requete).stv_session);
  if (!session) {
    json(reponse, 401, { erreur: "Session absente ou expirée. Reconnectez-vous." });
    return null;
  }
  if (permission && !auth.autoriser(session.role, permission)) {
    json(reponse, 403, { erreur: `Le rôle ${session.role} n'a pas la permission ${permission}.` });
    return null;
  }
  return session;
}

/**
 * Guide de zapping. Il ne s'invente pas : sans grille fournie par une source,
 * la route répond honnêtement qu'aucune grille n'est disponible, en donnant
 * tout de même la tranche horaire courante pour que la page se recadre seule.
 */
async function lireGuide() {
  const maintenant = new Date();
  const heure = `${String(maintenant.getHours()).padStart(2, "0")} h ${String(Math.floor(maintenant.getMinutes() / 30) * 30).padStart(2, "0")}`;
  try {
    const bloc = JSON.parse(await readFile(join(DOSSIER_DONNEES, "guide.json"), "utf8"));
    const creneaux = Array.isArray(bloc.creneaux) ? bloc.creneaux : [];
    if (creneaux.length) return { disponible: true, heure, creneaux };
  } catch (erreur) {
    if (erreur.code !== "ENOENT") throw erreur;
  }
  return {
    disponible: false,
    heure,
    raison: "Aucune source ne fournit de grille de programmes. Le guide s'affichera dès qu'une source EPG sera branchée."
  };
}

function statistiques() {
  const parSource = (famille) => {
    const comptes = {};
    for (const c of contenus(famille)) {
      const id = c.source ?? (c.sources ?? [])[0] ?? "inconnue";
      comptes[id] = (comptes[id] ?? 0) + 1;
    }
    return comptes;
  };
  const sans = (famille, test) => contenus(famille).filter(test).length;
  return {
    anime: {
      total: contenus("anime").length,
      parSource: parSource("anime"),
      sansAffiche: sans("anime", (a) => !a.affiche),
      sansEpisode: sans("anime", (a) => !(a.episodes ?? []).length),
      sansLicence: sans("anime", (a) => !a.licence && !(a.sources ?? []).length),
      derniers: [...contenus("anime")].slice(-3).reverse().map((a) => ({ id: a.id, titre: a.titre }))
    },
    films: {
      total: contenus("films").length,
      parSource: parSource("films"),
      sansAffiche: sans("films", (f) => !f.affiche),
      sansLicence: sans("films", (f) => !f.licence && !(f.sources ?? []).length),
      derniers: [...contenus("films")].slice(-3).reverse().map((f) => ({ id: f.id, titre: f.titre }))
    },
    chaines: { total: contenus("chaines").length }
  };
}

/* ------------------------------------------------------------------ */
/* Aiguillage                                                          */
/* ------------------------------------------------------------------ */

export async function traiter(requete, reponse) {
  const url = new URL(requete.url, "http://localhost");
  const chemin = url.pathname;
  const methode = requete.method;
  const requete_ = Object.fromEntries(url.searchParams.entries());

  if (!chemin.startsWith("/api/")) return false;

  await reglages.charger();
  await auth.initialiser();

  try {
    if (chemin === "/api/etat" && methode === "GET") {
      const plafond = reglages.valeur("plafond_cartes");
      return json(reponse, 200, {
        version: "3.18.0",
        date: instantane().chaines.date,
        plafondCartes: plafond,
        compte: {
          chaines: contenus("chaines").length,
          anime: contenus("anime").length,
          films: contenus("films").length
        },
        bandeauDemo: reglages.valeur("bandeau_demo"),
        attenteLecteur: reglages.valeur("attente_lecteur_secondes")
      }), true;
    }

    if (chemin === "/api/chaines" && methode === "GET") {
      const liste = chainesFiltrees(requete_);
      const page = catalogue.paginer(liste, requete_.page, requete_.taille, reglages.valeur("plafond_cartes"));
      return json(reponse, 200, page), true;
    }

    if (chemin === "/api/chaines/categories" && methode === "GET") {
      return json(reponse, 200, { categories: categoriesChaines(), pays: paysChaines() }), true;
    }

    if (chemin.startsWith("/api/chaines/") && methode === "GET") {
      const fiche = ficheChaine(chemin.slice("/api/chaines/".length));
      return fiche ? json(reponse, 200, fiche) : json(reponse, 404, { erreur: "Chaîne introuvable." }), true;
    }

    if (chemin === "/api/anime" && methode === "GET") {
      return json(reponse, 200, reponseAnime(requete_)), true;
    }

    if (chemin.startsWith("/api/anime/") && methode === "GET") {
      const fiche = ficheAnime(chemin.slice("/api/anime/".length));
      return fiche ? json(reponse, 200, fiche) : json(reponse, 404, { erreur: "Animé introuvable." }), true;
    }

    if (chemin === "/api/films" && methode === "GET") {
      return json(reponse, 200, reponseFilms(requete_)), true;
    }

    if (chemin.startsWith("/api/films/") && methode === "GET") {
      const fiche = ficheFilm(chemin.slice("/api/films/".length));
      return fiche ? json(reponse, 200, fiche) : json(reponse, 404, { erreur: "Film introuvable." }), true;
    }

    if (chemin === "/api/recherche" && methode === "GET") {
      return json(reponse, 200, rechercher(requete_.q ?? "")), true;
    }

    if (chemin === "/api/guide" && methode === "GET") {
      const guide = await lireGuide();
      return json(reponse, 200, guide), true;
    }

    if (chemin === "/api/sources" && methode === "GET") {
      return json(reponse, 200, { sources: sourcesPubliques() }), true;
    }

    if (chemin === "/api/signalements" && methode === "POST") {
      const corps = await lireCorps(requete);
      if (!["chaines", "anime", "films"].includes(corps.famille) || typeof corps.id !== "string") {
        return json(reponse, 400, { erreur: "Signalement incomplet : famille et identifiant sont requis." }), true;
      }
      return json(reponse, 200, await signaler(corps.famille, corps.id)), true;
    }

    /* ---------------- console ---------------- */

    if (chemin === "/api/admin/connexion" && methode === "POST") {
      const corps = await lireCorps(requete);
      const resultat = await auth.connexion({
        motDePasse: corps.motDePasse,
        code: corps.code,
        jetonAppareil: lireCookies(requete).stv_appareil,
        dureeMinutes: reglages.valeur("duree_session_minutes")
      });
      if (!resultat.ok) {
        await audit.journaliser("A02", { raison: resultat.raison }, "visiteur");
        const messages = {
          "mot-de-passe": "Mot de passe incorrect.",
          code: "Code de vérification incorrect ou périmé. Le code courant est affiché sur la sortie du serveur."
        };
        return json(reponse, 401, { erreur: messages[resultat.raison] ?? "Connexion refusée." }), true;
      }
      await audit.journaliser("A01", { nouvelAppareil: resultat.nouvelAppareil }, "administrateur");
      const entetes = ["stv_session=" + resultat.jeton + "; Path=/; HttpOnly; SameSite=Strict"];
      if (resultat.jetonAppareil) {
        entetes.push("stv_appareil=" + resultat.jetonAppareil + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000");
      }
      return json(reponse, 200, { role: "administrateur" }, { "set-cookie": entetes }), true;
    }

    if (chemin === "/api/admin/deconnexion" && methode === "POST") {
      auth.deconnexion(lireCookies(requete).stv_session);
      return json(reponse, 200, { ok: true }, { "set-cookie": ["stv_session=; Path=/; Max-Age=0"] }), true;
    }

    if (chemin === "/api/admin/session" && methode === "GET") {
      const session = auth.verifierSession(lireCookies(requete).stv_session);
      return json(reponse, 200, {
        connecte: Boolean(session),
        role: session?.role ?? null,
        permissions: session ? auth.permissions(session.role) : [],
        motDePasseParDefaut: auth.motDePasseParDefaut()
      }), true;
    }

    if (chemin === "/api/admin/sources" && methode === "GET") {
      if (!(await exigerSession(requete, reponse, "sources.lire"))) return true;
      const etats = await sonde.etats();
      const sourcess = instantane().sources.sources ?? [];
      return json(reponse, 200, {
        sources: sourcess.map((s) => ({
          ...s,
          sonde: etats[s.id] ?? { etat: "inconnu", tauxEchec: null, dernierMs: null, date: null },
          contenus: contenus("chaines").filter((c) => c.source === s.id).length
        }))
      }), true;
    }

    if (chemin.startsWith("/api/admin/sources/") && methode === "POST") {
      const session = await exigerSession(requete, reponse, "sources.ecrire");
      if (!session) return true;
      const id = decodeURIComponent(chemin.slice("/api/admin/sources/".length));
      const corps = await lireCorps(requete);
      const bloc = instantane().sources;
      const source = (bloc.sources ?? []).find((s) => s.id === id);
      if (!source) return json(reponse, 404, { erreur: "Source inconnue." }), true;

      if (corps.licence !== undefined) {
        const probleme = (await import("./import.js")).verifierLicence(corps.licence);
        if (probleme) return json(reponse, 400, { erreur: probleme }), true;
        const ancienne = source.licence;
        source.licence = String(corps.licence);
        await audit.journaliser("A11", { source: id, ancienne, nouvelle: source.licence }, session.role);
      }
      if (corps.priorite !== undefined) {
        if (!Number.isInteger(corps.priorite) || corps.priorite < 1 || corps.priorite > 10) {
          return json(reponse, 400, { erreur: "La priorité doit être un entier de 1 à 10." }), true;
        }
        source.priorite = corps.priorite;
      }
      if (corps.actif !== undefined) {
        if (typeof corps.actif !== "boolean") return json(reponse, 400, { erreur: "Le champ actif attend vrai ou faux." }), true;
        source.actif = corps.actif;
        await audit.journaliser("A10", { source: id, actif: source.actif }, session.role);
      }
      const { enregistrerSources, recharger } = await import("./magasin.js");
      await enregistrerSources(bloc);
      await recharger("sources");
      return json(reponse, 200, { source }), true;
    }

    if (chemin === "/api/admin/reglages" && methode === "GET") {
      if (!(await exigerSession(requete, reponse, "reglages.lire"))) return true;
      return json(reponse, 200, { valeurs: reglages.valeurs(), description: reglages.DESCRIPTION }), true;
    }

    if (chemin === "/api/admin/reglages" && methode === "POST") {
      const session = await exigerSession(requete, reponse, "reglages.ecrire");
      if (!session) return true;
      const corps = await lireCorps(requete);
      const avant = reglages.valeurs();
      const resultat = await reglages.modifier(corps);
      if (!resultat.applique) {
        return json(reponse, 400, { erreur: "Réglage refusé.", refuses: resultat.refuses }), true;
      }
      for (const [cle, valeur] of Object.entries(resultat.acceptes)) {
        await audit.journaliser("A20", { reglage: cle, ancienne: avant[cle], nouvelle: valeur }, session.role);
      }
      return json(reponse, 200, { valeurs: reglages.valeurs() }), true;
    }

    if (chemin === "/api/admin/audit" && methode === "GET") {
      if (!(await exigerSession(requete, reponse, "audit.lire"))) return true;
      return json(reponse, 200, { entrees: await audit.lire(200), codes: audit.CODES }), true;
    }

    if (chemin === "/api/admin/statistiques" && methode === "GET") {
      if (!(await exigerSession(requete, reponse, "statistiques.lire"))) return true;
      return json(reponse, 200, statistiques()), true;
    }

    if (chemin === "/api/admin/sonder" && methode === "POST") {
      const session = await exigerSession(requete, reponse, "sources.lire");
      if (!session) return true;
      const resultats = await sonde.sonderTout(instantane().sources.sources ?? []);
      return json(reponse, 200, { resultats }), true;
    }

    if (chemin === "/api/admin/import" && methode === "POST") {
      const session = await exigerSession(requete, reponse, "import.lancer");
      if (!session) return true;
      const corps = await lireCorps(requete);
      const bloc = instantane().sources;
      const candidates = (bloc.sources ?? []).filter((s) => !corps.id || s.id === corps.id);
      const { importerSources } = await import("./import.js");
      const resultat = await importerSources(candidates);
      for (const r of resultat.resultats) {
        await audit.journaliser("A12", { source: r.source, accepte: r.accepte, message: r.message, ajoutes: r.ajoutes }, session.role);
      }
      return json(reponse, 200, resultat), true;
    }

    if (chemin === "/api/admin/motdepasse" && methode === "POST") {
      const session = await exigerSession(requete, reponse, "reglages.ecrire");
      if (!session) return true;
      const corps = await lireCorps(requete);
      const resultat = await auth.changerMotDePasse(corps.ancien, corps.nouveau);
      return json(reponse, resultat.ok ? 200 : 400, resultat), true;
    }

    return json(reponse, 404, { erreur: "Route inconnue." }), true;
  } catch (erreur) {
    return json(reponse, 400, { erreur: erreur.message ?? "Requête refusée." }), true;
  }
}

export { PUBLIC };
