/**
 * Fiches des trois familles. La licence y est une information de premier rang,
 * affichée sans action. Un film n'a qu'un bouton de lecture, jamais deux.
 */

import { h, vider, formaterDuree, formaterPosition } from "../dom.js";
import { obtenir } from "../api.js";
import { attente, etatErreur, boutonLecture, meta } from "../composants.js";
import * as favoris from "../favoris.js";
import * as progression from "../progression.js";
import { regarderVod, regarderChaine } from "../lecteur.js";

function boutonFavori(favori, surChangement) {
  const bouton = h(
    "button",
    { class: "epingle", type: "button", "aria-pressed": favoris.contient(favori.famille, favori.id) ? "true" : "false" },
    favoris.contient(favori.famille, favori.id) ? "Retirer des favoris" : "Ajouter aux favoris"
  );
  bouton.addEventListener("click", () => {
    const ajoute = favoris.basculer(favori);
    bouton.setAttribute("aria-pressed", ajoute ? "true" : "false");
    bouton.textContent = ajoute ? "Retirer des favoris" : "Ajouter aux favoris";
    surChangement?.(ajoute);
  });
  return bouton;
}

function blocLicence(licence, source) {
  return h(
    "div",
    { class: "bloc" },
    h("div", { class: "bloc__titre" }, "Licence et source"),
    h("p", { class: "licence" }, licence),
    source ? h("p", { class: "licence" }, `Source : ${source}`) : null
  );
}

function afficheBloc(affiche, titre) {
  const bloc = h("div", { class: "fiche__affiche" });
  if (affiche) bloc.append(h("img", { src: affiche, alt: `Affiche de ${titre}`, width: 400, height: 600 }));
  return bloc;
}

/* ------------------------------------------------------------------ */

async function ficheChaine(racine, id, app) {
  let chaine;
  try {
    chaine = await obtenir(`/api/chaines/${encodeURIComponent(id)}`);
  } catch (erreur) {
    vider(racine).append(etatErreur(erreur.message, () => ficheChaine(racine, id, app)));
    return;
  }
  const voisines = await obtenir(`/api/chaines?categorie=${encodeURIComponent(chaine.categorie)}&taille=40`).catch(() => ({ contenus: [] }));
  const liste = voisines.contenus.length ? voisines.contenus : [chaine];

  vider(racine).append(
    h("a", { class: "lien", href: "/chaines", "data-lien": "" }, "Retour aux chaînes"),
    h(
      "div",
      { class: "fiche", style: "margin-top: var(--e5)" },
      afficheBloc(chaine.logo, chaine.nom),
      h(
        "div",
        { class: "fiche__corps" },
        h("h1", {}, chaine.nom),
        meta([chaine.categorie, `Pays : ${chaine.pays}`, `Langue : ${chaine.langue}`, chaine.qualite ? `Qualité : ${chaine.qualite}` : null]),
        h(
          "div",
          { class: "fiche__actions" },
          boutonLecture("Regarder la chaîne", () => regarderChaine(chaine, liste, app.attenteSecondes)),
          boutonFavori({ famille: "chaines", id: chaine.id, titre: chaine.nom, lien: `/chaines/${chaine.id}` })
        ),
        h("p", { class: "fiche__synopsis" }, "Diffusion en direct. En mode TV, les flèches haut et bas changent de chaîne."),
        blocLicence(chaine.licence, chaine.nomSource)
      )
    )
  );
  document.title = `${chaine.nom} · StreamTV`;
}

async function ficheFilm(racine, id, app) {
  let film;
  try {
    film = await obtenir(`/api/films/${encodeURIComponent(id)}`);
  } catch (erreur) {
    vider(racine).append(etatErreur(erreur.message, () => ficheFilm(racine, id, app)));
    return;
  }
  const reprise = progression.lire("films", film.id);
  const libelle = reprise ? `Reprendre à ${formaterPosition(reprise.position)}` : "Regarder";

  vider(racine).append(
    h("a", { class: "lien", href: "/films", "data-lien": "" }, "Retour aux films"),
    h(
      "div",
      { class: "fiche", style: "margin-top: var(--e5)" },
      afficheBloc(film.affiche, film.titre),
      h(
        "div",
        { class: "fiche__corps" },
        h("h1", {}, film.titre),
        meta([String(film.annee), formaterDuree(film.duree), (film.genres ?? []).join(", "), film.realisateur ? `Réalisation : ${film.realisateur}` : null]),
        h(
          "div",
          { class: "fiche__actions" },
          boutonLecture(
            libelle,
            () =>
              regarderVod({
                titre: film.titre,
                url: film.url,
                famille: "films",
                id: film.id,
                reprise: reprise?.position ?? 0,
                attenteSecondes: app.attenteSecondes
              }),
            "principal"
          ),
          boutonFavori({ famille: "films", id: film.id, titre: film.titre, lien: `/films/${film.id}` })
        ),
        h("p", { class: "fiche__synopsis" }, film.synopsis ?? "Synopsis à venir."),
        blocLicence(film.licence, (film.sourcesDetail ?? []).map((s) => s.nom).join(", "))
      )
    )
  );
  document.title = `${film.titre} · StreamTV`;
}

