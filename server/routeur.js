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
import * as clesFilms from "./cles-films.js";
import * as tmdb from "./tmdb.js";
import * as apparence from "./apparence.js";
import * as accueil from "./accueil.js";
import * as lecture from "./lecture.js";
import * as incidents from "./incidents.js";
import { traiterConsole } from "./routes-console.js";
import * as filmsAjoutes from "./films-ajoutes.js";
import * as comptes from "./comptes.js";
import * as proxy from "./proxy-flux.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(RACINE, "public");

/**
 * Version du paquet, lue une fois. Le serveur ne la recopie pas : une version
 * écrite deux fois finit toujours par diverger de l'autre.
 */
const PAQUET = JSON.parse(await readFile(join(RACINE, "package.json"), "utf8"));
export const VERSION = PAQUET.version;

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

/**
 * Jeton de session, quel que soit son transport.
 *
 * Le cookie `stv_session` reste la voie normale. Mais un site affiché dans un
 * cadre venu d'un autre domaine (l'aperçu de l'atelier, par exemple) ne reçoit
 * jamais un cookie `SameSite=Strict` : la session est créée puis ignorée, et la
 * console redemande le mot de passe en boucle. Le même jeton est donc accepté
 * dans un en-tête `authorization: Bearer …`, que le cadre transmet sans
 * discussion. Un seul jeton, deux transports, aucune session au rabais.
 */
function jetonSession(requete) {
  const entete = requete.headers.authorization ?? "";
  if (entete.startsWith("Bearer ")) return entete.slice(7).trim();
  return lireCookies(requete).stv_session ?? "";
}

