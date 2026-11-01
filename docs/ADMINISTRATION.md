# Administration de StreamTV

Ce document décrit la console d'administration de StreamTV : qui y accède, ce
que montre chaque onglet, ce que change chaque réglage, comment les sources
entrent au catalogue, quels codes sont journalisés, et quelles procédures
suivre en cas de problème.

Il fait foi. Quand le texte affiché dans la console et ce fichier divergent,
c'est ce fichier qui doit être corrigé en même temps que le code : le test de
cohérence refuse une documentation qui ne correspond plus aux onglets.

## 1. Qui administre

La console connaît deux rôles. Un rôle ne peut que ce que sa liste de
permissions contient : un rôle sans permission listée ne peut rien faire.

### Administrateur

Permissions listées : `sources.lire`, `sources.ecrire`, `import.lancer`,
`reglages.lire`, `reglages.ecrire`, `audit.lire`, `roles.ecrire`,
`statistiques.lire`.

Il peut donc consulter l'état des sources, modifier une licence, activer ou
désactiver une source, changer la priorité, lancer un import, lire et écrire
les réglages, lire le journal et les statistiques.

### Lecteur

Permissions listées : `sources.lire`, `reglages.lire`, `audit.lire`,
`statistiques.lire`.

Il consulte tout et ne modifie rien. Toute écriture demandée par un lecteur est
refusée par le serveur avec un message qui nomme la permission manquante.

### Ce qu'aucun rôle ne peut faire

Aucun rôle ne peut lire le secret de signature, le condensat du mot de passe ni
les jetons d'appareil : ces valeurs ne sortent jamais du fichier
`data/secret.json`. Aucun rôle ne peut supprimer une entrée du journal
d'audit ; le journal se vide uniquement à la main, et la procédure le décrit.

## 2. Chaque onglet de la console

### Onglet Sources {#onglet-sources}

**Ce qu'il montre.** La liste des sources déclarées avec leur type, leur
famille de contenus, le nombre de contenus rattachés, leur licence, leur
priorité, leur état d'activation et l'état de la sonde (saine, instable, hors
service, jamais sondée) accompagné du taux d'échec sur les dix dernières
mesures.

**Ce qu'il permet.** Modifier la licence, changer la priorité, activer ou
désactiver une source, lancer un import manuel pour une source ou pour toutes,
et relancer une mesure sur l'ensemble des sources.

**Ce qu'il refuse.** Enregistrer une licence vide, « inconnue » ou trop courte
pour être vérifiable. Une priorité hors de l'intervalle 1 à 10. Un import de
source sans licence.

**Quand un chiffre paraît faux.** Lancez « Sonder toutes les sources » puis
rechargez la page : le compteur de contenus se calcule à partir du catalogue,
pas de la sonde. Si le compteur reste à zéro, la source est déclarée mais son
import n'a jamais abouti : ouvrez le journal, les imports portent le code A12.

### Onglet Animé {#onglet-anime}

**Ce qu'il montre.** Le nombre d'animés, le nombre de sources qui en
fournissent, les contenus sans affiche, sans épisode, sans licence, la
répartition par source et les trois derniers ajouts.

**Ce qu'il permet.** Rien ne se modifie ici : l'onglet constate. Les corrections
se font à la source, puis par un nouvel import.

**Ce qu'il refuse.** Toute écriture. Un clic sur un contenu n'ouvre pas
d'éditeur dans cette version.

**Quand un chiffre paraît faux.** Un contenu sans licence signale une source
modifiée après l'import. Corrigez la licence dans l'onglet Sources, puis
relancez l'import de cette source.

### Onglet Films {#onglet-films}

**Ce qu'il montre et permet.** Les mêmes compteurs que l'onglet Animé, pour les
films : total, sources, contenus sans affiche, contenus sans licence, derniers
ajouts.

**Quand un chiffre paraît faux.** Même règle : la source d'abord, l'import
ensuite.

### Onglet Réglages {#onglet-reglages}

**Ce qu'il montre.** Les huit réglages du site, chacun avec son libellé, son
effet visible et son risque, plus le formulaire de changement de mot de passe.

**Ce qu'il permet.** Modifier un réglage, une valeur à la fois ou plusieurs à la
fois. Chaque valeur est revalidée par le serveur ; une seule valeur refusée
annule tout le lot.

**Ce qu'il refuse.** Une valeur hors bornes, un type qui ne correspond pas, une
clé qui n'existe pas. Un message français dit laquelle est refusée et pourquoi.

**Quand un chiffre paraît faux.** La page publique garde la valeur affichée au
moment du chargement : rechargez-la après un changement.

### Onglet Journal {#onglet-journal}

**Ce qu'il montre.** Les deux cents dernières entrées d'audit, la plus récente
en tête, avec le code, la date, l'auteur et le détail, puis le catalogue complet
des codes.

**Ce qu'il permet.** La lecture seule. Une entrée ne se modifie pas et ne se
supprime pas depuis la console.

