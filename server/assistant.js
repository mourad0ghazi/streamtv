/**
 * Assistant de contrôle : un moteur de règles local, sans modèle distant.
 *
 * Deux services, honnêtement séparés :
 * 1. `diagnostic()` examine l'état réel du site (catalogue, sources, sondes,
 *    incidents, clés, apparence, accueil, lecture) et rend des constats, chacun
 *    avec sa gravité et, quand c'est possible, une correction précise ;
 * 2. `demander(phrase)` comprend un vocabulaire français documenté et propose
 *    des changements datés, chiffrés, montrés avant application. Rien n'est
 *    deviné : une phrase hors vocabulaire est refusée, avec la liste de ce qui
 *    est compris.
 *
 * Ce module n'appelle aucun service extérieur, ne génère aucun texte libre et
 * ne modifie rien de lui-même : `appliquer()` revalide chaque changement avec
 * le module compétent, qui peut le refuser.
 */

import { contenus, sources } from "./magasin.js";
import * as reglages from "./reglages.js";
import * as apparence from "./apparence.js";
import * as accueil from "./accueil.js";
import * as lecture from "./lecture.js";
import * as incidents from "./incidents.js";
import * as clesFilms from "./cles-films.js";
import * as auth from "./auth.js";

/** Normalisation de la phrase : minuscules, sans accents, sans ponctuation lourde. */
export function normaliser(phrase) {
  return String(phrase ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[.,;:!?«»"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nombre(texte) {
  const valeur = Number.parseInt(String(texte), 10);
  return Number.isFinite(valeur) ? valeur : null;
}

/* ------------------------------------------------------------------ */
/* Diagnostic                                                          */
/* ------------------------------------------------------------------ */

function constat(code, gravite, titre, detail, correction = null, doc = "onglet-assistant") {
  return { code, gravite, titre, detail, correction, doc };
}

/**
 * Analyse l'installation. Chaque constat s'appuie sur une mesure, pas sur une
 * impression : le détail donne le chiffre qui a déclenché la remarque.
 */
export async function diagnostic(options = {}) {
  await reglages.charger();
  await apparence.charger();
  await accueil.charger();
  await lecture.charger();

  const constats = [];
  const films = contenus("films");
  const anime = contenus("anime");
  const chaines = contenus("chaines");
  const listesSources = sources();
  const sections = accueil.valeurs();
  const etatLecture = await lecture.statut();
  const etatApparence = await apparence.etat();
  const listeIncidents = options.incidents ?? (await incidents.lister({ limite: 20 }));

  if (auth.motDePasseParDefaut()) {
    constats.push(constat(
      "D01", "grave",
      "Le mot de passe de la console est encore celui d'origine",
      "Le mot de passe par défaut est actif. Tant qu'il l'est, la console s'ouvre avec un secret public.",
      null,
      "onglet-reglages"
    ));
  }
  if (reglages.valeur("console_sans_mot_de_passe") === true) {
    constats.push(constat(
      "D02", "avertissement",
      "La console du port d'administration s'ouvre sans mot de passe",
      "Le port d'administration est en accès libre. Le site public garde son mot de passe, mais ce port doit rester sur une machine de confiance.",
      { module: "reglages", changements: { console_sans_mot_de_passe: false }, libelle: "Rétablir le mot de passe sur le port d'administration" },
      "reglage-console-libre"
    ));
  }
  if (reglages.valeur("bandeau_demo") === true) {
    constats.push(constat(
      "D03", "avertissement",
      "Le bandeau de démonstration est affiché sur le site réel",
      "Chaque page annonce une lecture seule qui n'existe pas.",
      { module: "reglages", changements: { bandeau_demo: false }, libelle: "Retirer le bandeau de démonstration" },
      "reglage-bandeau-demo"
    ));
  }

  const sansLicence = [...films, ...anime].filter((c) => !c.licence && !(c.sources ?? []).length);
  if (sansLicence.length) {
    constats.push(constat(
      "D10", "grave",
      `${sansLicence.length} contenu(s) sans licence ni source`,
      `Exemples : ${sansLicence.slice(0, 3).map((c) => c.titre).join(", ")}. Un contenu sans licence vérifiée ne devrait pas rester publié.`,
      null,
      "onglet-sources"
    ));
  }
  const sansAffiche = [...films, ...anime].filter((c) => !c.affiche);
  if (sansAffiche.length) {
    constats.push(constat(
      "D11", "avertissement",
      `${sansAffiche.length} contenu(s) sans affiche`,
      "La carte s'affiche avec des initiales à la place de l'affiche : lisible, mais moins clair.",
      null,
      "onglet-films"
    ));
  }
  const inactives = listesSources.filter((s) => s.actif === false);
  if (inactives.length) {
    constats.push(constat(
      "D12", "info",
      `${inactives.length} source(s) désactivée(s)`,
      "Elles restent dans le catalogue de sources mais ne fournissent plus rien au site.",
      null,
      "onglet-sources"
    ));
  }
  if (!listesSources.length) {
    constats.push(constat("D13", "grave", "Aucune source déclarée", "Le catalogue ne peut rien afficher sans source.", null, "onglet-sources"));
  }

  const graves = listeIncidents.filter((i) => i.occurrences >= 3);
  if (graves.length) {
    constats.push(constat(
      "D20", "avertissement",
      `${graves.length} incident(s) répété(s) côté navigateur`,
      `Le plus fréquent : « ${graves[0].message} » sur ${graves[0].page}, ${graves[0].occurrences} fois.`,
      null,
      "onglet-assistant"
    ));
  }

  const cles = await clesFilms.statut();
  if (!cles.disponible) {
    constats.push(constat(
      "D30", "info",
      "Aucune clé d'API films",
      "Les fiches s'affichent sans complément TMDb. Lancez npm run cles, ou posez TMDB_API_KEY.",
      null,
      "onglet-films"
    ));
  }

  if (etatLecture.fournisseur_actif && !etatLecture.atteste) {
    constats.push(constat(
      "D40", "grave",
      "La lecture tierce est ouverte sans attestation de droits",
      "Un flux tiers est diffusé sans que personne n'ait déclaré en avoir le droit.",
      { module: "lecture", changements: { fournisseur_actif: false }, libelle: "Fermer la lecture tierce" },
      "lecture-fournisseur"
    ));
  }
  if (etatLecture.fournisseur_actif && !etatLecture.clePresente) {
    constats.push(constat(
      "D41", "avertissement",
      "Le fournisseur de lecture n'a pas de clé",
      "Les films ne peuvent pas être servis par le fournisseur : les fiches retombent sur le fichier du catalogue.",
      null,
      "lecture-base"
    ));
  }

  if (etatApparence.contrasteAccentFond < 3) {
    constats.push(constat(
      "D50", "avertissement",
      "L'accent ne se détache pas assez du fond",
      `Contraste mesuré : ${String(etatApparence.contrasteAccentFond).replace(".", ",")} pour 1, il en faut 3.`,
      { module: "apparence", changements: { accent: "#e0821f" }, libelle: "Revenir à l'accent d'origine" },
      "apparence-accent"
    ));
  }

  const genresFilms = new Set(films.flatMap((f) => f.genres ?? []));
  for (const section of sections) {
    if (section.type === "films-genre" && !genresFilms.has(section.genre)) {
      constats.push(constat(
        `D60-${section.id}`, "avertissement",
        `La section « ${section.titre} » ne trouvera aucun film`,
        `Aucun film ne porte le genre « ${section.genre} ». La section restera vide sur l'accueil.`,
        { module: "accueil", cible: section.id, supprimer: true, libelle: `Retirer la section « ${section.titre} »` },
        "onglet-accueil"
      ));
    }
  }
  const nomsRangees = new Set(anime.flatMap((a) => [a.rangee, ...(a.rangees ?? [])]).filter(Boolean));
  for (const section of sections) {
    if (section.type === "anime-rangee" && nomsRangees.size && !nomsRangees.has(section.rangee)) {
      constats.push(constat(
        `D61-${section.id}`, "avertissement",
        `La section « ${section.titre} » désigne une rangée inconnue`,
        `Les rangées disponibles sont : ${[...nomsRangees].slice(0, 6).join(", ")}.`,
        { module: "accueil", cible: section.id, supprimer: true, libelle: `Retirer la section « ${section.titre} »` },
        "onglet-accueil"
      ));
    }
  }
  if (sections.length > 10) {
    constats.push(constat(
      "D62", "info",
      "L'accueil compte beaucoup de sections",
      `${sections.length} sections : au-delà de dix, la page devient longue à parcourir.`,
      null,
      "onglet-accueil"
    ));
  }

  if (reglages.valeur("plafond_cartes") > 48) {
    constats.push(constat(
      "D70", "info",
      "Le plafond de cartes est élevé",
      `${reglages.valeur("plafond_cartes")} cartes par page : au-delà de 48, le téléphone ralentit.`,
      { module: "reglages", changements: { plafond_cartes: 24 }, libelle: "Revenir à 24 cartes par page" },
      "reglage-plafond-cartes"
    ));
  }

  const resume = {
    graves: constats.filter((c) => c.gravite === "grave").length,
    avertissements: constats.filter((c) => c.gravite === "avertissement").length,
    infos: constats.filter((c) => c.gravite === "info").length,
    corregeables: constats.filter((c) => c.correction).length,
    mesures: {
      films: films.length,
      anime: anime.length,
      chaines: chaines.length,
      sources: listesSources.length,
      incidents: await incidents.total(),
      sections: sections.length
    }
  };
  return { releve: new Date().toISOString(), constats, resume };
}

/* ------------------------------------------------------------------ */
/* Compréhension des phrases                                           */
/* ------------------------------------------------------------------ */

/**
 * Vocabulaire compris, affiché tel quel dans la console. Chaque exemple est
 * reconnu par un test : la liste ne peut pas promettre plus que le moteur.
 */
export const EXEMPLES = [
  "Affiches par rangée à 5",
  "Densité compacte",
  "Thème clair",
  "Accent #c2410c",
  "Largeur 1400",
  "Rayon 12",
  "Désactive les animations",
  "Masque la section Ajoutés récemment",
  "Monte Reprendre la lecture",
  "Limite de cartes à 32",
  "Attente du lecteur à 8 secondes",
  "Désactive la reprise automatique",
  "Analyse les bugs",
  "Corrige tout"
];

function sectionParNom(sections, nom) {
  const cible = normaliser(nom);
  if (!cible) return null;
  return sections.find((s) => normaliser(s.titre) === cible)
    ?? sections.find((s) => normaliser(s.titre).includes(cible) || cible.includes(normaliser(s.titre)))
    ?? null;
}

function action(module, libelle, changements, extra = {}) {
  return { module, libelle, changements, ...extra };
}

/**
 * Traduit une phrase en changements proposés. Renvoie toujours un objet :
 * `comprise: false` avec une explication, plutôt qu'une action au hasard.
 */
export async function demander(phrase) {
  await reglages.charger();
  await apparence.charger();
  await accueil.charger();
  const texte = normaliser(phrase);
  const sections = accueil.valeurs();
  const proposition = { comprise: false, phrase: String(phrase ?? ""), lecture: "", actions: [], remarque: null };

  if (!texte) {
    proposition.lecture = "La phrase est vide.";
    return proposition;
  }

  if (/\b(analyse|analyser|diagnostic|verifie|controle)\b/.test(texte) && /\b(bug|bugs|erreur|erreurs|sante|site)\b/.test(texte)) {
    return { ...proposition, comprise: true, lecture: "Diagnostic complet de l'installation.", diagnostic: true };
  }

  if (/\b(corrige|corriger|repare|reparer|tout)\b/.test(texte) && /\b(tout|tout de suite|automatiquement)\b/.test(texte)) {
    const { constats } = await diagnostic();
    const actions = constats.filter((c) => c.correction).map((c) => ({ ...c.correction, constat: c.code }));
    return {
      ...proposition,
      comprise: true,
      lecture: `${actions.length} correction(s) sûre(s) proposée(s), sur ${constats.length} constat(s).`,
      actions
    };
  }

  let m = texte.match(/affiches?(?: par rangee)? (?:a|sur) (\d+)/) ?? texte.match(/(\d+) affiches? par rangee/);
  if (m) {
    const valeur = nombre(m[1]);
    return { ...proposition, comprise: true, lecture: `Nombre d'affiches par rangée : ${valeur}.`, actions: [action("apparence", `Affiches par rangée : ${valeur}`, { affiches_par_rangee: valeur })] };
  }

  m = texte.match(/densite (compacte|confort|ample)/);
  if (m) {
    return { ...proposition, comprise: true, lecture: `Densité : ${m[1]}.`, actions: [action("apparence", `Densité : ${m[1]}`, { densite: m[1] })] };
  }

  m = texte.match(/theme (sombre|clair)/);
  if (m) {
    return { ...proposition, comprise: true, lecture: `Thème : ${m[1]}.`, actions: [action("apparence", `Thème : ${m[1]}`, { theme: m[1] })] };
  }

  m = texte.match(/(?:accent|couleur) (#[0-9a-f]{6})/) ?? texte.match(/(#[0-9a-f]{6})/);
  if (m) {
    return { ...proposition, comprise: true, lecture: `Couleur d'accent : ${m[1]}.`, actions: [action("apparence", `Accent : ${m[1]}`, { accent: m[1] })] };
  }

  m = texte.match(/largeur (\d+)/);
  if (m) {
    const valeur = nombre(m[1]);
    return { ...proposition, comprise: true, lecture: `Largeur du contenu : ${valeur} pixels.`, actions: [action("apparence", `Largeur : ${valeur} pixels`, { largeur: valeur })] };
  }

  m = texte.match(/rayon (\d+)/);
  if (m) {
    const valeur = nombre(m[1]);
    return { ...proposition, comprise: true, lecture: `Rayon des angles : ${valeur} pixels.`, actions: [action("apparence", `Rayon : ${valeur} pixels`, { rayon: valeur })] };
  }

  m = texte.match(/(desactive|active|coupe|remets?) les animations/);
  if (m) {
    const valeur = ["active", "remets"].includes(m[1]);
    return { ...proposition, comprise: true, lecture: `Animations : ${valeur ? "activées" : "désactivées"}.`, actions: [action("apparence", `Animations ${valeur ? "activées" : "désactivées"}`, { animations: valeur })] };
  }

  m = texte.match(/(masque|cache|retire) la section (.+)/);
  if (m) {
    const section = sectionParNom(sections, m[2]);
    if (!section) return { ...proposition, lecture: `Aucune section ne s'appelle « ${m[2].trim()} ».` };
    return { ...proposition, comprise: true, lecture: `Section masquée : ${section.titre}.`, actions: [action("accueil", `Masquer « ${section.titre} »`, { visible: false }, { cible: section.id })] };
  }

  m = texte.match(/(affiche|montre) la section (.+)/);
  if (m) {
    const section = sectionParNom(sections, m[2]);
    if (!section) return { ...proposition, lecture: `Aucune section ne s'appelle « ${m[2].trim()} ».` };
    return { ...proposition, comprise: true, lecture: `Section affichée : ${section.titre}.`, actions: [action("accueil", `Afficher « ${section.titre} »`, { visible: true }, { cible: section.id })] };
  }

  m = texte.match(/(monte|remonte) (.+)/) ?? texte.match(/(descends|baisse) (.+)/);
  if (m) {
    const section = sectionParNom(sections, m[2]);
    if (!section) return { ...proposition, lecture: `Aucune section ne s'appelle « ${m[2].trim()} ».` };
    const sens = ["monte", "remonte"].includes(m[1]) ? "haut" : "bas";
    return { ...proposition, comprise: true, lecture: `« ${section.titre} » déplacée vers le ${sens}.`, actions: [action("accueil", `Déplacer « ${section.titre} » vers le ${sens}`, {}, { cible: section.id, deplacer: sens })] };
  }

  m = texte.match(/(?:limite|plafond) (?:de cartes )?(?:a|sur) (\d+)/);
  if (m) {
    const valeur = nombre(m[1]);
    return { ...proposition, comprise: true, lecture: `Plafond de cartes par page : ${valeur}.`, actions: [action("reglages", `Plafond de cartes : ${valeur}`, { plafond_cartes: valeur })] };
  }

  m = texte.match(/attente (?:du lecteur )?(?:a|de) (\d+) ?(?:s|sec|secondes)?/);
  if (m) {
    const valeur = nombre(m[1]);
    return { ...proposition, comprise: true, lecture: `Attente avant lecture : ${valeur} secondes.`, actions: [action("reglages", `Attente du lecteur : ${valeur} secondes`, { attente_lecteur_secondes: valeur })] };
  }

  m = texte.match(/(desactive|coupe) la reprise/);
  if (m) {
    return { ...proposition, comprise: true, lecture: "Reprise automatique désactivée.", actions: [action("lecture", "Reprise automatique désactivée", { reprise_auto: false })] };
  }
  m = texte.match(/active la reprise/);
  if (m) {
    return { ...proposition, comprise: true, lecture: "Reprise automatique activée.", actions: [action("lecture", "Reprise automatique activée", { reprise_auto: true })] };
  }

  m = texte.match(/(desactive|ferme|coupe) (?:le|la) (?:fournisseur|lecture tierce)/);
  if (m) {
    return { ...proposition, comprise: true, lecture: "Lecture par fournisseur fermée.", actions: [action("lecture", "Fermer la lecture tierce", { fournisseur_actif: false })] };
  }
  m = texte.match(/active (?:le|la) (?:fournisseur|lecture tierce)/);
  if (m) {
    return {
      ...proposition,
      comprise: true,
      lecture: "Lecture par fournisseur ouverte, si l'attestation et la clé sont en place.",
      actions: [action("lecture", "Ouvrir la lecture tierce", { fournisseur_actif: true })]
    };
  }

  proposition.lecture = "Je ne reconnais pas cette demande. Les formulations comprises sont listées à côté du champ.";
  proposition.exemples = EXEMPLES;
  return proposition;
}

/* ------------------------------------------------------------------ */
/* Application                                                         */
/* ------------------------------------------------------------------ */

const HISTORIQUE_MAX = 20;
const historique = [];

/**
 * Applique des changements déjà validés une fois par le module compétent.
 * Chaque action est rejouée séparément : une action refusée n'annule pas les
 * autres, et le compte rendu dit exactement ce qui est passé et ce qui non.
 */
export async function appliquer(actions, options = {}) {
  if (!Array.isArray(actions) || !actions.length) {
    return { ok: false, message: "Aucun changement à appliquer.", appliquees: [], refusees: [] };
  }
  const appliquees = [];
  const refusees = [];
  const annulation = [];

  for (const item of actions) {
    const libelle = String(item?.libelle ?? "Changement");
    let resultat = { ok: false, message: "Ce type de changement n'existe pas." };
    if (item?.module === "apparence") {
      const avant = apparence.valeurs();
      const r = await apparence.modifier(item.changements ?? {}, options);
      resultat = r.applique ? { ok: true } : { ok: false, message: Object.values(r.refuses).join(" ") };
      if (resultat.ok) annulation.push({ module: "apparence", changer: avant });
    } else if (item?.module === "reglages") {
      const avant = reglages.valeurs();
      const r = await reglages.modifier(item.changements ?? {}, options);
      resultat = r.applique ? { ok: true } : { ok: false, message: Object.values(r.refuses).join(" ") };
      if (resultat.ok) annulation.push({ module: "reglages", changer: avant });
    } else if (item?.module === "lecture") {
      const avant = await lecture.statut();
      const r = await lecture.modifier(item.changements ?? {}, options);
      resultat = r.applique ? { ok: true } : { ok: false, message: Object.values(r.refuses).join(" ") };
      if (resultat.ok) annulation.push({ module: "lecture", changer: { reprise_auto: avant.reprise_auto, demarrage_muet: avant.demarrage_muet, fournisseur_actif: avant.fournisseur_actif } });
    } else if (item?.module === "accueil") {
      const avant = accueil.valeurs();
      let r;
      if (item.supprimer) r = await accueil.supprimer(item.cible, options);
      else if (item.deplacer) r = await accueil.deplacer(item.cible, item.deplacer, options);
      else r = await accueil.modifier(item.cible, item.changements ?? {}, options);
      resultat = r.ok ? { ok: true } : { ok: false, message: r.message };
      if (resultat.ok) annulation.push({ module: "accueil", remplacer: avant });
    }
    if (resultat.ok) appliquees.push({ libelle, module: item.module });
    else refusees.push({ libelle, raison: resultat.message });
  }

  if (appliquees.length && options.journaliser !== false) {
    const { journaliser } = await import("./audit.js");
    await journaliser("A50", { actions: appliquees.map((a) => a.libelle) }, options.auteur ?? "assistant");
  }
  if (annulation.length) {
    historique.unshift({ date: new Date().toISOString(), annulation, appliquees: appliquees.length });
    if (historique.length > HISTORIQUE_MAX) historique.pop();
  }
  return { ok: appliquees.length > 0, appliquees, refusees, annulable: annulation.length > 0 };
}

/** Annule le dernier lot appliqué, si l'annulation est encore possible. */
export async function annuler(options = {}) {
  const dernier = historique.shift();
  if (!dernier) return { ok: false, message: "Aucun changement récent à annuler dans cette session." };
  for (const etape of dernier.annulation) {
    if (etape.module === "apparence") await apparence.modifier(etape.changer, options);
    else if (etape.module === "reglages") await reglages.modifier(etape.changer, options);
    else if (etape.module === "lecture") await lecture.modifier(etape.changer, options);
    else if (etape.module === "accueil") await accueil.remplacer(etape.remplacer, options);
  }
  const { journaliser } = await import("./audit.js");
  await journaliser("A51", { actions: dernier.appliquees }, options.auteur ?? "assistant");
  return { ok: true, message: "Le dernier changement est annulé." };
}

export function historiqueActions() {
  return historique.map((h) => ({ date: h.date, appliquees: h.appliquees }));
}

export function reinitialiser() {
  historique.length = 0;
}
