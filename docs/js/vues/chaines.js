/**
 * Vue Chaînes : catalogue filtrable, paginé, avec guide de zapping ancré sur
 * l'heure courante. Regarder une chaîne ouvre le lecteur avec la liste de
 * zapping du filtre courant, pour passer de l'une à l'autre sans revenir ici.
 */

import { h, vider, initiales, icone } from "../dom.js";
import { obtenir } from "../api.js";
import { carteChaine, attente, etatVide, etatErreur } from "../composants.js";
import { regarderChaine } from "../lecteur.js";
import * as zapping from "../zapping.js";

function creerFiltres(etat, categories, pays, regions, surChangement) {
  const champCategorie = h(
    "select",
    { id: "filtre-categorie", onchange: (e) => surChangement({ categorie: e.target.value, page: 1 }) },
    h("option", { value: "" }, "Toutes les catégories"),
    categories.map((c) => h("option", { value: c.nom, selected: etat.categorie === c.nom ? true : null }, `${c.nom} (${c.nombre})`))
  );
  const champPays = h(
    "select",
    { id: "filtre-pays", onchange: (e) => surChangement({ pays: e.target.value, page: 1 }) },
    h("option", { value: "" }, "Tous les pays"),
    pays.slice(0, 60).map((p) => h("option", { value: p.code, selected: etat.pays === p.code ? true : null }, `${p.code} (${p.nombre})`))
  );
  const champRegion = h(
    "select",
    { id: "filtre-region", onchange: (e) => surChangement({ region: e.target.value, page: 1 }) },
    h("option", { value: "" }, "Toutes les régions"),
    regions.map((r) => h("option", { value: r.code, selected: etat.region === r.code ? true : null }, `${r.code} (${r.nombre})`))
  );
  const champRecherche = h("input", {
    id: "filtre-recherche",
    type: "search",
    value: etat.q ?? "",
    placeholder: "Nom de la chaîne",
    oninput: (e) => surChangement({ q: e.target.value, page: 1 }, true)
  });

  return h(
    "div",
    { class: "filtres", role: "search" },
    h("div", { class: "champ" }, h("label", { for: "filtre-categorie" }, "Catégorie"), champCategorie),
    h("div", { class: "champ" }, h("label", { for: "filtre-pays" }, "Pays"), champPays),
    regions.length ? h("div", { class: "champ" }, h("label", { for: "filtre-region" }, "Région"), champRegion) : null,
    h("div", { class: "champ" }, h("label", { for: "filtre-recherche" }, "Recherche"), champRecherche),
    h(
      "button",
      {
        class: "bouton",
        type: "button",
        onclick: () => surChangement({ categorie: "", pays: "", region: "", q: "", page: 1 })
      },
      "Réinitialiser"
    )
  );
}

/** Bandeau de reprise : la dernière chaîne regardée, relançable d'un clic. */
function bandeauReprise(chaine, liste, attente, avis) {
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

  const numero = zapping.numeroDansListe(liste, chaine.id);
  const regarder = h(
    "button",
    {
      class: "bouton bouton--principal",
      type: "button",
      onclick: () => {
        zapping.memoriserChaine(chaine);
        regarderChaine(chaine, { liste, index: Math.max(0, numero - 1), attenteSecondes: attente, onFermer: avis });
      }
    },
    icone("lecteur", 18),
    "Reprendre"
  );

  return h(
    "section",
    { class: "reprise", "aria-label": "Reprendre la télévision" },
    media,
    h(
      "div",
      { class: "reprise__corps" },
      h("span", { class: "reprise__titre" }, chaine.nom),
      h(
        "span",
        { class: "reprise__sous" },
        numero ? `Chaîne ${numero} sur ${liste.length} dans ce filtre · ${chaine.categorie || "sans catégorie"}` : "Dernière chaîne regardée"
      )
    ),
    h(
      "div",
      { class: "reprise__actions" },
      regarder,
      h("button", { class: "bouton", type: "button", onclick: () => survoler(liste, attente) }, "Parcourir le direct")
    )
  );
}

