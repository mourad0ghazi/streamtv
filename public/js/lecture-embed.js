/**
 * Lecture d'un film par un fournisseur tiers.
 *
 * Le flux vient d'ailleurs : le site ouvre un cadre plein écran, nomme le
 * fournisseur, et dit que le contenu n'est pas hébergé ici. Aucune lecture ne
 * démarre sans que le visiteur ait cliqué : rien ne se charge en douce.
 *
 * Le cadre porte `allowfullscreen` et les autorisations strictement
 * nécessaires (lecture, plein écran). Il ne reçoit aucun accès supplémentaire.
 */

import { h, icone } from "./dom.js";

/**
 * Ouvre la lecture d'un film servi par un fournisseur tiers.
 * `url` vient du serveur, déjà construite et vérifiée ; cette fonction ne
 * fabrique jamais d'adresse elle-même.
 */
export function ouvrirLectureTierce({ url, titre, fournisseur, attribution, reprise = 0 }) {
  if (typeof document === "undefined" || !url) return null;

  const cadre = h("iframe", {
    class: "lecture-tierce__cadre",
    src: url,
    title: `Lecture de ${titre}`,
    allow: "autoplay; fullscreen; encrypted-media; picture-in-picture",
    allowfullscreen: true,
    referrerpolicy: "no-referrer",
    loading: "eager"
  });

  const note = h(
    "p",
    { class: "lecture-tierce__note" },
    fournisseur ? `Flux fourni par ${fournisseur}. ` : "",
    attribution ?? "StreamTV n'héberge pas ce flux et n'en garantit ni la disponibilité ni les droits."
  );

  const fermerBouton = h(
    "button",
    { class: "bouton", type: "button", onclick: () => fermer() },
    icone("fermer", 18),
    "Fermer"
  );

  const racine = h(
    "div",
    { class: "lecture-tierce", role: "dialog", "aria-modal": "true", "aria-label": `Lecture de ${titre}` },
    h(
      "div",
      { class: "lecture-tierce__entete" },
      h("span", { class: "lecture-tierce__titre" }, titre),
      reprise > 0 ? h("span", { class: "lecture-tierce__reprise" }, "Reprise à la dernière position") : null,
      fermerBouton
    ),
    h("div", { class: "lecture-tierce__scene" }, cadre),
    note
  );

  const focusAvant = document.activeElement;
  function surTouche(evenement) {
    if (evenement.key === "Escape") fermer();
  }
  let ferme = false;
  function fermer() {
    if (ferme) return;
    ferme = true;
    document.removeEventListener("keydown", surTouche);
    document.body.classList.remove("lecture-tierce-ouverte");
    racine.remove();
    if (focusAvant instanceof HTMLElement) focusAvant.focus();
  }

  document.addEventListener("keydown", surTouche);
  document.body.classList.add("lecture-tierce-ouverte");
  document.body.append(racine);
  fermerBouton.focus();

  return { fermer, racine };
}
