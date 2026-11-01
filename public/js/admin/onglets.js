/**
 * Liste des onglets de la console. Source unique : la console les affiche dans
 * cet ordre, et le test de cohérence compare cette liste à
 * docs/ADMINISTRATION.md dans les deux sens.
 */

export const ONGLETS = [
  { cle: "sources", libelle: "Sources", doc: "onglet-sources" },
  { cle: "anime", libelle: "Animé", doc: "onglet-anime" },
  { cle: "films", libelle: "Films", doc: "onglet-films" },
  { cle: "reglages", libelle: "Réglages", doc: "onglet-reglages" },
  { cle: "journal", libelle: "Journal", doc: "onglet-journal" }
];

export const ROLES = {
  administrateur: "Administrateur : toutes les permissions listées dans la documentation.",
  lecteur: "Lecteur : lecture des sources, des réglages, du journal et des statistiques."
};