/** Jeton d'appareil : verrou posé au premier code accepté. */
function jetonAppareil(requete) {
  const direct = requete.headers["x-stv-appareil"];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  return lireCookies(requete).stv_appareil ?? "";
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
  if (item.origine === "TMDb") return "Flux tiers, droits attestés par l'administrateur";
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
async function reponseFilms(filtres) {
  const plafond = reglages.valeur("plafond_cartes");
  const maxGenre = reglages.valeur("rangees_genre_max");
  // Les films ajoutés par la console complètent le catalogue livré ; ils ne le
  // modifient pas.
  const tous = await filmsAjoutes.fusionner(contenus("films"));
  const retenus = catalogue.filtrerFilms(tous, filtres);
  return {
    total: retenus.length,
    contenus: retenus,
    facettes: catalogue.facettesFilms(tous),
    ...catalogue.rangeesFilms(retenus, plafond, maxGenre)
  };
}

async function ficheFilm(id) {
  const film = (await filmsAjoutes.fusionner(contenus("films"))).find((f) => f.id === id);
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
async function rechercher(terme) {
  const plafond = reglages.valeur("plafond_cartes");
  return catalogue.rechercher(
    { chaines: contenus("chaines"), anime: contenus("anime"), films: await filmsAjoutes.fusionner(contenus("films")) },
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

async function exigerSession(requete, reponse, permission, options = {}) {
  if (options.accesLibre) return { role: "administrateur", libre: true };
  const session = auth.verifierSession(jetonSession(requete));
  if (!session) {
    json(reponse, 401, { erreur: "Session absente ou expirée. Reconnectez-vous." });
    return null;
  }
  if (permission && !auth.autoriserSession(session, permission)) {
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

/** Résumé de la couverture des playlists déclarées par le porteur. */
async function resumePlaylists() {
  try {
    const bloc = JSON.parse(await readFile(join(DOSSIER_DONNEES, "playlists.json"), "utf8"));
    const liste = Array.isArray(bloc.playlists) ? bloc.playlists : [];
    return {
      total: liste.length,
      avecContenus: liste.filter((p) => p.contenus > 0).length,
      vides: liste.filter((p) => p.contenus === 0).map((p) => ({ libelle: p.libelle, portee: p.portee, url: p.url }))
    };
  } catch (erreur) {
    if (erreur.code !== "ENOENT") throw erreur;
    return { total: 0, avecContenus: 0, vides: [] };
  }
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

/**
 * Accès libre à la console, décidé par le réglage `console_sans_mot_de_passe`.
 *
 * Il ne vaut que sur la surface d'administration : le site public garde son mot
 * de passe, quoi qu'il arrive. Sans cette restriction, activer le réglage
 * ouvrirait aussi la console servie avec le catalogue, c'est-à-dire la porte la
 * plus exposée. Le chemin privé reste en place dans tous les cas.
 */
let accesLibreJournalise = false;

export async function traiter(requete, reponse, options = {}) {
  const url = new URL(requete.url, "http://localhost");
  const chemin = url.pathname;
  const methode = requete.method;
  const requete_ = Object.fromEntries(url.searchParams.entries());
  const surface = options.surface === "administration" ? "administration" : "site";
  const accesLibre = () => surface === "administration" && reglages.valeur("console_sans_mot_de_passe") === true;

  // Relais de flux : le navigateur demande au site, le site demande à la
  // chaîne. C'est ce qui règle le CORS, le contenu mixte et le User-Agent.
  if (chemin === proxy.CHEMIN) {
    // `traiter` rafraîchit lui-même les réglages de lecture.
    return proxy.traiter({ requete, reponse, recherche: url.searchParams });
  }

  // Feuille d'apparence du site : un vrai fichier CSS, servi par le serveur,
  // pour que la politique de sécurité n'ait pas à autoriser de style en ligne.
  if (chemin === "/apparence.css" && methode === "GET") {
    await apparence.rafraichir();
    reponse.writeHead(200, {
      "content-type": "text/css; charset=utf-8",
      "cache-control": "no-cache"
    });
    reponse.end(await apparence.feuille());
    return true;
  }

  if (!chemin.startsWith("/api/")) return false;

  await reglages.charger();
  await auth.initialiser();
  await comptes.rafraichir();

  try {
    if (chemin === "/api/etat" && methode === "GET") {
      const plafond = reglages.valeur("plafond_cartes");
      await lecture.rafraichir();
      return json(reponse, 200, {
        version: VERSION,
        date: instantane().chaines.date,
        plafondCartes: plafond,
        compte: {
          chaines: contenus("chaines").length,
          anime: contenus("anime").length,
          films: contenus("films").length
        },
        bandeauDemo: reglages.valeur("bandeau_demo"),
        attenteLecteur: reglages.valeur("attente_lecteur_secondes"),
        // Le lecteur n'aiguille par le relais que si l'administrateur l'a ouvert.
        proxyActif: (await lecture.statut()).proxy_actif === true
      }), true;
    }

    if (chemin === "/api/chaines" && methode === "GET") {
      const liste = chainesFiltrees(requete_);
      const page = catalogue.paginer(liste, requete_.page, requete_.taille, reglages.valeur("plafond_cartes"));
      return json(reponse, 200, page), true;
    }

    if (chemin === "/api/chaines/zapping" && methode === "GET") {
      const zapping = catalogue.listeZapping(contenus("chaines"), requete_, 300);
      return json(reponse, 200, zapping), true;
    }

    if (chemin === "/api/chaines/categories" && methode === "GET") {
      return json(reponse, 200, { categories: categoriesChaines(), pays: paysChaines(), regions: catalogue.regionsDe(contenus("chaines")) }), true;
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
      return json(reponse, 200, await reponseFilms(requete_)), true;
    }

    // Lecture d'un film : le fournisseur tiers s'il est ouvert et attesté,
    // sinon le fichier du catalogue. La fiche ne devine jamais.
    if (chemin.startsWith("/api/films/") && chemin.endsWith("/lecture") && methode === "GET") {
      const film = await ficheFilm(chemin.slice("/api/films/".length, -"/lecture".length));
      if (!film) return json(reponse, 404, { erreur: "Film introuvable." }), true;
      await lecture.rafraichir();
      const progress = Number.parseInt(requete_.progress ?? "0", 10);
      const tmdbId = Number.parseInt(String(film.tmdbId ?? ""), 10);
      const tiers = await lecture.lienFilm({ tmdbId: Number.isInteger(tmdbId) ? tmdbId : null, progress });
      if (tiers.disponible) return json(reponse, 200, { type: "fournisseur", ...tiers }), true;
      return json(reponse, 200, {
        type: "fichier",
        disponible: Boolean(film.url),
        url: film.url ?? null,
        raison: tiers.raison
      }), true;
    }

    if (chemin.startsWith("/api/films/") && chemin.endsWith("/tmdb") && methode === "GET") {
      const film = await ficheFilm(chemin.slice("/api/films/".length, -"/tmdb".length));
      if (!film) return json(reponse, 404, { erreur: "Film introuvable." }), true;
      const resultat = await tmdb.ficheFilm(film);
      return json(reponse, 200, resultat), true;
    }

    if (chemin.startsWith("/api/films/") && methode === "GET") {
      const fiche = await ficheFilm(chemin.slice("/api/films/".length));
      return fiche ? json(reponse, 200, fiche) : json(reponse, 404, { erreur: "Film introuvable." }), true;
    }

    if (chemin === "/api/recherche" && methode === "GET") {
      return json(reponse, 200, await rechercher(requete_.q ?? "")), true;
    }

    if (chemin === "/api/guide" && methode === "GET") {
      const guide = await lireGuide();
      return json(reponse, 200, guide), true;
    }

    if (chemin === "/api/sources" && methode === "GET") {
      return json(reponse, 200, { sources: sourcesPubliques() }), true;
    }

    // Apparence : la page reçoit une feuille de variables, jamais un réglage
    // libre. Sans réseau, le site garde ses jetons d'origine.
    if (chemin === "/api/apparence" && methode === "GET") {
      await apparence.rafraichir();
      return json(reponse, 200, { feuille: await apparence.feuille(), valeurs: apparence.valeurs() }), true;
    }

    if (chemin === "/api/accueil" && methode === "GET") {
      await accueil.rafraichir();
      return json(reponse, 200, { sections: accueil.valeurs() }), true;
    }


    if (chemin === "/api/incidents" && methode === "POST") {
      const corps = await lireCorps(requete);
      const resultat = await incidents.enregistrer(corps);
      return json(reponse, resultat.ok ? 202 : 400, resultat), true;
    }

    if (chemin === "/api/signalements" && methode === "POST") {
      const corps = await lireCorps(requete);
      if (!["chaines", "anime", "films"].includes(corps.famille) || typeof corps.id !== "string") {
        return json(reponse, 400, { erreur: "Signalement incomplet : famille et identifiant sont requis." }), true;
      }
      return json(reponse, 200, await signaler(corps.famille, corps.id)), true;
    }

    /* ---------------- console ---------------- */

    // Les routes de la nouvelle console vivent dans routes-console.js : elles
    // déclarent leur permission, l'aiguilleur répond 401 ou 403.
    if (chemin.startsWith("/api/admin/")) {
      const traitee = await traiterConsole({
        chemin,
        methode,
        requete,
        reponse,
        json,
        lireCorps,
        version: VERSION,
        exiger: (permission) => exigerSession(requete, reponse, permission, { accesLibre: accesLibre() })
      });
      if (traitee) return true;
    }

    if (chemin === "/api/admin/connexion" && methode === "POST") {
      if (accesLibre()) {
        if (!accesLibreJournalise) {
          accesLibreJournalise = true;
          await audit.journaliser("A01", { acces: "libre", surface }, "administrateur");
        }
        return json(reponse, 200, { role: "administrateur", accesLibre: true }), true;
      }
      const corps = await lireCorps(requete);
      const resultat = await auth.connexion({
        identifiant: corps.identifiant ?? "",
        motDePasse: corps.motDePasse,
        code: corps.code,
        jetonAppareil: jetonAppareil(requete),
        dureeMinutes: reglages.valeur("duree_session_minutes"),
        codeRequis: reglages.valeur("code_verification") === true
      });
      if (!resultat.ok) {
        await audit.journaliser("A02", { raison: resultat.raison }, "visiteur");
        const messages = {
          "mot-de-passe": "Mot de passe incorrect.",
          identifiants: "Identifiant ou mot de passe incorrect.",
          "compte-desactive": "Ce compte est désactivé. Demandez sa réactivation au propriétaire.",
          code: "Code de vérification incorrect ou périmé. Le code courant est affiché sur la sortie du serveur."
        };
        return json(reponse, 401, { erreur: messages[resultat.raison] ?? "Connexion refusée." }), true;
      }
      await audit.journaliser("A01", { nouvelAppareil: resultat.nouvelAppareil }, resultat.compte?.identifiant ?? "administrateur");
      const entetes = ["stv_session=" + resultat.jeton + "; Path=/; HttpOnly; SameSite=Strict"];
      if (resultat.jetonAppareil) {
        entetes.push("stv_appareil=" + resultat.jetonAppareil + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000");
      }
      // Le jeton part aussi dans le corps : un cadre d'un autre domaine ne
      // garde pas le cookie, mais il garde la réponse.
      return json(
        reponse,
        200,
        {
          role: resultat.compte?.role ?? "administrateur",
          compte: resultat.compte ? { id: resultat.compte.id, nom: resultat.compte.nom } : { id: "proprietaire", nom: "Propriétaire de la console" },
          proprietaire: resultat.proprietaire === true || !resultat.compte,
          jeton: resultat.jeton,
          jetonAppareil: resultat.jetonAppareil ?? null
        },
        { "set-cookie": entetes }
      ), true;
    }

    if (chemin === "/api/admin/deconnexion" && methode === "POST") {
      if (accesLibre()) return json(reponse, 200, { ok: true, accesLibre: true }), true;
      auth.deconnexion(jetonSession(requete));
      return json(reponse, 200, { ok: true }, { "set-cookie": ["stv_session=; Path=/; Max-Age=0"] }), true;
    }

    if (chemin === "/api/admin/session" && methode === "GET") {
      if (accesLibre()) {
        return json(reponse, 200, {
          connecte: true,
          accesLibre: true,
          role: "administrateur",
          proprietaire: true,
          compte: { id: "proprietaire", nom: "Accès libre de la console" },
          permissions: auth.permissions("proprietaire"),
          motDePasseParDefaut: auth.motDePasseParDefaut(),
          codeRequis: false
        }), true;
      }
      const session = auth.verifierSession(jetonSession(requete));
      return json(reponse, 200, {
        connecte: Boolean(session),
        role: session?.role ?? null,
        proprietaire: session?.compte === "proprietaire",
        compte: session?.compte ?? null,
        permissions: session ? (session.effectives ?? auth.permissions(session.role)) : [],
        motDePasseParDefaut: auth.motDePasseParDefaut(),
        codeRequis: reglages.valeur("code_verification") === true
      }), true;
    }

    if (chemin === "/api/admin/sources" && methode === "GET") {
      if (!(await exigerSession(requete, reponse, "sources.lire", { accesLibre: accesLibre() }))) return true;
      const etats = await sonde.etats();
      const sourcess = instantane().sources.sources ?? [];
      // Un contenu compte pour sa source, quelle que soit la famille : un film
      // rattaché à une source de vidéo à la demande ne doit pas afficher zéro.
      const comptes = new Map();
      const ajouter = (id) => comptes.set(id, (comptes.get(id) ?? 0) + 1);
      for (const c of contenus("chaines")) if (c.source) ajouter(c.source);
      for (const famille of ["anime", "films"]) {
        for (const c of contenus(famille)) {
          for (const id of c.sources ?? []) ajouter(id);
        }
      }
      return json(reponse, 200, {
        sources: sourcess.map((s) => ({
          ...s,
          sonde: etats[s.id] ?? { etat: "inconnu", tauxEchec: null, dernierMs: null, date: null },
          contenus: comptes.get(s.id) ?? 0
        })),
        playlists: await resumePlaylists()
      }), true;
    }

    if (chemin.startsWith("/api/admin/sources/") && methode === "POST") {
      const session = await exigerSession(requete, reponse, "sources.ecrire", { accesLibre: accesLibre() });
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
      if (!(await exigerSession(requete, reponse, "reglages.lire", { accesLibre: accesLibre() }))) return true;
      return json(reponse, 200, { valeurs: reglages.valeurs(), description: reglages.DESCRIPTION }), true;
    }

    if (chemin === "/api/admin/reglages" && methode === "POST") {
      const session = await exigerSession(requete, reponse, "reglages.ecrire", { accesLibre: accesLibre() });
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
      if (!(await exigerSession(requete, reponse, "audit.lire", { accesLibre: accesLibre() }))) return true;
      return json(reponse, 200, { entrees: await audit.lire(200), codes: audit.CODES }), true;
    }

    if (chemin === "/api/admin/cles-films" && methode === "GET") {
      if (!(await exigerSession(requete, reponse, "reglages.lire", { accesLibre: accesLibre() }))) return true;
      return json(reponse, 200, { cles: await clesFilms.statut(), cache: await tmdb.etatCache(), attribution: tmdb.ATTRIBUTION }), true;
    }

    if (chemin === "/api/admin/statistiques" && methode === "GET") {
      if (!(await exigerSession(requete, reponse, "statistiques.lire", { accesLibre: accesLibre() }))) return true;
      return json(reponse, 200, statistiques()), true;
    }

    if (chemin === "/api/admin/sonder" && methode === "POST") {
      const session = await exigerSession(requete, reponse, "sources.lire", { accesLibre: accesLibre() });
      if (!session) return true;
      const resultats = await sonde.sonderTout(instantane().sources.sources ?? []);
      return json(reponse, 200, { resultats }), true;
    }

    if (chemin === "/api/admin/import" && methode === "POST") {
      const session = await exigerSession(requete, reponse, "import.lancer", { accesLibre: accesLibre() });
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
      const session = await exigerSession(requete, reponse, "reglages.ecrire", { accesLibre: accesLibre() });
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
