/**
 * État local du téléviseur : dernière chaîne regardée, chaînes récentes,
 * volume et coupure du son.
 *
 * Tout reste sur l'appareil. Rien n'est envoyé au serveur, aucun compte,
 * aucune donnée personnelle : des identifiants de chaîne, un volume, une date.
 */

const CLE = "streamtv.zapping.v1";
const RECENTES_MAX = 12;

function lireTout() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? "{}");
    return brut && typeof brut === "object" ? brut : {};
  } catch {
    return {};
  }
}

function ecrire(tout) {
  try {
    localStorage.setItem(CLE, JSON.stringify(tout));
    return true;
  } catch {
    return false;
  }
}

/** Chaîne réduite à ce qui suffit pour l'afficher et la relancer. */
export function reduire(chaine) {
  return {
    id: chaine.id,
    nom: chaine.nom ?? chaine.titre ?? "",
    categorie: chaine.categorie ?? "",
    pays: chaine.pays ?? "",
    logo: chaine.logo ?? "",
    url: chaine.url ?? ""
  };
}

/** Retient la chaîne en cours : dernière chaîne et tête des récentes. */
export function memoriserChaine(chaine) {
  const tout = lireTout();
  const reduite = reduire(chaine);
  const recentes = [reduite, ...(Array.isArray(tout.recentes) ? tout.recentes : []).filter((c) => c.id !== reduite.id)];
  ecrire({ ...tout, derniere: reduite, recentes: recentes.slice(0, RECENTES_MAX) });
}

export function derniereChaine() {
  const tout = lireTout();
  return tout.derniere?.id ? tout.derniere : null;
}

export function recentes() {
  const tout = lireTout();
  return Array.isArray(tout.recentes) ? tout.recentes.filter((c) => c?.id) : [];
}

export function oublierChaine(id) {
  const tout = lireTout();
  const recentes = (Array.isArray(tout.recentes) ? tout.recentes : []).filter((c) => c.id !== id);
  const derniere = tout.derniere?.id === id ? (recentes[0] ?? null) : (tout.derniere ?? null);
  ecrire({ ...tout, recentes, derniere });
}

/** Volume entre 0 et 1, valeur par défaut 1. */
export function volume() {
  const valeur = Number(lireTout().volume);
  return Number.isFinite(valeur) && valeur >= 0 && valeur <= 1 ? valeur : 1;
}

export function memoVolume(valeur) {
  const borne = Math.min(1, Math.max(0, Number(valeur) || 0));
  ecrire({ ...lireTout(), volume: borne });
}

export function sonCoupe() {
  return lireTout().coupe === true;
}

export function memoSonCoupe(coupe) {
  ecrire({ ...lireTout(), coupe: Boolean(coupe) });
}

/**
 * Numéro affiché d'une chaîne dans une liste de zapping, à partir de 1.
 * Renvoie 0 quand la chaîne n'appartient pas à la liste.
 */
export function numeroDansListe(liste, id) {
  if (!Array.isArray(liste) || !id) return 0;
  const index = liste.findIndex((c) => c.id === id);
  return index < 0 ? 0 : index + 1;
}

/** Index suivant ou précédent, avec retour en boucle. */
export function voisin(liste, index, pas) {
  if (!Array.isArray(liste) || !liste.length) return -1;
  const depart = Number.isInteger(index) && index >= 0 ? index : 0;
  return (depart + pas + liste.length) % liste.length;
}

/** Accorde un libellé au singulier ou au pluriel. */
export function pluriel(nombre, singulier, plurielMot) {
  return nombre > 1 ? plurielMot : singulier;
}

export { RECENTES_MAX, CLE };
