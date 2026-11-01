/**
 * Fabrique de nœuds DOM et petits formateurs partagés.
 * Le rendu est écrit à la main : aucun cadre, aucun moteur de gabarit.
 */

/**
 * Crée un élément. `attributs` accepte class, dataset, aria, on* et tout
 * attribut HTML ; les enfants sont des nœuds ou des chaînes.
 */
export function h(balise, attributs = {}, ...enfants) {
  const element = document.createElement(balise);
  for (const [cle, valeur] of Object.entries(attributs ?? {})) {
    if (valeur === null || valeur === undefined || valeur === false) continue;
    if (cle === "class") element.className = valeur;
    else if (cle === "dataset") Object.assign(element.dataset, valeur);
    else if (cle.startsWith("on") && typeof valeur === "function") {
      element.addEventListener(cle.slice(2).toLowerCase(), valeur);
    } else if (valeur === true) element.setAttribute(cle, "");
    else element.setAttribute(cle, String(valeur));
  }
  for (const enfant of enfants.flat(Infinity)) {
    if (enfant === null || enfant === undefined || enfant === false) continue;
    element.append(enfant instanceof Node ? enfant : document.createTextNode(String(enfant)));
  }
  return element;
}

export function vider(conteneur) {
  while (conteneur.firstChild) conteneur.removeChild(conteneur.firstChild);
  return conteneur;
}

/** « 888 » devient « 14 min 48 s » ; au-delà d'une heure, « 1 h 28 min ». */
export function formaterDuree(secondes) {
  const total = Math.max(0, Math.round(Number(secondes) || 0));
  if (total < 60) return `${total} s`;
  const heures = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const reste = total % 60;
  if (heures > 0) return reste ? `${heures} h ${minutes} min ${reste} s` : `${heures} h ${minutes} min`;
  return reste ? `${minutes} min ${reste} s` : `${minutes} min`;
}

/** Position de lecture au format mm:ss ou h:mm:ss. */
export function formaterPosition(secondes) {
  const total = Math.max(0, Math.floor(Number(secondes) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const deux = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${deux(m)}:${deux(s)}` : `${m}:${deux(s)}`;
}

/** Deux ou trois initiales, pour remplacer un logo absent. */
export function initiales(nom) {
  const mots = String(nom ?? "")
    .split(/\s+/)
    .filter(Boolean);
  if (!mots.length) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[1][0]).toUpperCase();
}

export const ICONES = {
  recherche: '<circle cx="10" cy="10" r="6.5"/><path d="M15 15l4 4"/>',
  lecteur: '<path d="M8 5.5l9 5.5-9 5.5z"/>',
  retour: '<path d="M15 5l-7 7 7 7"/>',
  fermer: '<path d="M6 6l12 12M18 6L6 18"/>',
  plein: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'
};

/** Icône en ligne, monochrome, à la taille du texte voisin. */
export function icone(nom, taille = 18) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(taille));
  svg.setAttribute("height", String(taille));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = ICONES[nom] ?? "";
  return svg;
}

/** Notification brève, une seule à la fois. */
export function notifier(message) {
  document.querySelectorAll(".notification").forEach((n) => n.remove());
  const bloc = h("div", { class: "notification", role: "status" }, message);
  document.body.append(bloc);
  setTimeout(() => bloc.remove(), 4000);
}
