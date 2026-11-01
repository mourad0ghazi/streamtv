/**
 * Calculs de catalogue partagés par le serveur et par la démonstration
 * statique. Module pur : ni accès réseau, ni accès au DOM.
 *
 * Une seule pagination, un seul plafond de cartes, une seule recherche, pour
 * les trois familles. Le serveur et la version publiée appellent ces fonctions.
 */

const DIACRITIQUES = /[\u0300-\u036f]/g;

export function normaliser(valeur) {
  return String(valeur ?? "")
    .normalize("NFD")
    .replace(DIACRITIQUES, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function contient(texte, terme) {
  const t = normaliser(terme);
  if (!t) return true;
  return normaliser(texte).includes(t);
}

export function comparerFr(a, b) {
  return normaliser(a).localeCompare(normaliser(b), "fr");
}

/** Pagination unique du site. `taille` ne dépasse jamais le plafond reçu. */
export function paginer(liste, page, taille, plafond) {
  const p = Math.max(1, Number.parseInt(page, 10) || 1);
  const plafondEffectif = Math.max(1, Number.parseInt(plafond, 10) || 24);
  const t = Math.min(plafondEffectif, Math.max(1, Number.parseInt(taille, 10) || plafondEffectif));
  const pages = Math.max(1, Math.ceil(liste.length / t));
  const pageCourante = Math.min(p, pages);
  const debut = (pageCourante - 1) * t;
  return { page: pageCourante, pages, taille: t, total: liste.length, contenus: liste.slice(debut, debut + t) };
}

/* ---------------------------------------------------------------- */
/* Chaînes                                                           */
/* ---------------------------------------------------------------- */

export function filtrerChaines(chaines, requete = {}) {
  const categorie = requete.categorie ?? "";
  const pays = requete.pays ?? "";
  const q = requete.q ?? "";
  return chaines
    .filter((c) => (categorie ? c.categorie === categorie : true))
    .filter((c) => (pays ? c.pays === pays : true))
    .filter((c) => (q ? contient(`${c.nom} ${c.categorie} ${c.pays}`, q) : true))
    .sort((a, b) => comparerFr(a.nom, b.nom));
}

export function categoriesDe(chaines) {
  const comptes = new Map();
  for (const c of chaines) comptes.set(c.categorie, (comptes.get(c.categorie) ?? 0) + 1);
  return [...comptes.entries()]
    .map(([nom, nombre]) => ({ nom, nombre }))
    .sort((a, b) => comparerFr(a.nom, b.nom));
}

export function paysDe(chaines) {
  const comptes = new Map();
  for (const c of chaines) comptes.set(c.pays, (comptes.get(c.pays) ?? 0) + 1);
  return [...comptes.entries()]
    .map(([code, nombre]) => ({ code, nombre }))
    .sort((a, b) => b.nombre - a.nombre || a.code.localeCompare(b.code));
}

/* ---------------------------------------------------------------- */
/* Animé                                                             */
/* ---------------------------------------------------------------- */

export function facettesAnime(contenus) {
  const uniques = (valeurs) => [...new Set(valeurs.filter((v) => v !== undefined && v !== null && v !== ""))];
  return {
    genres: uniques(contenus.flatMap((a) => a.genres ?? [])).sort(comparerFr),
    annees: uniques(contenus.map((a) => a.annee)).sort((a, b) => b - a),
    langues: uniques(contenus.map((a) => a.langue)).sort(comparerFr),
    statuts: uniques(contenus.map((a) => a.statut)).sort(comparerFr)
  };
}

export function filtrerAnime(contenus, filtres = {}) {
  return contenus
    .filter((a) => (filtres.genre ? (a.genres ?? []).includes(filtres.genre) : true))
    .filter((a) => (filtres.annee ? String(a.annee) === String(filtres.annee) : true))
    .filter((a) => (filtres.langue ? a.langue === filtres.langue : true))
    .filter((a) => (filtres.statut ? a.statut === filtres.statut : true));
}

const RANGEES_ANIME = [
  { titre: "Simulcast de la saison", critere: (a) => a.statut === "en-cours" },
  { titre: "Classiques", critere: (a) => Number(a.annee) <= 2012 },
  { titre: "Films d'animation", critere: (a) => a.format === "film" }
];

/** Rangées d'animés ; une rangée vide n'est jamais renvoyée. */
export function rangeesAnime(contenus, plafond = 24) {
  return RANGEES_ANIME.map((r) => ({ titre: r.titre, contenus: contenus.filter(r.critere).slice(0, plafond) })).filter(
    (r) => r.contenus.length > 0
  );
}

/* ---------------------------------------------------------------- */
/* Films                                                             */
/* ---------------------------------------------------------------- */

export function facettesFilms(contenus) {
  return {
    genres: [...new Set(contenus.flatMap((f) => f.genres ?? []))].sort(comparerFr),
    annees: [...new Set(contenus.map((f) => f.annee))].sort((a, b) => b - a)
  };
}

export function filtrerFilms(contenus, filtres = {}) {
  return contenus
    .filter((f) => (filtres.genre ? (f.genres ?? []).includes(filtres.genre) : true))
    .filter((f) => (filtres.annee ? String(f.annee) === String(filtres.annee) : true));
}

export function rangeesFilms(contenus, plafond = 24, maxGenre = 4) {
  const recent = [...contenus]
    .sort((a, b) => String(b.ajoute_le ?? "").localeCompare(String(a.ajoute_le ?? "")))
    .slice(0, plafond);
  const parGenre = new Map();
  for (const film of contenus) {
    for (const genre of film.genres ?? []) {
      if (!parGenre.has(genre)) parGenre.set(genre, []);
      parGenre.get(genre).push(film);
    }
  }
  const rangeesGenre = [...parGenre.entries()]
    .sort((a, b) => comparerFr(a[0], b[0]))
    .slice(0, maxGenre)
    .map(([genre, films]) => ({ titre: genre, contenus: films.slice(0, plafond) }));
  return { rangees: recent.length ? [{ titre: "Ajoutés récemment", contenus: recent }] : [], rangeesGenre };
}

/* ---------------------------------------------------------------- */
/* Recherche                                                         */
/* ---------------------------------------------------------------- */

/** Recherche globale, plafonnée ; chaque résultat porte son type en toutes lettres. */
export function rechercher({ chaines = [], anime = [], films = [] }, terme, plafond = 24) {
  const resultats = [];
  if (!normaliser(terme)) return { terme, resultats: [], total: 0 };
  for (const c of chaines) {
    if (contient(`${c.nom} ${c.categorie}`, terme)) {
      resultats.push({ type: "Chaîne", famille: "chaines", id: c.id, titre: c.nom, sousTitre: c.categorie, lien: `/chaines/${c.id}` });
    }
  }
  for (const a of anime) {
    if (contient(`${a.titre} ${a.titre_original ?? ""} ${(a.genres ?? []).join(" ")}`, terme)) {
      resultats.push({ type: "Animé", famille: "anime", id: a.id, titre: a.titre, sousTitre: (a.genres ?? []).join(", "), lien: `/anime/${a.id}` });
    }
  }
  for (const f of films) {
    if (contient(`${f.titre} ${(f.genres ?? []).join(" ")} ${f.realisateur ?? ""}`, terme)) {
      resultats.push({ type: "Film", famille: "films", id: f.id, titre: f.titre, sousTitre: (f.genres ?? []).join(", "), lien: `/films/${f.id}` });
    }
  }
  return { terme, total: resultats.length, resultats: resultats.slice(0, plafond) };
}