**Quand un chiffre paraît faux.** Le journal est conservé jusqu'à 500 entrées,
les plus anciennes sortent en premier. Une action absente n'a pas eu lieu : le
journal s'écrit avant la réponse au navigateur.

## 3. Chaque réglage

Chaque réglage est validé par le serveur. L'interface ne fait qu'afficher la
description venue du serveur ; elle n'invente aucun contrôle.

### Chemin de la console {#reglage-chemin-console}

Type : texte. Défaut : `/console-f3a91c`. Contraintes : commence par une barre
oblique, de 6 à 40 caractères parmi a-z, 0-9 et tiret.

Effet visible : l'adresse à laquelle la console répond. Risque si mal réglé :
un chemin devinable facilite les tentatives d'accès. À changer depuis l'onglet
Réglages, puis à retenir avant tout partage de lien.

### Plafond de cartes par page {#reglage-plafond-cartes}

Type : entier. Défaut : 24. Bornes : 8 à 60.

Effet visible : le nombre maximal de cartes affichées en même temps sur les
trois familles, et la taille des rangées. Risque : trop haut, la page ralentit
sur téléphone ; trop bas, la pagination se multiplie.

### Durée d'une session de console {#reglage-duree-session}

Type : entier, en minutes. Défaut : 60. Bornes : 5 à 1440.

Effet visible : au-delà, l'administrateur doit se reconnecter. Risque : trop
longue, un poste laissé ouvert reste accessible ; trop courte, la saisie se
perd en cours de route.

### Plafond de signalements {#reglage-plafond-signalements}

Type : entier. Défaut : 1000. Bornes : 10 à 100000.

Effet visible : un contenu qui dépasse ce nombre de signalements est retiré du
catalogue et l'action est journalisée sous le code A30. Le plafond vaut pour les
chaînes, les animés et les films. Risque : trop haut, un contenu problématique
reste en ligne ; trop bas, un contenu est retiré à tort.

### Intervalle des sondes {#reglage-intervalle-sonde}

Type : entier, en minutes. Défaut : 30. Bornes : 5 à 1440.

Effet visible : fréquence de remesure automatique de l'état des sources.
Risque : trop court, le serveur interroge les sources sans répit ; trop long,
l'état affiché vieillit.

### Nombre maximal de rangées par genre {#reglage-rangees-genre}

Type : entier. Défaut : 4. Bornes : 1 à 12.

Effet visible : plafonne les rangées « Par genre » de la page Films. Risque :
trop haut, la page Films devient une liste interminable.

### Bandeau de démonstration {#reglage-bandeau-demo}

Type : booléen. Défaut : faux.

Effet visible : affiche en haut de chaque page un bandeau qui annonce une
lecture seule. Risque : activé sur le site réel, il annonce à tort une lecture
seule. La construction statique l'active d'elle-même.

### Attente maximale du lecteur {#reglage-attente-lecteur}

Type : entier, en secondes. Défaut : 10. Bornes : 5 à 60.

Effet visible : au-delà, le lecteur abandonne et propose trois issues :
réessayer, choisir une autre source, revenir au catalogue. Risque : trop long,
l'écran reste noir ; trop court, une source lente est abandonnée à tort.

## 4. Les sources

### Ajouter une source avec sa licence

1. Vérifiez la licence à la source, chez le diffuseur ou le titulaire, jamais
   sur un agrégateur.
2. Déclarez la source avec ses dix champs : identifiant, nom, type (`direct` ou
   `vod`), contenu (`chaine`, `anime` ou `film`), adresse, licence, pays,
   langue, activation, priorité.
3. Renseignez la licence avec sa date de vérification, par exemple
   « Diffusion publique officielle, vérifiée le 2026-11-01 ».
4. Lancez l'import. Sans licence, le serveur refuse et dit précisément ce qui
   manque.

Une liste de flux reprise en bloc n'est jamais importée telle quelle : chaque
adresse se vérifie. Les entrées d'une liste M3U qui imposent un référent ou un
agent navigateur sont écartées automatiquement, parce que ce contournement
signale un relais non officiel.

### Désactiver une source

Onglet Sources, décochez « Active », puis enregistrez. La source reste
déclarée, ses contenus restent au catalogue jusqu'au prochain import ; l'action
est journalisée sous A10. Pour retirer aussi les contenus, désactivez la source
puis relancez l'import de la liste complète.

### Lire l'état de la sonde

- **Saine** : aucune mesure en échec sur les dix dernières, réponse en moins de
  2,5 secondes.
- **Instable** : au moins un échec récent, ou réponse plus lente que
  2,5 secondes.
- **Hors service** : la dernière mesure a échoué, ou la moitié au moins du lot.
- **Jamais sondée** : aucune mesure enregistrée.

La sonde informe, elle ne décide pas : elle ne désactive jamais une source.

### Interpréter un taux d'échec

Un taux inférieur à 10 pour cent se lit comme une gêne passagère. Entre 10 et
50 pour cent, la source est instable : vérifiez chez le diffuseur avant de
désactiver. Au-delà de 50 pour cent, la source est hors service : désactivez-la,
elle réapparaîtra au prochain import si elle revient.

