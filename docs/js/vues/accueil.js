/**
 * Accueil composé.
 *
 * La liste des sections vient du serveur (`/api/accueil`) : la console choisit
 * l'ordre, les titres, les filtres et la visibilité, la page se contente de
 * rendre. Sans réponse du serveur, l'accueil retombe sur la composition livrée,
 * qui est la même que celle par défaut.
 *
 * Une section qui ne trouve rien ne s'affiche pas : pas de rangée vide, pas de
 * titre orphelin. Le visiteur ne voit jamais un cadre creux.
 */

import { h, vider, formaterPosition, initiales, icone } from "../dom.js";
import { regarderChaine } from "../lecteur.js";
import * as zapping from "../zapping.js";
import * as favoris from "../favoris.js";
import { obtenir } from "../api.js";
import { carteContenu, rangee, attente, etatErreur } from "../composants.js";
import * as progression from "../progression.js";

/** Composition de secours : identique aux valeurs par défaut du serveur. */
const SECTIONS_DEFAUT = [
  { id: "entrees", type: "entrees", titre: "Chaînes, animés et films dans un seul catalogue", visible: true },
  { id: "direct", type: "direct", titre: "Reprendre le direct", visible: true },
  { id: "films-recents", type: "films-recents", titre: "Ajoutés récemment", limite: 12, visible: true },
  { id: "reprise", type: "reprise", titre: "Reprendre la lecture", limite: 12, visible: true },
  { id: "anime-rangee", type: "anime-rangee", titre: "Animation à voir", rangee: "Classiques", limite: 12, visible: true }
];

function entree(titre, texte, lien, compte) {
  return h(
    "a",
    { class: "entree", href: lien, "data-lien": "" },
    h("h2", {}, titre),
    h("p", {}, texte),
    h("span", { class: "entree__compte" }, compte)
  );
}

function entrees(etat) {
  return h(
    "div",
    { class: "entrees" },
    entree("Chaînes", "Le direct par catégorie, avec un guide de zapping et un mode TV au clavier.", "/chaines", `${etat.compte.chaines} chaînes`),
    entree("Animé", "Les séries et les films d'animation, avec la progression par épisode.", "/anime", `${etat.compte.anime} titres`),
    entree("Films", "Les films complets, avec une reprise de lecture à la seconde.", "/films", `${etat.compte.films} films`)
  );
}

function carteFilm(film, reprise) {
  const sous = reprise
    ? `Reprendre à ${formaterPosition(reprise.position)}`
    : `${film.annee ?? ""}${(film.genres ?? []).length ? ` · ${film.genres.join(", ")}` : ""}`;
  return carteContenu({ titre: film.titre, sous, affiche: film.affiche, lien: `/films/${film.id}` });
}

/** Chaque type de section sait se rendre, ou dire qu'il n'a rien à montrer. */
function rendreSection(section, donnees, app) {
  const limite = section.limite ?? 12;

  if (section.type === "entrees") {
    return h("div", { class: "accueil__entete" }, h("h1", {}, section.titre), entrees(donnees.etat));
  }

  if (section.type === "texte") {
    return h("section", { class: "bloc accueil__texte" }, h("h2", {}, section.titre), h("p", {}, section.texte ?? ""));
  }

  if (section.type === "direct") {
    const derniere = zapping.derniereChaine();
    if (!derniere?.url) return null;
    return blocDirect(section, derniere, app);
  }

  if (section.type === "reprise") {
    const reprises = progression.deFamille("films").slice(0, limite);
    if (!reprises.length) return null;
    const parId = new Map(donnees.films.contenus.map((f) => [f.id, f]));
    const contenus = reprises.map((r) => ({ ...parId.get(r.id), reprise: r })).filter((film) => film.id);
    return rangee(section.titre, contenus, (film) => carteFilm(film, film.reprise));
  }

  if (section.type === "favoris") {
    const enregistres = favoris.liste().filter((f) => f.famille === "films").slice(0, limite);
    if (!enregistres.length) return null;
    const parId = new Map(donnees.films.contenus.map((f) => [f.id, f]));
    const contenus = enregistres.map((f) => parId.get(f.id)).filter(Boolean);
    return rangee(section.titre, contenus, (film) => carteFilm(film));
  }

  if (section.type === "films-recents") {
    const contenus = donnees.films.contenus.slice(0, limite);
    return rangee(section.titre, contenus, (film) => carteFilm(film));
  }

  if (section.type === "films-genre") {
    const genre = String(section.genre ?? "").toLowerCase();
    const contenus = donnees.films.contenus.filter((f) => (f.genres ?? []).some((g) => String(g).toLowerCase() === genre)).slice(0, limite);
    return rangee(section.titre, contenus, (film) => carteFilm(film));
  }

  if (section.type === "anime-rangee") {
    const rangeeChoisie = donnees.anime.rangees?.find((r) => r.titre === section.rangee) ?? donnees.anime.rangees?.[0];
    const contenus = (rangeeChoisie?.contenus ?? []).slice(0, limite);
    return rangee(section.titre, contenus, (a) =>
      carteContenu({
        titre: a.titre,
        sous: `${a.annee ?? ""}${(a.genres ?? []).length ? ` · ${a.genres.join(", ")}` : ""}`,
        affiche: a.affiche,
        lien: `/anime/${a.id}`
      })
    );
  }

  if (section.type === "categories-chaines") {
    // Les catégories viennent de l'état du site : on n'invente pas de tuiles.
    const categories = donnees.categories?.categories ?? [];
    const contenus = categories.slice(0, limite);
    if (!contenus.length) return null;
    return rangee(
      section.titre,
      contenus,
      (categorie) =>
        h(
          "a",
          { class: "carte carte--categorie", href: `/chaines?categorie=${encodeURIComponent(categorie.nom ?? categorie)}`, "data-lien": "" },
          h("span", { class: "lettrine" }, initiales(categorie.nom ?? categorie)),
          h("span", { class: "carte__titre" }, categorie.nom ?? String(categorie)),
          h("span", { class: "carte__sous" }, `${categorie.nombre ?? 0} chaînes`)
        )
    );
  }

  return null;
}

