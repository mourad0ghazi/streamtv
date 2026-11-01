/**
 * Coquille commune aux trois familles : en-tête, navigation, recherche,
 * favoris, aiguillage des routes. Le passage d'une famille à l'autre ne
 * recharge pas la page et ne perd ni les favoris ni la recherche en cours.
 */

import { h, vider, icone } from "./dom.js";
import { obtenir } from "./api.js";
import { avecBase, cheminCourant, sansBase } from "./partage/base.js";
import * as vueAccueil from "./vues/accueil.js";
import * as vueChaines from "./vues/chaines.js";
import * as vueAnime from "./vues/anime.js";
import * as vueFilms from "./vues/films.js";
import * as vueFiche from "./vues/fiche.js";
import * as vueRecherche from "./vues/recherche.js";
import * as vueFavoris from "./vues/favoris-vue.js";
import { etatErreur } from "./composants.js";
import { appliquerApparence } from "./apparence-client.js";
import { installerIncidents } from "./incidents-client.js";

const app = {
  etat: { recherche: "" },
  attenteSecondes: 10,
  bandeauDemo: false,
  racine: null,
  zone: null,
  champRecherche: null
};

const ROUTES = [
  { motif: /^\/$/, vue: (zone, etat) => vueAccueil.rendre(zone, etat, app), famille: "accueil" },
  { motif: /^\/chaines$/, vue: (zone, etat) => vueChaines.rendre(zone, etat, app), famille: "chaines" },
  { motif: /^\/chaines\/([\w-]+)$/, vue: (zone, _etat, m) => vueFiche.rendre(zone, "chaines", m[1], app), famille: "chaines" },
  { motif: /^\/anime$/, vue: (zone, etat) => vueAnime.rendre(zone, etat, app), famille: "anime" },
  { motif: /^\/anime\/([\w-]+)$/, vue: (zone, _etat, m) => vueFiche.rendre(zone, "anime", m[1], app), famille: "anime" },
  { motif: /^\/films$/, vue: (zone, etat) => vueFilms.rendre(zone, etat, app), famille: "films" },
  { motif: /^\/films\/([\w-]+)$/, vue: (zone, _etat, m) => vueFiche.rendre(zone, "films", m[1], app), famille: "films" },
  { motif: /^\/recherche$/, vue: (zone, etat) => vueRecherche.rendre(zone, etat, app), famille: "recherche" },
  { motif: /^\/favoris$/, vue: (zone, etat) => vueFavoris.rendre(zone, etat, app), famille: "favoris" }
];

const LIENS_NAV = [
  { route: "/chaines", libelle: "Chaînes", cle: "chaines" },
  { route: "/anime", libelle: "Animé", cle: "anime" },
  { route: "/films", libelle: "Films", cle: "films" },
  { route: "/favoris", libelle: "Favoris", cle: "favoris" }
];

function construireEntete(famille) {
  const champ = h("input", {
    type: "search",
    id: "recherche-globale",
    placeholder: "Rechercher",
    "aria-label": "Rechercher une chaîne, un animé ou un film",
    value: app.etat.recherche ?? ""
  });
  champ.addEventListener("keydown", (evenement) => {
    if (evenement.key !== "Enter") return;
    const terme = champ.value.trim();
    app.etat.recherche = champ.value;
    if (!terme) return;
    app.aller("/recherche", { q: terme });
  });
  champ.addEventListener("input", () => {
    app.etat.recherche = champ.value;
  });
  app.champRecherche = champ;

  const nav = h(
    "nav",
    { class: "nav", "aria-label": "Navigation principale" },
    LIENS_NAV.map((lien) =>
      h(
        "a",
        { href: lien.route, "data-lien": "", "aria-current": famille === lien.cle ? "page" : null },
        lien.libelle
      )
    )
  );

  return h(
    "header",
    { class: "entete" },
    app.bandeauDemo
      ? h(
          "div",
          { class: "bandeau-demo" },
          h("strong", {}, "Démonstration"),
          " · version statique en lecture seule, sans console d'administration."
        )
      : null,
    h(
      "div",
      { class: "entete__interieur" },
      h("a", { class: "marque", href: "/", "data-lien": "" }, "Stream", h("span", {}, "TV")),
      nav,
      h(
        "div",
        { class: "entete__outils" },
        h("div", { class: "recherche-entete" }, icone("recherche", 18), champ),
        h("a", { class: "bouton bouton--discret", href: "/favoris", "data-lien": "" }, "Favoris")
      )
    )
  );
}

