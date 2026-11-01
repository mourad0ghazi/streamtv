/**
 * Composants réutilisés par les trois familles : cartes, rangées, états.
 * Un composant défini une fois, jamais recopié en changeant le texte.
 */

import { h, initiales, icone, formaterDuree } from "./dom.js";

/** Carte d'affiche : utilisée par les animés et les films. */
export function carteContenu({ titre, sous, affiche, lien, action }) {
  const media = h("div", { class: "carte__media" });
  if (affiche) {
    media.append(h("img", { src: affiche, alt: `Affiche de ${titre}`, loading: "lazy", width: 400, height: 600 }));
  } else {
    media.append(h("div", { class: "lettrine" }, initiales(titre)));
  }
  const contenu = [media, h("div", { class: "carte__titre" }, titre), sous ? h("div", { class: "carte__sous" }, sous) : null];
  if (action) {
    return h("button", { class: "carte carte-lien", type: "button", onclick: action, "aria-label": titre }, contenu);
  }
  return h("a", { class: "carte", href: lien, "data-lien": "" }, contenu);
}

/** Carte de chaîne : logo si disponible, initiales sinon. */
export function carteChaine(chaine, action) {
  const media = h("div", { class: "carte__media" });
  if (chaine.logo) {
    const image = h("img", { src: chaine.logo, alt: `Logo de ${chaine.nom}`, loading: "lazy" });
    image.addEventListener("error", () => {
      image.remove();
      media.append(h("div", { class: "lettrine" }, initiales(chaine.nom)));
    });
    media.append(image);
  } else {
    media.append(h("div", { class: "lettrine" }, initiales(chaine.nom)));
  }
  return h(
    "button",
    { type: "button", class: "carte carte--chaine carte-lien", onclick: () => action(chaine), "aria-label": `Regarder ${chaine.nom}` },
    media,
    h("div", { class: "carte__titre" }, chaine.nom),
    h("div", { class: "carte__sous" }, `${chaine.categorie} · ${chaine.pays}`)
  );
}

/** Rangée horizontale de contenus. N'est jamais créée si elle est vide. */
export function rangee(titre, contenus, rendreCarte) {
  if (!contenus.length) return null;
  return h(
    "section",
    { class: "rangee", "data-rangee": titre },
    h("div", { class: "rangee__entete" }, h("h2", {}, titre)),
    h("div", { class: "rangee__defilement" }, contenus.map(rendreCarte))
  );
}

/** État vide : une phrase qui dit quoi faire, et le bouton qui le fait. */
export function etatVide({ titre, texte, action, libelleAction }) {
  return h(
    "div",
    { class: "etat" },
    h("h2", {}, titre),
    h("p", {}, texte),
    action ? h("div", {}, h("button", { class: "bouton bouton--principal", type: "button", onclick: action }, libelleAction)) : null
  );
}

/** État d'erreur : ce qui s'est passé, puis l'issue. */
export function etatErreur(message, onReessayer) {
  return h(
    "div",
    { class: "etat etat--erreur", role: "alert" },
    h("h2", {}, "Cette page n'a pas pu se charger"),
    h("p", {}, message),
    onReessayer
      ? h("div", {}, h("button", { class: "bouton", type: "button", onclick: onReessayer }, "Réessayer"))
      : h("p", {}, h("a", { class: "lien", href: "/" }, "Revenir au catalogue"))
  );
}

export function attente(texte = "Chargement du catalogue") {
  return h("p", { class: "attente", role: "status", "aria-live": "polite" }, texte);
}

/** Bouton de lecture avec son icône, à la taille du texte voisin. */
export function boutonLecture(libelle, action, apparence = "principal") {
  return h(
    "button",
    { class: `bouton ${apparence === "principal" ? "bouton--principal" : ""}`, type: "button", onclick: action },
    icone("lecteur", 18),
    libelle
  );
}

/** Métadonnées d'une fiche, séparées par des points. */
export function meta(paires) {
  return h("div", { class: "fiche__meta" }, paires.filter(Boolean).map((paire) => h("span", {}, paire)));
}

export { formaterDuree };
