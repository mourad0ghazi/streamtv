/**
 * Base de publication de l'interface.
 *
 * Sur le serveur dynamique, le site vit à la racine du domaine : la base est
 * vide. Un dépôt de projet publié sur GitHub Pages est servi sous
 * `/<nom-du-dépôt>/` : le constructeur statique inscrit cette base dans la page
 * et préfixe les adresses des feuilles et des modules.
 *
 * Toute adresse interne passe par ici, sinon un lien marche en local et casse
 * en ligne. Un seul calcul, deux façons de servir.
 */

/** « /streamtv/ » ou « streamtv » deviennent « /streamtv » ; « / » devient « ». */
export function normaliserBase(valeur) {
  if (typeof valeur !== "string") return "";
  const propre = valeur.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return propre ? `/${propre}` : "";
}

/** Base en vigueur, inscrite par la page (`window.STREAMTV_BASE`). */
export function base() {
  return normaliserBase(globalThis.STREAMTV_BASE);
}

/**
 * Préfixe une adresse absolue par la base. Les adresses déjà préfixées, les
 * ancres et les adresses complètes (`https://`, `//hôte`) ne sont pas touchées.
 */
export function avecBase(chemin) {
  if (typeof chemin !== "string" || !chemin.startsWith("/") || chemin.startsWith("//")) return chemin;
  const prefixe = base();
  if (!prefixe || chemin === prefixe || chemin.startsWith(`${prefixe}/`)) return chemin;
  return prefixe + chemin;
}

/** Retire la base et la barre finale : « /streamtv/chaines/ » donne « /chaines ». */
export function sansBase(chemin) {
  if (typeof chemin !== "string" || !chemin) return "/";
  const prefixe = base();
  let reste = chemin;
  if (prefixe && (chemin === prefixe || chemin.startsWith(`${prefixe}/`))) {
    reste = chemin.slice(prefixe.length) || "/";
  }
  reste = reste.replace(/\/{2,}/g, "/");
  if (reste.length > 1) reste = reste.replace(/\/+$/, "") || "/";
  return reste.startsWith("/") ? reste : `/${reste}`;
}

/** Chemin de la page en cours, base retirée : ce que le routeur compare. */
export function cheminCourant() {
  const brut = typeof window !== "undefined" && window.location ? window.location.pathname : "/";
  return sansBase(brut || "/");
}