function analyserChemin(chemin) {
  for (const route of ROUTES) {
    const correspondance = route.motif.exec(chemin);
    if (correspondance) return { route, correspondance };
  }
  return null;
}

function parametresEnEtat(recherche) {
  const etat = {};
  for (const [cle, valeur] of recherche.entries()) etat[cle] = valeur;
  return etat;
}

async function rendrePage() {
  const chemin = cheminCourant();
  const correspondance = analyserChemin(chemin);
  const zone = app.zone;

  vider(app.racine);
  app.racine.append(construireEntete(correspondance?.route.famille ?? ""));
  if (app.champRecherche && app.etat.recherche) app.champRecherche.value = app.etat.recherche;

  if (!correspondance) {
    zone.setAttribute("data-page", "introuvable");
    zone.append(
      etatErreur("L'adresse demandée ne correspond à aucune page de StreamTV.", () => app.aller("/", {}))
    );
    return;
  }

  const etat = parametresEnEtat(new URLSearchParams(window.location.search));
  zone.setAttribute("data-page", correspondance.route.famille);
  try {
    await correspondance.route.vue(zone, etat, correspondance.correspondance);
  } catch (erreur) {
    vider(zone).append(etatErreur(erreur.message ?? "Erreur inattendue.", () => rendrePage()));
  }
  window.scrollTo({ top: 0, behavior: "instant" });
}

function urlPour(chemin, etat) {
  const parametres = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(etat ?? {})) {
    if (valeur === "" || valeur === null || valeur === undefined) continue;
    parametres.set(cle, String(valeur));
  }
  const chaine = parametres.toString();
  return chaine ? `${chemin}?${chaine}` : chemin;
}

app.aller = (chemin, etat, options = {}) => {
  const url = avecBase(urlPour(chemin, etat));
  if (options.remplacer) window.history.replaceState({}, "", url);
  else window.history.pushState({}, "", url);
  return rendrePage();
};

/** Toute la navigation passe par ici : un lien interne ne recharge pas la page. */
document.addEventListener("click", (evenement) => {
  const lien = evenement.target.closest("a[data-lien]");
  if (!lien) return;
  if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.button !== 0) return;
  intercepterLien(evenement, lien);
});

function intercepterLien(evenement, lien) {
  const url = new URL(lien.href, window.location.origin);
  if (url.origin !== window.location.origin) return;
  evenement.preventDefault();
  app.aller(sansBase(url.pathname), parametresEnEtat(url.searchParams));
}

window.addEventListener("popstate", () => rendrePage());

/**
 * Le service worker donne le mode hors ligne et l'installation. Il est
 * enregistré ici, en module, parce que la politique de sécurité interdit le
 * script en ligne. Un navigateur qui refuse l'enregistrement, un cadre sans
 * droit de stockage ou un contexte non sécurisé ne doivent pas empêcher le
 * site de s'afficher : l'échec est avalé, le site continue sans cache.
 */
function enregistrerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register(avecBase("/sw.js")).catch(() => {});
}

async function demarrer() {
  // L'apparence arrive du serveur sous forme de feuille de variables. Sans
  // serveur (démonstration statique), le site garde ses jetons d'origine.
  appliquerApparence({ version: "" });
  app.racine = document.getElementById("application");
  app.zone = document.getElementById("page");
  try {
    const etat = await obtenir("/api/etat");
    app.attenteSecondes = etat.attenteLecteur ?? 10;
    app.bandeauDemo = Boolean(etat.bandeauDemo);
  } catch {
    app.attenteSecondes = 10;
  }
  await rendrePage();
  installerIncidents();
  enregistrerServiceWorker();
}

demarrer();