/** Reprise du direct : la dernière chaîne regardée, relançable d'un clic. */
function blocDirect(section, chaine, app) {
  const media = h("div", { class: "reprise__logo" });
  if (chaine.logo) {
    const image = h("img", { src: chaine.logo, alt: `Logo de ${chaine.nom}`, loading: "lazy" });
    image.addEventListener("error", () => {
      image.remove();
      media.append(h("span", { class: "lettrine" }, initiales(chaine.nom)));
    });
    media.append(image);
  } else {
    media.append(h("span", { class: "lettrine" }, initiales(chaine.nom)));
  }

  return h(
    "section",
    { class: "reprise", "aria-label": section.titre },
    media,
    h(
      "div",
      { class: "reprise__corps" },
      h("span", { class: "reprise__titre" }, chaine.nom),
      h("span", { class: "reprise__sous" }, "Dernière chaîne regardée. Le direct reprend là où vous l'avez laissé.")
    ),
    h(
      "div",
      { class: "reprise__actions" },
      h(
        "button",
        {
          class: "bouton bouton--principal",
          type: "button",
          onclick: () => regarderChaine(chaine, { liste: [chaine], index: 0, attenteSecondes: app.attenteSecondes })
        },
        icone("lecteur", 18),
        "Reprendre le direct"
      ),
      h("a", { class: "bouton", href: "/chaines", "data-lien": "" }, "Voir les chaînes")
    )
  );
}

/** Charge la composition : celle du serveur, sinon celle livrée avec le site. */
async function composition() {
  try {
    const reponse = await obtenir("/api/accueil");
    const sections = Array.isArray(reponse?.sections) ? reponse.sections : [];
    return sections.length ? sections : SECTIONS_DEFAUT;
  } catch {
    return SECTIONS_DEFAUT;
  }
}

export async function rendre(racine, _etat, app) {
  vider(racine).append(attente("Chargement de l'accueil"));
  const sections = await composition();

  let films;
  let anime;
  let etat;
  let categories = null;
  try {
    [films, anime, etat] = await Promise.all([obtenir("/api/films"), obtenir("/api/anime"), obtenir("/api/etat")]);
  } catch (erreur) {
    vider(racine).append(etatErreur(erreur.message, () => rendre(racine, _etat, app)));
    return;
  }
  if (sections.some((s) => s.type === "categories-chaines")) {
    try {
      categories = await obtenir("/api/chaines/categories");
    } catch {
      categories = null;
    }
  }

  const donnees = { films, anime, etat, categories };
  vider(racine);
  let rendues = 0;
  for (const section of sections) {
    if (section.visible === false) continue;
    const noeud = rendreSection(section, donnees, app);
    if (!noeud) continue;
    racine.append(noeud);
    rendues += 1;
  }

  // Une composition entièrement vide (par exemple un serveur qui répond une
  // liste sans contenu) ne doit pas laisser une page blanche.
  if (!rendues) racine.append(h("div", { class: "accueil__entete" }, h("h1", {}, "Le catalogue"), entrees(etat)));
  document.title = "StreamTV · Chaînes, animés et films";
}