## 5. Les codes du journal d'audit et le catalogue d'erreurs

### Codes d'audit

| Code | Action journalisée                                          |
| ---- | ----------------------------------------------------------- |
| A01  | Connexion réussie à la console                              |
| A02  | Échec de connexion à la console                             |
| A10  | Activation ou désactivation d'une source                    |
| A11  | Modification de la licence d'une source                     |
| A12  | Import manuel déclenché, avec son résultat                  |
| A20  | Modification d'un réglage, avec ancienne et nouvelle valeur |
| A30  | Retrait automatique d'un contenu au plafond de signalements |
| A40  | Création ou modification d'un rôle et de ses permissions    |

Un code publié ne change ni de numéro ni de sens. Un code jamais utilisé peut
disparaître de ce tableau, jamais être réaffecté.

### Messages d'erreur du serveur

| Message                                              | Geste attendu                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| Session absente ou expirée                           | Se reconnecter depuis l'adresse de la console.                     |
| Mot de passe incorrect                               | Vérifier le mot de passe ; l'échec est journalisé sous A02.        |
| Code de vérification incorrect ou périmé             | Relire le code sur la sortie du serveur ; il change toutes les 10 minutes. |
| Licence absente                                      | Renseigner la licence et sa date de vérification, puis réimporter. |
| Le rôle X n'a pas la permission Y                    | Se connecter avec un rôle qui la possède.                          |
| Le chemin doit commencer par une barre oblique       | Corriger le réglage `chemin_console`.                              |
| La valeur doit être comprise entre N et M            | Corriger le réglage concerné dans ses bornes.                      |

## 6. Les procédures

### Première mise en service

1. Installer Node.js (version LTS) et Git, puis cloner le dépôt.
2. Vérifier : `node --version` et `git --version` répondent.
3. Démarrer : `npm start`, puis ouvrir `http://127.0.0.1:3000`.
4. Lancer les tests : `npm test`. Le récapitulatif doit être sans échec.
5. Contrôler l'instance : `node scripts/verify.js --base http://127.0.0.1:3000`.
   Seul l'avertissement du mot de passe par défaut est attendu.
6. Ouvrir la console à l'adresse affichée par le serveur, changer le mot de
   passe, puis relancer le contrôle : l'avertissement disparaît.

### Changer de mot de passe

Onglet Réglages, bloc « Changer le mot de passe » : mot de passe actuel, nouveau
mot de passe de huit caractères au minimum. Le mot de passe par défaut est
refusé comme nouveau mot de passe. La session en cours reste valide ; les
appareils déjà reconnus restent reconnus.

### Ajouter un collaborateur

Il n'existe pas de compte par personne : la console s'ouvre avec un mot de passe
commun et, pour un appareil non reconnu, le code de vérification affiché par le
serveur. Pour donner un accès, transmettez le mot de passe de vive voix et
faites saisir le code au moment de la première connexion. Pour retirer tous les
appareils, supprimez `data/secret.json` et redémarrez : un nouveau mot de passe
par défaut est créé, à changer aussitôt.

### Sauvegarder

Copiez le dossier `data/` en entier. Il contient les catalogues, les sources, le
journal, les réglages et le secret. Une sauvegarde sans `data/` ne restaure
rien.

### Restaurer

Arrêtez le serveur, remplacez `data/` par la sauvegarde, redémarrez. Le
catalogue est relu au démarrage.

### Remettre à zéro un import

Supprimez la source concernée de `data/sources.json`, puis relancez l'import des
autres sources. Si le catalogue doit être reconstruit, utilisez
`node scripts/importer.mjs --amont <dossier du relevé>` après avoir sauvegardé
`data/`.

## 7. Les pièges

**Ce qui casse le site.** Une licence vidée à la main dans `data/sources.json`
fait refuser l'import suivant. Un `data/sources.json` enregistré avec une
accolade manquante empêche le démarrage : le serveur refuse de démarrer plutôt
que de servir un catalogue faux.

**Un fichier temporaire dans `data/`.** Une écriture interrompue laisse un
fichier `*.tmp`. Il n'est jamais lu comme catalogue et peut être supprimé
sans risque.

**Ce qui ralentit.** Un plafond de cartes au-delà de 40 sur un téléphone, et un
intervalle de sonde inférieur à 10 minutes sur 180 sources. Les deux se règlent
dans l'onglet Réglages.

**Ce qui ne se répare qu'à la main.** Un mot de passe oublié : supprimez
`data/secret.json` et redémarrez. Un catalogue corrompu : restaurez la
sauvegarde. Un journal d'audit à vider : supprimez `data/audit.json` serveur
arrêté.

**Le cache du navigateur.** Chaque module porte la version dans son adresse.
Une page qui semble ancienne après une mise à jour signale que
`npm run versionner` n'a pas été lancé : `npm run versionner:check` le dit.
