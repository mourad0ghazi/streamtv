/**
 * Progression de lecture, stockée localement à la seconde près.
 *
 * Contenu enregistré : un identifiant, une position, une durée. Aucun nom,
 * aucune adresse, aucun identifiant d'appareil. Rien ne part vers le serveur.
 */

const CLE = "streamtv.progression.v1";

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

/** Clé d'une progression : la famille et l'identifiant, rien d'autre. */
function cle(famille, id) {
  return `${famille}:${id}`;
}

export function lire(famille, id) {
  const entree = lireTout()[cle(famille, id)];
  if (!entree || typeof entree.position !== "number") return null;
  return entree;
}

/** Enregistre une position ; ignore les dix premières secondes. */
export function enregistrer(famille, id, position, duree) {
  if (!Number.isFinite(position) || position < 10) return;
  const tout = lireTout();
  tout[cle(famille, id)] = {
    position: Math.floor(position),
    duree: Math.max(0, Math.floor(Number(duree) || 0)),
    date: new Date().toISOString()
  };
  ecrire(tout);
}

export function effacer(famille, id) {
  const tout = lireTout();
  delete tout[cle(famille, id)];
  ecrire(tout);
}

/** Entrées de la famille, la plus récente en tête, pour la rangée « À reprendre ». */
export function deFamille(famille) {
  return Object.entries(lireTout())
    .map(([k, v]) => {
      const [fam, id] = k.split(":");
      return { famille: fam, id, ...v };
    })
    .filter((e) => e.famille === famille && e.position > 10)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
