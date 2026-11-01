/**
 * Suivi de fichier : remarquer qu'un autre processus a écrit.
 *
 * La console tourne sur son propre port, le site sur le sien : deux processus,
 * un seul dossier `data/`. Sans ce suivi, un réglage changé dans la console
 * n'aurait d'effet qu'après un redémarrage du site, ce qui donne l'impression
 * que rien ne marche.
 *
 * La signature est le couple taille et date de modification. Un fichier absent
 * compte comme un changement : revenir aux valeurs par défaut doit s'appliquer.
 */

import { stat } from "node:fs/promises";

export function creerSuivi(chemin) {
  let signature = null;
  let premier = true;
  return async function aChange() {
    try {
      const info = await stat(chemin);
      const courante = `${info.size}:${Math.floor(info.mtimeMs)}`;
      if (courante === signature) return false;
      signature = courante;
      const changement = !premier;
      premier = false;
      return changement;
    } catch {
      if (premier) {
        premier = false;
        return false;
      }
      if (signature === null) return false;
      signature = null;
      return true;
    }
  };
}