/** Ouvre le direct sur la première chaîne de la liste, sans quitter la page. */
function survoler(liste, attente) {
  if (!liste.length) return;
  regarderChaine(liste[0], { liste, index: 0, attenteSecondes: attente });
}

/** Rail des chaînes récemment regardées, relançables. */
function railRecentes(liste, attente) {
  const recentes = zapping.recentes().filter((c) => liste.some((x) => x.id === c.id));
  if (!recentes.length) return null;
  return h(
    "section",
    { class: "rangee", "data-rangee": "Récemment regardées" },
    h("div", { class: "rangee__entete" }, h("h2", {}, "Récemment regardées")),
    h(
      "div",
      { class: "rangee__defilement" },
      recentes.map((chaine) =>
        carteChaine(chaine, () => {
          const position = liste.findIndex((x) => x.id === chaine.id);
          regarderChaine(liste[position] ?? chaine, { liste, index: Math.max(0, position), attenteSecondes: attente });
        })
      )
    )
  );
}

/**
 * Guide de zapping. Sans grille de programmes fournie par une source, il dit
 * ce qu'il en est au lieu de laisser un bloc vide.
 */
function blocGuide(guide) {
  if (guide?.disponible) {
    const entete = h(
      "div",
      { class: "guide__entete" },
      h("span", {}, `Guide de zapping · tranche de ${guide.heure}`),
      h("a", { class: "lien", href: "/chaines" }, "Voir tout le catalogue")
    );
    const lignes = guide.creneaux.map((c) =>
      h(
        "div",
        { class: "guide__ligne" },
        h("div", { class: "guide__creneau" }, c.creneau),
        h("div", {}, h("div", { class: "guide__titre" }, c.titre), h("div", { class: "guide__chaine" }, c.detail))
      )
    );
    return h("section", { class: "guide", "aria-label": "Guide de zapping" }, entete, lignes);
  }
  return h(
    "section",
    { class: "guide", "aria-label": "Guide de zapping" },
    h(
      "div",
      { class: "guide__entete" },
      h("span", {}, `Guide de zapping · tranche de ${guide?.heure ?? ""}`),
      h("span", {}, "Aucune grille disponible")
    ),
    h(
      "div",
      { class: "guide__ligne" },
      h("div", { class: "guide__creneau" }, "Grille"),
      h(
        "div",
        {},
        h("div", { class: "guide__titre" }, "Les programmes ne sont pas fournis"),
        h(
          "div",
          { class: "guide__chaine" },
          "Aucune source ne publie de grille de programmes. Le guide se remplira dès qu'une source EPG sera branchée ; en attendant, les chaînes s'enchaînent au clavier dans le lecteur."
        )
      )
    )
  );
}

/**
 * Ouvre une chaîne avec la liste de zapping du filtre courant. La liste vient
 * d'une route dédiée, plafonnée à 300 chaînes : assez pour zapper dans une
 * catégorie entière, assez léger pour être transporté d'un coup.
 */
function ouvrirDepuis(etat, attente) {
  return async (chaine, avis) => {
    const parametres = new URLSearchParams();
    if (etat.categorie) parametres.set("categorie", etat.categorie);
    if (etat.pays) parametres.set("pays", etat.pays);
    if (etat.region) parametres.set("region", etat.region);
    if (etat.q) parametres.set("q", etat.q);
    let liste = [chaine];
    let infos = {};
    try {
      const donnees = await obtenir(`/api/chaines/zapping?${parametres.toString()}`);
      if (donnees.chaines?.length) {
        liste = donnees.chaines;
        infos = { tronquee: donnees.tronquee === true, totalListe: donnees.total };
      }
    } catch {
      /* sans liste complète, le lecteur reste utilisable sur cette seule chaîne */
    }
    const position = liste.findIndex((c) => c.id === chaine.id);
    zapping.memoriserChaine(chaine);
    regarderChaine(chaine, {
      liste,
      index: position < 0 ? 0 : position,
      attenteSecondes: attente,
      onFermer: avis,
      ...infos
    });
  };
}

