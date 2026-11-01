/**
 * Favoris communs aux trois familles.
 * Stockage local uniquement : aucun compte, aucune requête réseau, aucune
 * donnée personnelle.
 */

const CLE = "streamtv.favoris.v1";

/** Écouteurs notifiés à chaque changement, pour redessiner la coquille. */
const abonnes = new Set();

export function abonner(rappel) {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}

function lire() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? "[]");
    return Array.isArray(brut) ? brut.filter((f) => f && f.id && f.famille) : [];
  } catch {
    return [];
  }
}

function ecrire(liste) {
  try {
    localStorage.setItem(CLE, JSON.stringify(liste));
  } catch {
    return false;
  }
  for (const rappel of abonnes) rappel(liste);
  return true;
}

export function liste() {
  return lire();
}

export function contient(famille, id) {
  return lire().some((f) => f.famille === famille && f.id === id);
}

export function basculer(favori) {
  const actuel = lire();
  const existe = actuel.some((f) => f.famille === favori.famille && f.id === favori.id);
  const suivant = existe
    ? actuel.filter((f) => !(f.famille === favori.famille && f.id === favori.id))
    : [...actuel, { ...favori, ajoute: new Date().toISOString() }];
  ecrire(suivant);
  return !existe;
}