async function ficheAnime(racine, id, app) {
  let serie;
  try {
    serie = await obtenir(`/api/anime/${encodeURIComponent(id)}`);
  } catch (erreur) {
    vider(racine).append(etatErreur(erreur.message, () => ficheAnime(racine, id, app)));
    return;
  }

  const episodes = h("div", { class: "episodes" });
  for (const episode of serie.episodes ?? []) {
    const cle = `${serie.id}#e${episode.numero}`;
    const avancement = progression.lire("anime", cle);
    const ligne = h(
      "button",
      {
        class: "episode",
        type: "button",
        onclick: () =>
          regarderVod({
            titre: `${serie.titre} · épisode ${episode.numero}`,
            url: episode.url,
            famille: "anime",
            id: cle,
            reprise: avancement?.position ?? 0,
            attenteSecondes: app.attenteSecondes
          })
      },
      h("span", { class: "episode__numero" }, String(episode.numero).padStart(2, "0")),
      h("span", { class: "episode__titre" }, episode.titre),
      h(
        "span",
        { class: "episode__duree" },
        avancement ? `${formaterPosition(avancement.position)} / ${formaterDuree(episode.duree)}` : formaterDuree(episode.duree)
      )
    );
    episodes.append(ligne);
  }

  const premier = (serie.episodes ?? [])[0];
  const premiereCle = premier ? `${serie.id}#e${premier.numero}` : null;
  const avancementPremier = premiereCle ? progression.lire("anime", premiereCle) : null;

  vider(racine).append(
    h("a", { class: "lien", href: "/anime", "data-lien": "" }, "Retour aux animés"),
    h(
      "div",
      { class: "fiche", style: "margin-top: var(--e5)" },
      afficheBloc(serie.affiche, serie.titre),
      h(
        "div",
        { class: "fiche__corps" },
        h("h1", {}, serie.titre),
        serie.titre_original && serie.titre_original !== serie.titre
          ? h("p", { class: "page__chapeau" }, `Titre original : ${serie.titre_original}`)
          : null,
        meta([String(serie.annee), serie.studio, (serie.genres ?? []).join(", "), `${serie.episodes?.length ?? 0} épisodes`, serie.langue, serie.statut === "en-cours" ? "En cours" : "Terminé"]),
        h(
          "div",
          { class: "fiche__actions" },
          premier
            ? boutonLecture(
                avancementPremier ? `Reprendre à ${formaterPosition(avancementPremier.position)}` : "Regarder le premier épisode",
                () =>
                  regarderVod({
                    titre: `${serie.titre} · épisode ${premier.numero}`,
                    url: premier.url,
                    famille: "anime",
                    id: premiereCle,
                    reprise: avancementPremier?.position ?? 0,
                    attenteSecondes: app.attenteSecondes
                  })
              )
            : null,
          boutonFavori({ famille: "anime", id: serie.id, titre: serie.titre, lien: `/anime/${serie.id}` })
        ),
        h("p", { class: "fiche__synopsis" }, serie.synopsis ?? ""),
        h("div", { class: "bloc" }, h("div", { class: "bloc__titre" }, "Épisodes"), episodes),
        blocLicence(serie.licence, (serie.sourcesDetail ?? []).map((s) => s.nom).join(", "))
      )
    )
  );
  document.title = `${serie.titre} · StreamTV`;
}

/** Aiguille la fiche selon la famille. */
export async function rendre(racine, famille, id, app) {
  vider(racine).append(attente("Chargement de la fiche"));
  if (famille === "chaines") return ficheChaine(racine, id, app);
  if (famille === "films") return ficheFilm(racine, id, app);
  return ficheAnime(racine, id, app);
}
