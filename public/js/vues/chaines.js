/**
 * Vue Chaînes : catalogue filtrable, paginé, avec guide de zapping ancré sur
 * l'heure courante. Le clic sur une chaîne ouvre sa fiche.
 */

import { h, vider } from "../dom.js";
import { obtenir } from "../api.js";
import { carteChaine, attente, etatVide, etatErreur } from "../composants.js";

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

function creerGuide(creneaux, heure) {
  const entete = h(
    "div",
    { class: "guide__entete" },
    h("span", {}, `Guide de zapping · tranche de ${heure}`),
    h("a", { class: "lien", href: "/chaines" }, "Voir tout le catalogue")
  );
  const lignes = creneaux.map((c) =>
    h(
      "div",
      { class: "guide__ligne" },
      h("div", { class: "guide__creneau" }, c.creneau),
      h(
        "div",
        {},
        h("div", { class: "guide__titre" }, c.titre),
        h("div", { class: "guide__chaine" }, c.detail)
      )
    )
  );
  return h("section", { class: "guide", "aria-label": "Guide de zapping" }, entete, lignes);
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
    [page, guide] = await Promise.all([
      obtenir(`/api/chaines?${parametres.toString()}`),
      obtenir("/api/guide").catch(() => null)
    ]);
  } catch (erreur) {
    vider(racine).append(etatErreur(erreur.message, () => rendre(racine, etat, app)));
    return;
  }

  const aller = (changements, discret = false) => {
    app.aller("/chaines", { ...etat, ...changements }, { remplacer: discret });
  };

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

  const contenu = h("div", {});
  vider(racine).append(entete, creerFiltres(etat, meta.categories, meta.pays, meta.regions ?? [], aller));

  if (guide && guide.disponible) {
    racine.insertBefore(creerGuide(guide.creneaux, guide.heure), contenu);
  }

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
        page.contenus.map((chaine) =>
          carteChaine(chaine, (c) => app.aller(`/chaines/${c.id}`))
        )
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
      h(
        "div",
        { class: "pagination" },
        precedente,
        h("span", {}, `Page ${page.page} sur ${page.pages} · ${page.taille} cartes par page`),
        suivante
      )
    );
  }
  racine.append(contenu);
}