export async function rendre(racine, etat, app) {
  vider(racine);
  racine.append(attente("Chargement des chaînes"));
  let meta;
  try {
    meta = await obtenir("/api/chaines/categories");
  } catch (erreur) {
    vider(racine).append(etatErreur(erreur.message, () => rendre(racine, etat, app)));
    return;
  }

  const parametres = new URLSearchParams();
  if (etat.categorie) parametres.set("categorie", etat.categorie);
  if (etat.pays) parametres.set("pays", etat.pays);
  if (etat.region) parametres.set("region", etat.region);
  if (etat.q) parametres.set("q", etat.q);
  parametres.set("page", String(etat.page ?? 1));

  let page;
  let guide = null;
  try {
    [page, guide] = await Promise.all([obtenir(`/api/chaines?${parametres.toString()}`), obtenir("/api/guide").catch(() => null)]);
  } catch (erreur) {
    vider(racine).append(etatErreur(erreur.message, () => rendre(racine, etat, app)));
    return;
  }

  const aller = (changements, discret = false) => app.aller("/chaines", { ...etat, ...changements }, { remplacer: discret });
  // Fermer le lecteur rafraîchit la page pour mettre à jour le bandeau de
  // reprise, sans renvoyer l'utilisateur en haut de la liste.
  const rafraichir = () => {
    const position = window.scrollY ?? 0;
    return rendre(racine, etat, app).then(() => window.scrollTo(0, position));
  };
  const attenteLecteur = app.attenteSecondes;
  const ouvrir = await ouvrirDepuis(etat, attenteLecteur);

  const reprise = zapping.derniereChaine();
  const listeCourante = page.contenus;

  const entete = h(
    "div",
    { class: "page__entete" },
    h(
      "div",
      {},
      h("h1", {}, "Chaînes en direct"),
      h("p", { class: "page__chapeau" }, `${page.total} chaînes dans ${meta.categories.length} catégories, ${meta.pays.length} pays desservis.`)
    )
  );

  vider(racine).append(entete, creerFiltres(etat, meta.categories, meta.pays, meta.regions ?? [], aller));

  if (reprise) {
    racine.append(bandeauReprise(reprise, listeCourante, attenteLecteur, rafraichir));
  }

  const rail = railRecentes(listeCourante, attenteLecteur);
  if (rail) racine.append(rail);

  racine.append(blocGuide(guide));

  const contenu = h("div", {});

  if (!page.contenus.length) {
    contenu.append(
      etatVide({
        titre: "Aucune chaîne ne correspond à ces filtres",
        texte: "Réinitialise les filtres pour retrouver tout le catalogue.",
        action: () => aller({ categorie: "", pays: "", region: "", q: "", page: 1 }),
        libelleAction: "Réinitialiser les filtres"
      })
    );
  } else {
    contenu.append(
      h(
        "div",
        { class: "grille" },
        page.contenus.map((chaine) => carteChaine(chaine, (c) => ouvrir(c, rafraichir)))
      )
    );
    const precedente = h(
      "button",
      { class: "bouton", type: "button", disabled: page.page <= 1 ? true : null, onclick: () => aller({ page: page.page - 1 }) },
      "Page précédente"
    );
    const suivante = h(
      "button",
      {
        class: "bouton",
        type: "button",
        disabled: page.page >= page.pages ? true : null,
        onclick: () => aller({ page: page.page + 1 })
      },
      "Page suivante"
    );
    contenu.append(
      h("div", { class: "pagination" }, precedente, h("span", {}, `Page ${page.page} sur ${page.pages} · ${page.taille} cartes par page`), suivante)
    );
  }
  racine.append(contenu);
}
