/**
 * Accueil : les trois entrées du catalogue, puis deux rangées utiles.
 * Aucune section décorative : ce qui s'affiche sert à choisir quoi regarder.
 */

import { h, vider, formaterPosition, initiales, icone } from "../dom.js";
import { regarderChaine } from "../lecteur.js";
import * as zapping from "../zapping.js";
import { obtenir } from "../api.js";
import { carteContenu, rangee, attente, etatErreur } from "../composants.js";
import * as progression from "../progression.js";

function entree(titre, texte, lien, compte) {
  return h(
    "a",
    { class: "entree", href: lien, "data-lien": "" },
    h("h2", {}, titre),
    h("p", {}, texte),
    h("span", { class: "entree__compte" }, compte)
  );
}

export async function rendre(racine, _etat, app) {
  vider(racine).append(attente("Chargement de l'accueil"));
  let films;
  let anime;
  let etat;
  try {
    [films, anime, etat] = await Promise.all([obtenir("/api/films"), obtenir("/api/anime"), obtenir("/api/etat")]);
  } catch (erreur) {
    vider(racine).append(etatErreur(erreur.message, () => rendre(racine, _etat, app)));
    return;
  }

  const entete = h(
    "div",
    {},
    h("h1", {}, "Chaînes, animés et films dans un seul catalogue"),
    h(
      "p",
      { class: "page__chapeau" },
      "Tout ce qui est ici est gratuit et sous licence affichée. Le direct, les rangées d'animés et les films se parcourent de la même façon, et la reprise de lecture reste sur votre appareil."
    )
  );

  const entrees = h(
    "div",
    { class: "entrees" },
    entree("Chaînes", "Le direct par catégorie, avec un guide de zapping et un mode TV au clavier.", "/chaines", `${etat.compte.chaines} chaînes`),
    entree("Animé", "Les séries et les films d'animation, avec la progression par épisode.", "/anime", `${etat.compte.anime} titres`),
    entree("Films", "Les films complets, avec une reprise de lecture à la seconde.", "/films", `${etat.compte.films} films`)
  );

  vider(racine).append(entete, entrees);

  const derniere = zapping.derniereChaine();
  if (derniere?.url) {
    racine.append(blocDirect(derniere, app));
  }

  const derniers = films.rangees?.[0];
  if (derniers?.contenus?.length) {
    const section = rangee("Ajoutés récemment", derniers.contenus, (film) =>
      carteContenu({ titre: film.titre, sous: `${film.annee} · ${(film.genres ?? []).join(", ")}`, affiche: film.affiche, lien: `/films/${film.id}` })
    );
    if (section) racine.append(section);
  }

  const reprises = progression.deFamille("films");
  if (reprises.length && films.contenus?.length) {
    const parId = new Map(films.contenus.map((f) => [f.id, f]));
    const section = rangee(
      "Reprendre la lecture",
      reprises.map((r) => ({ ...parId.get(r.id), reprise: r })).filter((film) => film.id),
      (film) =>
        carteContenu({
          titre: film.titre,
          sous: `Reprendre à ${formaterPosition(film.reprise.position)}`,
          affiche: film.affiche,
          lien: `/films/${film.id}`
        })
    );
    if (section) racine.append(section);
  }

  const animation = anime.rangees?.find((r) => r.titre === "Classiques") ?? anime.rangees?.[0];
  if (animation?.contenus?.length) {
    const section = rangee("Animation à voir", animation.contenus, (a) =>
      carteContenu({ titre: a.titre, sous: `${a.annee} · ${(a.genres ?? []).join(", ")}`, affiche: a.affiche, lien: `/anime/${a.id}` })
    );
    if (section) racine.append(section);
  }
}

/** Reprise du direct : la dernière chaîne regardée, relançable d'un clic. */
function blocDirect(chaine, app) {
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
    { class: "reprise", "aria-label": "Reprendre le direct" },
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
