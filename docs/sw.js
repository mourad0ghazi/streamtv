/*
 * Service worker. La liste de préchargement est tenue à jour par
 * `npm run versionner` : chaque module y figure avec la version dans son
 * adresse, sinon une page peut s'ouvrir sur une vieille version.
 */

const VERSION = "3.24.0";
const CACHE = `streamtv-${VERSION}`;

/**
 * Base de publication : vide à la racine, « /streamtv » sur un dépôt de projet
 * GitHub Pages. Elle se déduit de l'adresse du service worker, donc la liste de
 * préchargement reste écrite en adresses absolues et ne bouge pas d'un
 * hébergement à l'autre.
 */
const BASE = self.location.pathname.replace(/\/sw\.js$/, "");

const adresse = (chemin) => `${BASE}${chemin}`;

const PRECACHE = [
  "/",
  "/chaines",
  "/anime",
  "/films",
  "/recherche",
  "/favoris",
  "/css/base.css?v=3.24.0",
  "/css/console.css?v=3.24.0",
  "/css/jetons.css?v=3.24.0",
  "/css/lecteur.css?v=3.24.0",
  "/css/vues.css?v=3.24.0",
  "/js/admin/accueil-console.js?v=3.24.0",
  "/js/admin/apparence.js?v=3.24.0",
  "/js/admin/assistant.js?v=3.24.0",
  "/js/admin/audit.js?v=3.24.0",
  "/js/admin/console.js?v=3.24.0",
  "/js/admin/format.js?v=3.24.0",
  "/js/admin/lecture.js?v=3.24.0",
  "/js/admin/onglets.js?v=3.24.0",
  "/js/admin/permissions.js?v=3.24.0",
  "/js/admin/reglages.js?v=3.24.0",
  "/js/admin/sources.js?v=3.24.0",
  "/js/admin/statistiques.js?v=3.24.0",
  "/js/admin/tableau.js?v=3.24.0",
  "/js/admin/utilisateurs.js?v=3.24.0",
  "/js/api.js?v=3.24.0",
  "/js/app.js?v=3.24.0",
  "/js/apparence-client.js?v=3.24.0",
  "/js/composants.js?v=3.24.0",
  "/js/dom.js?v=3.24.0",
  "/js/favoris.js?v=3.24.0",
  "/js/incidents-client.js?v=3.24.0",
  "/js/lecteur.js?v=3.24.0",
  "/js/lecture-embed.js?v=3.24.0",
  "/js/partage/base.js?v=3.24.0",
  "/js/partage/catalogue.js?v=3.24.0",
  "/js/progression.js?v=3.24.0",
  "/js/vues/accueil.js?v=3.24.0",
  "/js/vues/anime.js?v=3.24.0",
  "/js/vues/chaines.js?v=3.24.0",
  "/js/vues/favoris-vue.js?v=3.24.0",
  "/js/vues/fiche.js?v=3.24.0",
  "/js/vues/films.js?v=3.24.0",
  "/js/vues/recherche.js?v=3.24.0",
  "/js/zapping.js?v=3.24.0",
  "/manifeste.webmanifest",
  "/icone.svg"
];

self.addEventListener("install", (evenement) => {
  evenement.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        // Une entrée manquante ne doit pas annuler le préchargement entier :
        // le mode hors ligne vaut mieux incomplet que refusé.
        Promise.allSettled(PRECACHE.map((chemin) => cache.add(adresse(chemin))))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evenement) => {
  evenement.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((cle) => cle !== CACHE).map((cle) => caches.delete(cle))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evenement) => {
  const requete = evenement.request;
  if (requete.method !== "GET") return;
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  evenement.respondWith(
    fetch(requete)
      .then((reponse) => {
        const copie = reponse.clone();
        caches.open(CACHE).then((cache) => cache.put(requete, copie)).catch(() => {});
        return reponse;
      })
      .catch(() => caches.match(requete).then((reponse) => reponse ?? caches.match(adresse("/"))))
  );
});
