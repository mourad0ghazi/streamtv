/**
 * Plan de la console. Source unique : la console affiche ces onglets dans cet
 * ordre, et le test de cohérence compare cette liste à docs/ADMINISTRATION.md
 * dans les deux sens.
 *
 * `permission` décide de la visibilité de l'onglet : un compte de modération ne
 * voit pas la gestion des utilisateurs, non par politesse, mais parce que le
 * serveur lui refuserait la route de toute façon.
 */

export const ONGLETS = [
  { cle: "tableau", libelle: "Tableau de bord", doc: "onglet-tableau", groupe: "Pilotage", permission: "tableau.lire" },
  { cle: "accueil", libelle: "Accueil", doc: "onglet-accueil", groupe: "Pilotage", permission: "accueil.lire" },
  { cle: "apparence", libelle: "Apparence", doc: "onglet-apparence", groupe: "Pilotage", permission: "affichage.lire" },
  { cle: "lecture", libelle: "Lecture et diffusion", doc: "onglet-lecture", groupe: "Pilotage", permission: "lecture.lire" },

  { cle: "sources", libelle: "Sources", doc: "onglet-sources", groupe: "Catalogue", permission: "sources.lire" },
  { cle: "anime", libelle: "Animé", doc: "onglet-anime", groupe: "Catalogue", permission: "catalogue.lire" },
  { cle: "films", libelle: "Films", doc: "onglet-films", groupe: "Catalogue", permission: "catalogue.lire" },

  { cle: "utilisateurs", libelle: "Utilisateurs", doc: "onglet-utilisateurs", groupe: "Personnes", permission: "utilisateurs.lire" },
  { cle: "permissions", libelle: "Permissions", doc: "onglet-permissions", groupe: "Personnes", permission: "utilisateurs.lire" },

  { cle: "assistant", libelle: "Assistant", doc: "onglet-assistant", groupe: "Exploitation", permission: "ia.utiliser" },
  { cle: "journal", libelle: "Journal", doc: "onglet-journal", groupe: "Exploitation", permission: "audit.lire" },
  { cle: "statistiques", libelle: "Statistiques", doc: "onglet-statistiques", groupe: "Exploitation", permission: "statistiques.lire" },
  { cle: "reglages", libelle: "Réglages", doc: "onglet-reglages", groupe: "Exploitation", permission: "reglages.lire" }
];

export const GROUPES = ["Pilotage", "Catalogue", "Personnes", "Exploitation"];

/** Rôles connus, pour l'affichage. La vérité reste côté serveur. */
export const ROLES = {
  proprietaire: "Propriétaire : toutes les permissions, y compris changer les rôles.",
  administrateur: "Administrateur : l'exploitation du site et les comptes.",
  editeur: "Éditeur : le catalogue, l'accueil et l'apparence.",
  moderateur: "Modérateur : les sources, leur licence et les incidents.",
  analyste: "Analyste : lecture seule des chiffres, du journal et du diagnostic.",
  lecteur: "Lecteur : les sources, les réglages, le journal et les statistiques."
};

/** Onglets visibles pour une session, dans l'ordre du plan. */
export function ongletsVisibles(permissions = []) {
  const connues = new Set(permissions);
  return ONGLETS.filter((onglet) => connues.has(onglet.permission));
}
