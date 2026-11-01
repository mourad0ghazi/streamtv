# Administration de StreamTV

Ce document décrit la console d'administration de StreamTV : qui y accède, ce
que montre chaque onglet, ce que change chaque réglage, comment les sources
entrent au catalogue, quels codes sont journalisés, et quelles procédures
suivre en cas de problème.

Il fait foi. Quand le texte affiché dans la console et ce fichier divergent,
c'est ce fichier qui doit être corrigé en même temps que le code : le test de
cohérence refuse une documentation qui ne correspond plus aux onglets.

## 1. Qui administre

La console distingue six rôles et vingt-deux permissions nommées. Un rôle donne
un socle ; chaque compte peut ensuite recevoir une permission en plus (`accorde`)
ou en moins (`refuse`). Le serveur recalcule les droits effectifs à chaque
requête : masquer un onglet n'est qu'un confort, le refus vient de la route.

### Les six rôles

| Rôle | Ce qu'il peut, en une phrase |
| ---- | ---------------------------- |
| Propriétaire | Tout, y compris changer les permissions des rôles. C'est le mot de passe de la console. |
| Administrateur | Toute l'exploitation, comptes compris, sauf la modification des rôles. |
| Éditeur | Le catalogue, l'accueil, l'apparence et les publications. |
| Modérateur | Les sources, leur licence, l'import, le suivi des incidents. |
| Analyste | Lecture seule : chiffres, journal, incidents, diagnostic. |
| Lecteur | Le minimum historique : sources, réglages, journal, statistiques. |

### Les permissions

Elles sont rangées en sept groupes, affichés tels quels dans l'onglet
**Permissions** : Pilotage, Catalogue, Sources et import, Lecture, Apparence et
accueil, Utilisateurs, Exploitation.

| Permission | Ce qu'elle ouvre |
| ---------- | ---------------- |
| `tableau.lire` | Le tableau de bord |
| `catalogue.lire` | Les fiches et les chiffres du catalogue |
| `catalogue.ecrire` | La modification d'une fiche, l'ajout d'un film TMDb |
| `catalogue.publier` | La publication de la version statique |
| `sources.lire`, `sources.ecrire` | La consultation et la modification des sources |
| `import.lancer` | Un import de playlist |
| `lecture.lire`, `lecture.ecrire` | La configuration du fournisseur et du lecteur |
| `affichage.lire`, `affichage.ecrire` | L'apparence du site public |
| `accueil.lire`, `accueil.ecrire` | La composition de l'accueil |
| `utilisateurs.lire`, `utilisateurs.ecrire` | Les comptes |
| `roles.ecrire` | Les socles de permissions des rôles |
| `reglages.lire`, `reglages.ecrire` | Les réglages d'exploitation |
| `audit.lire`, `statistiques.lire` | Le journal et les statistiques |
| `incidents.lire` | Les incidents remontés par les navigateurs |
| `ia.utiliser` | Le diagnostic et les demandes à l'assistant |

### Deux garde-fous

Le propriétaire garde toujours toutes les permissions : ni le fichier de
surcharges ni l'interface ne peuvent lui en retirer une. L'administrateur garde
toujours `utilisateurs.ecrire` : sans elle, plus personne ne pourrait créer de
compte, et le site se retrouverait sans personne pour l'administrer.

### Ce qu'aucun rôle ne peut faire

Aucun rôle ne peut lire le secret de signature, le condensat du mot de passe ni
les jetons d'appareil : ces valeurs ne sortent jamais du fichier
`data/secret.json`, et les empreintes des comptes ne sortent jamais de
`data/comptes.json`. Aucun rôle ne peut supprimer une entrée du journal
d'audit ; le journal se vide uniquement à la main, et la procédure le décrit.
Aucune route ne renvoie une clé d'API ou la clé du fournisseur en entier.

## 2. Chaque onglet de la console

### Onglet Tableau de bord {#onglet-tableau}

Un écran, quatre blocs : les chiffres du catalogue (chaînes, animés, films,
sections d'accueil, incidents, comptes), la santé du site (catalogue, sources,
licences, lecture, incidents, clés, console), l'activité récente lue dans le
journal, et les incidents côté navigateur.

Chaque ligne de santé porte un état et un chiffre : « 1 486 saines sur 1 492
actives » plutôt qu'une appréciation. Un état en échec est rouge, un
avertissement est orange, l'information est grise. Les raccourcis mènent à
l'accueil, à l'apparence, à la diffusion et à l'assistant.

### Onglet Accueil {#onglet-accueil}

L'accueil est une liste ordonnée de sections. Chaque ligne porte son type, son
titre, ses réglages (nombre de cartes, genre, nom de rangée, texte), une case
« visible », deux boutons d'ordre et deux actions : mettre à jour, retirer.

Les types disponibles sont : les trois entrées, la dernière chaîne regardée, la
reprise de lecture, les favoris, les films ajoutés récemment, les films d'un
genre, une rangée d'animés, les catégories de chaînes, un bloc de texte. Une
section qui ne trouve rien ne s'affiche pas sur le site : pas de rangée vide,
pas de titre orphelin.

L'accueil ne peut pas être vidé : la première section porte le titre de la page.
Le serveur refuse un titre de moins de deux caractères, un nombre de cartes hors
de 4 à 24, ou deux sections de même identifiant.

### Onglet Apparence {#onglet-apparence}

Huit réglages, tous validés par le serveur :

| Réglage | Type | Valeurs |
| ------- | ---- | ------- |
| Nom du site | texte | 2 à 40 caractères |
| Couleur d'accent {#apparence-accent} | couleur | `#rrggbb`, contraste minimum de 3 pour 1 avec le fond |
| Thème {#apparence-theme} | choix | `sombre`, `clair` |
| Densité {#apparence-densite} | choix | `compacte`, `confort`, `ample` |
| Rayon des angles {#apparence-rayon} | entier | 0 à 16 pixels |
| Largeur du contenu {#apparence-largeur} | entier | 1080 à 1600 pixels, multiple de 8 |
| Affiches par rangée {#apparence-affiches} | entier | 3 à 8 |
| Animations {#apparence-animations} | booléen | vrai ou faux |

Le serveur ne renvoie pas de CSS libre : il produit une feuille de variables à
l'adresse `/apparence.css`, que le site charge comme n'importe quel style. Une
couleur d'accent illisible sur le fond est refusée avec sa mesure de contraste ;
le texte posé sur l'accent est calculé pour rester lisible.

### Onglet Lecture et diffusion {#onglet-lecture}

Trois décisions, dans cet ordre.

**1. L'attestation de droits.** Un flux tiers n'est pas un contenu du catalogue :
le site ne peut pas prouver sa licence. La console demande donc une attestation
nommée et datée. Sans elle, la lecture tierce reste fermée et aucun film ne peut
être ajouté au catalogue.

**2. Le fournisseur.** Nom affiché, adresse (HTTPS ; HTTP n'est accepté que sur
la boucle locale), chemin du cadre avec `{tmdbId}` et `{cle}`, clé. La clé est
stockée dans `data/lecture.json`, jamais versionnée, jamais réaffichée : l'état
montre seulement un extrait, par exemple `nx_ab…9e7`.

| Réglage | Type | Valeur par défaut |
| ------- | ---- | ---------------- |
| Lecture par fournisseur tiers {#lecture-fournisseur} | booléen | faux |
| Nom du fournisseur {#lecture-nom} | texte | NexStream |
| Adresse du fournisseur {#lecture-base} | texte | `https://api.codespecters.com` |
| Chemin du cadre {#lecture-modele} | texte | `/embed/movie/{tmdbId}?apikey={cle}` |
| Qualité maximale {#lecture-qualite} | choix | automatique |
| Reprise automatique {#lecture-reprise} | booléen | vrai |
| Démarrage sans son {#lecture-muet} | booléen | faux |

**3. Les préférences du lecteur.** Elles s'appliquent aux fichiers du catalogue :
qualité maximale, reprise à la seconde, démarrage sans son.

Le serveur construit l'adresse du cadre, jamais la page : identifiant entier
positif, remplacement des jetons, vérification stricte du domaine obtenu. Une
adresse qui sortirait du domaine déclaré est refusée. La position de reprise
part dans le paramètre `progress`, en secondes.

### Relais des flux {#lecture-relais}

La plupart des chaînes du catalogue sont des playlists HLS. Dans un navigateur,
`hls.js` lit la playlist et chaque segment avec `fetch` : la règle CORS
s'applique, et le serveur de la chaîne doit répondre
`Access-Control-Allow-Origin`. Sur les 3 483 hôtes distincts que compte le
catalogue, la grande majorité n'envoie pas cet en-tête. VLC, lui, ignore CORS :
c'est pourquoi une chaîne se lit dans VLC et pas sur le site. S'y ajoutent les
serveurs qui refusent un User-Agent de navigateur ou exigent un Referer.

Le relais change qui fait la requête. Le navigateur demande `/flux` au site, le
site va chercher la chaîne, et renvoie la réponse : plus de CORS à négocier, pas
de contenu mixte, un User-Agent et un Referer choisis. Les redirections sont
suivies, les requêtes `Range` sont transmises, et une playlist HLS est réécrite
pour que ses variantes, segments, clés et init maps repassent tous par le
relais. Rien ne passe en mémoire pour la vidéo : les octets sont transmis au fil
de l'eau.

Type : booléen pour l'ouverture du relais, texte pour le User-Agent, choix pour
le Referer.

| Réglage | Type | Valeur par défaut |
| ------- | ---- | ---------------- |
| Relais des flux | booléen | faux |
| User-Agent du relais {#lecture-relais-agent} | texte | `VLC/3.0.20 LibVLC/3.0.20` |
| Referer envoyé au diffuseur {#lecture-relais-referer} | choix | le domaine du flux |

**Ce que le relais répare.** Le blocage CORS, le contenu mixte, l'absence de
Referer, le refus des User-Agent de navigateur.

**Ce qu'il ne répare pas.** Un flux mort, un verrouillage géographique, un jeton
signé expiré, un flux chiffré sans clé, ou un format que le navigateur ne sait
pas décoder (MPEG-TS brut, DASH sans lecteur dédié). Il n'y a aucun transcodage :
le relais transporte, il ne convertit pas. Il ne rend pas davantage licite un
flux qui ne l'était pas.

**Le coût.** Toute la bande passante des chaînes passe désormais par ce serveur.
Un relais ouvert sur un hébergement mutualisé se repère vite : le trafic sortant
monte d'un coup et l'hébergeur facture ou coupe. Ouvrez-le pour vérifier, puis
refermez-le si le volume n'est pas tenu.

**La sécurité.** Le relais n'accepte pas d'adresse libre : soit l'adresse figure
dans le catalogue chargé (`/flux?url=…`), soit elle porte un jeton signé par le
serveur (`/flux?t=…`), ce qui couvre les segments et sous-playlists. Les adresses
privées, de bouclage, de lien local et multicast sont refusées, y compris quand
un nom public résout vers elles ; les redirections sont recontrôlées à chaque
saut. Un relais ouvert à toutes les adresses ferait du serveur un tremplin vers
son propre réseau : c'est le défaut classique, il est ici fermé par
construction. S'ajoutent un plafond de 48 relais simultanés, 2 Mio par playlist,
5 redirections et 15 secondes pour obtenir les en-têtes.

Le relais ne s'ouvre qu'à la console : la commande

```
curl -I "http://127.0.0.1:3000/flux?url=https://exemple.test/live.m3u8"
```

répond `503` tant que le réglage est faux, et `403` pour une adresse absente du
catalogue.

### Ajout d'un film par TMDb, depuis l'onglet Films

Un film peut être ajouté au site par son identifiant TMDb. Le serveur interroge
TMDb, récupère le titre, l'année, la durée, les genres et le résumé, et écrit le
film dans `data/films-ajoutes.json` : le catalogue livré n'est pas modifié, les
deux listes sont fusionnées à la lecture.

Un film ajouté ne prétend aucune licence : il vit du flux du fournisseur, sous
l'attestation de droits. C'est pourquoi l'ajout est refusé tant que
l'attestation n'est pas enregistrée, et pourquoi la fiche affiche une phrase qui
dit d'où vient le flux. Sans réseau, l'ajout échoue avec un message, et rien
n'est inventé.

### Onglet Utilisateurs {#onglet-utilisateurs}

La liste des comptes, le propriétaire en tête. Chaque ligne porte le nom,
l'identifiant, le rôle, l'état, le nombre de permissions effectives et la date de
la dernière connexion. Trois actions : appliquer un rôle, désactiver ou
réactiver, supprimer.

Créer un compte demande un identifiant (3 à 24 caractères parmi a-z, 0-9 et
tiret), un nom, un rôle et un mot de passe d'au moins dix caractères. Le rôle
propriétaire ne se crée pas : c'est le mot de passe de la console. Un compte
désactivé est refusé à la connexion, même avec le bon mot de passe.

### Onglet Permissions {#onglet-permissions}

La matrice des rôles et des permissions, groupée comme dans le tableau du
chapitre 1. Le propriétaire n'y figure pas : sa colonne serait entièrement
cochée et non modifiable. Les deux cases verrouillées sont signalées : le socle
de l'administrateur garde `utilisateurs.ecrire`.

Sans la permission `roles.ecrire`, la matrice s'affiche en lecture seule et
l'enregistrement est refusé par le serveur. Chaque changement est journalisé
sous le code A40.

### Onglet Assistant {#onglet-assistant}

Deux blocs.

**Le diagnostic** lit l'état réel : mots de passe par défaut, licences
manquantes, affiches absentes, sources désactivées, incidents répétés, clés
absentes, lecture tierce ouverte sans attestation, contraste insuffisant,
sections d'accueil qui ne trouveraient rien, plafond de cartes élevé. Chaque
constat porte un code, une gravité, une mesure et, quand elle existe, une
correction sûre applicable en un clic.

**Les demandes en français** passent par un moteur de règles local, exécuté par
le serveur. Il comprend un vocabulaire fini, affiché sous le champ : nombre
d'affiches, densité, thème, accent, largeur, rayon, animations, masquer ou
afficher une section, monter ou descendre une section, plafond de cartes, attente
du lecteur, reprise automatique, ouverture et fermeture de la lecture tierce,
diagnostic, correction générale. Il annonce ce qu'il a compris, montre les
changements, et refuse le reste sans rien inventer. Le dernier lot appliqué
peut être annulé.

Cet assistant n'appelle aucun service extérieur : pas de modèle distant, pas de
clé, pas de réseau. Il ne rédige pas de texte libre et ne touche pas au code du
site.

### Onglet Sources {#onglet-sources}

**Ce qu'il montre.** La liste des sources déclarées avec leur type, leur
famille de contenus, le nombre de contenus rattachés, leur licence, leur
priorité, leur état d'activation et l'état de la sonde (saine, instable, hors
service, jamais sondée) accompagné du taux d'échec sur les dix dernières
mesures. Un encart compte les playlists déclarées en amont, celles qui
fournissent des contenus et celles qui n'en fournissent pas ; la liste des
secondes s'ouvre d'un clic, avec leur libellé et leur adresse.

Un champ de filtre restreint le tableau par nom, identifiant ou pays. Le
tableau affiche 120 sources à la fois : au-delà, c'est le filtre qui donne
accès aux autres.

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

**Ce qu'il montre.** Les dix réglages du site, chacun avec son libellé, son
effet visible et son risque, plus le formulaire de changement de mot de passe.

**Ce qu'il permet.** Modifier un réglage, une valeur à la fois ou plusieurs à la
fois. Chaque valeur est revalidée par le serveur ; une seule valeur refusée
annule tout le lot.

**Ce qu'il refuse.** Une valeur hors bornes, un type qui ne correspond pas, une
clé qui n'existe pas. Un message français dit laquelle est refusée et pourquoi.

**Quand un chiffre paraît faux.** La page publique garde la valeur affichée au
moment du chargement : rechargez-la après un changement.

### Onglet Statistiques {#onglet-statistiques}

Les chiffres d'une famille : total, répartition par source, contenus sans
affiche, sans licence, sans épisode, derniers ajouts. Deux onglets y mènent :
**Animé** et **Films**.

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

Ce chemin vaut sur les deux surfaces : le site, et le port d'administration
lancé par `npm run admin`. Sur ce port, la racine y renvoie ; le site public, lui,
ne cite jamais ce chemin. Un réglage modifié ici prend effet au redémarrage des
deux processus, puisque chacun le relit à son démarrage.

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

### Console sans mot de passe {#reglage-console-sans-mot-de-passe}

Type : booléen. Défaut : faux. Valeurs : vrai ou faux.

Effet visible : à vrai, la console servie par le port d'administration
(`npm run admin`, port 3002) s'ouvre directement, sans formulaire, sans mot de
passe et sans code. Un bandeau « Accès libre » reste affiché en haut de chaque
onglet pour que personne n'oublie dans quel état il travaille. À faux, les
barrières habituelles reviennent.

Risque si mal réglé : sur ce port, quiconque l'atteint gère le catalogue
(sources, import, réglages, journal). À réserver à un poste de confiance, et à
combiner avec `STREAMTV_HOTE=127.0.0.1 npm run admin`, qui refuse les
connexions venant d'ailleurs que de la machine. Le site public, lui, n'est
jamais concerné : même réglage activé, la console servie avec le catalogue
redemande le mot de passe.

### Code de vérification sur un nouvel appareil {#reglage-code-verification}

Type : booléen. Défaut : faux. Valeurs : vrai ou faux.

Effet visible : à faux, **le mot de passe seul** ouvre la console, et le
formulaire n'affiche aucun champ de code. À vrai, un appareil inconnu doit en
plus recopier les six chiffres affichés sur la sortie du serveur, renouvelés
toutes les dix minutes.

Risque si mal réglé : à faux, quiconque connaît le mot de passe entre, depuis
n'importe quelle machine, sans avoir besoin d'être devant le serveur. C'est un
choix de simplicité ; pour une console exposée sur Internet, remettez-le à vrai.
Le mot de passe reste obligatoire dans les deux cas, et le verrou d'appareil
continue d'enregistrer les machines déjà vues.

### Attente maximale du lecteur {#reglage-attente-lecteur}

Type : entier, en secondes. Défaut : 10. Bornes : 5 à 60.

Effet visible : au-delà, le lecteur abandonne et propose trois issues :
réessayer, choisir une autre source, revenir au catalogue. Risque : trop long,
l'écran reste noir ; trop court, une source lente est abandonnée à tort.

## 3 bis. Deux surfaces, un seul état

Le site et l'administration sont le même code, les mêmes données, le même
secret. Deux façons de les atteindre :

| Surface | Commande | Port | Ce qu'elle sert |
| ------- | -------- | ---- | --------------- |
| site | `npm start` | 3000 | le catalogue, l'API, la console à son chemin privé |
| administration | `npm run admin` | 3002 | la console, ses ressources, l'API |

Sur le port d'administration, une page du catalogue (`/chaines`, `/films`…)
répond 404 avec un lien vers la console : ce port ne devient pas une deuxième
adresse publique du site. Les ressources de la console, elles, sont servies
normalement, sinon la page serait nue.

**Ce qui est partagé.** `data/secret.json` porte le verrou d'appareil et le
secret du code de vérification : un appareil déjà reconnu sur un port ne
redemande pas le code sur l'autre, et le code affiché est le même des deux côtés.

**Session dans un cadre.** Quand la console est affichée dans un cadre venu
d'un autre domaine, un navigateur ne renvoie jamais le cookie `SameSite=Strict` :
la session était créée puis ignorée, et le formulaire revenait sans explication.
Le jeton de session est donc aussi renvoyé dans la réponse de connexion, gardé
par la page (`sessionStorage`, et en mémoire si le stockage est refusé), puis
présenté dans un en-tête `authorization: Bearer …`. Le cookie reste posé et
reste prioritaire hors cadre, avec son `HttpOnly`. Le jeton d'appareil suit le
même chemin, dans l'en-tête `x-stv-appareil`. Un stockage refusé ne bloque
jamais la connexion : on perd seulement la reconnexion automatique après
rechargement.

**Ce qui ne l'est pas.** Les sessions vivent en mémoire, une par processus. Se
connecter sur 3002 n'ouvre pas 3000, et réciproquement : c'est voulu, une
session de console ne circule pas d'une surface à l'autre. Fermer un processus
ferme ses sessions.

**Réglages de démarrage.** `PORT_ADMIN` change le port. `STREAMTV_HOTE=127.0.0.1`
limite l'écoute à la machine : à faire dès que le port n'a pas à être joignable
d'ailleurs, et obligatoire si la console n'est pas encore passée au mot de passe
de votre choix. Une seule surface sonde les sources, celle du site ; le port
d'administration ne fait que lire.

## 3 ter. Les clés d'API des films

Les fiches de film peuvent afficher un complément venu de **TMDb** : note de la
communauté, nombre de votes, durée officielle, genres et résumé en français.
Le catalogue reste la source principale ; TMDb ne remplace jamais un titre, un
synopsis ou une affiche, et son bloc porte toujours la mention d'attribution
imposée par TMDb.

**D'où viennent les clés.** Deux origines, la première prioritaire :

1. `TMDB_API_KEY` (et `OMDB_API_KEY`) dans l'environnement : votre clé
   personnelle, créée sur themoviedb.org, qui ne dépend de personne ;
2. `data/cles-api.json`, produit par `npm run cles`, qui rassemble un pool de
   clés publiques via le paquet de développement `freekeys`.

```bash
npm run cles                       # pool public de 12 clés TMDb et 12 OMDb
node scripts/obtenir-cles.mjs --tmdb <votre-clé>   # clé personnelle, sans pool
```

**Ce que valent les clés publiques.** Elles sont codées en dur dans un paquet
npm public : toute la communauté les utilise, leur débit est partagé et elles
peuvent être révoquées sans préavis. Le serveur les essaie donc à la suite : une
clé refusée (401) ou épuisée (429) laisse la place à la suivante. Quand toutes
échouent, la fiche affiche une phrase qui dit quoi faire. Pour un usage sérieux,
créez votre clé TMDb : c'est gratuit et cela prend deux minutes.

**Ce qui est mis en cache.** Chaque fiche est gardée sept jours dans
`data/cache-films.json`, ce qui évite de solliciter une clé partagée à chaque
visite. Le fichier n'est pas versionné.

**Ce qui n'est jamais fait.** Aucune affiche TMDb n'est reprise : ce sont des
visuels promotionnels soumis à leurs propres conditions, alors que les affiches
du catalogue sont sous licence libre. Aucune donnée n'est inventée : sans clé,
sans réseau ou sans réponse exploitable, la fiche du catalogue s'affiche seule
et une ligne explique pourquoi.

**Où voir l'état.** Onglet **Films** de la console : nombre de clés par service,
origine, nombre de fiches en cache et date du dernier relevé. Les valeurs des
clés ne sortent jamais du serveur ; un test le vérifie.

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

Deux filtres s'appliquent à l'import des chaînes. Les flux HTTP sont écartés
parce qu'un navigateur les bloque sur un site servi en HTTPS ; l'option
`--autoriser-http` de `scripts/importer.mjs` les rétablit pour un site servi en
HTTP seulement. Les flux qui exigent un référent ou un agent navigateur sont
écartés dans tous les cas : le navigateur ne peut pas les fournir pour une
vidéo, et ce contournement signale un relais non officiel.

Les 515 playlists de l'index iptv-org remises par le porteur sont déclarées
dans `data/playlists-declarees.txt`, une par ligne, sous la forme
« Libellé: adresse ». L'import lit ce fichier et écrit `data/playlists.json`,
qui donne pour chaque playlist le nombre de chaînes du catalogue qu'elle
contient. Les 243 playlists sans contenu y figurent nommément : elles
correspondent à des territoires dont tous les flux sont en HTTP ou exigent un
référent, ce qui les rend inutilisables dans un navigateur servi en HTTPS.

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
| A13  | Modification de la configuration de lecture, clé comprise   |
| A14  | Modification de l'apparence du site                         |
| A15  | Modification de la composition de l'accueil                 |
| A16  | Ajout ou retrait d'un film venu de TMDb                     |
| A20  | Modification d'un réglage, avec ancienne et nouvelle valeur |
| A30  | Retrait automatique d'un contenu au plafond de signalements |
| A40  | Création ou modification d'un rôle et de ses permissions    |
| A41  | Création, modification ou suppression d'un compte           |
| A50  | Changement appliqué par l'assistant, avec son libellé       |
| A51  | Annulation du dernier changement de l'assistant             |
| A52  | Vidage des incidents remontés par les navigateurs           |

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

Depuis l'onglet **Utilisateurs**, créez un compte : identifiant, nom, rôle, mot
de passe d'au moins dix caractères. Communiquez le mot de passe de vive voix,
jamais par un canal qui le garde. La personne se connecte avec son identifiant
et son mot de passe ; sur un appareil inconnu, le code de vérification reste
demandé si le réglage l'exige.

Pour retirer un accès, désactivez le compte ou supprimez-le : la suppression est
immédiate et journalisée (A41). Le propriétaire, lui, ne se supprime pas ; son
mot de passe se change dans l'onglet **Réglages**.

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

**Le lecteur et la mémoire locale.** Le son, la dernière chaîne regardée et les
douze dernières vivent dans le stockage local du navigateur, sous la clé
`streamtv.zapping.v1`. Vider les données du site les efface : ce n'est pas une
panne. Aucune de ces valeurs ne remonte au serveur, et le journal d'audit n'en
garde aucune trace.

**L'adresse publiée répond 404 : Pages est éteint, pas le site.** Sur un dépôt
de projet, GitHub ne sert rien tant que **Settings → Pages** n'a pas reçu de
source. Choisissez `Deploy from a branch`, la branche
`arena/4716de68-streamtv`, le dossier `/docs`, puis enregistrez. La variante
GitHub Actions demande un fichier de workflow et les droits correspondants ;
`PUBLIER.md` donne les deux chemins.

**La démonstration publiée n'a pas de console.** GitHub Pages sert un dossier de
fichiers : aucun serveur, donc aucune authentification, aucun import, aucun
réglage. Ne cherchez pas `/console-f3a91c` sur l'adresse publiée, elle n'y
existe pas et ne doit pas y exister. La console vit uniquement sur le serveur
Node, chez vous.

**Le service worker retient la dernière version vue.** Il sert le réseau
d'abord, donc une mise à jour se voit au rechargement suivant. Si un poste reste
bloqué sur une version ancienne, videz les données du site : le cache porte le
numéro de version et disparaît à la suivante.

**Le site s'affiche dans un cadre.** La politique de sécurité autorise
`frame-ancestors` pour le site lui-même et pour les domaines de prévisualisation.
Pour héberger le site ailleurs dans une iframe, renseignez `STREAMTV_CADRES`
(par exemple `https://exemple.fr`) avant de démarrer le serveur.

**La liste de zapping est plafonnée à 300 chaînes.** Un filtre très large, par
exemple aucune catégorie et aucun pays, prend les 300 premières du tri
alphabétique. Le panneau l'annonce alors explicitement, avec le total réel du
filtre. Pour zapper dans un ensemble complet, filtrez d'abord par catégorie ou
par pays : la liste reprend ce filtre, et reste entière tant qu'il compte moins
de 300 chaînes.


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

### La clé du fournisseur est visible dans le cadre

Le fournisseur exige sa clé dans l'adresse du cadre. Cette adresse est chargée
par le navigateur du visiteur : la clé y est donc visible, quel que soit le soin
apporté au reste. Le serveur la masque partout ailleurs (état, journal, réponse
d'API) et ne la réécrit jamais en clair, mais il ne peut pas la cacher à un
cadre qui doit la recevoir. C'est une raison de plus pour préférer une clé
restreinte par domaine et de la renouveler si elle fuite.

### Le fournisseur peut imposer un domaine

Une clé liée à un domaine ne fonctionne que depuis ce domaine. Servie depuis un
aperçu, une machine locale ou un autre nom, elle peut renvoyer un cadre vide :
ce n'est pas une panne du site, c'est la restriction du fournisseur. Le panneau
**Lecture et diffusion** le rappelle parmi ses avertissements.

### Deux processus, un seul dossier de données

Le site et le port d'administration sont deux processus. Les réglages, les
comptes, l'apparence, l'accueil et les incidents sont relus quand le fichier
change : une modification faite dans la console s'applique au site sans
redémarrage. En revanche, les sessions de console vivent en mémoire de chaque
processus : un jeton obtenu sur un port ne vaut pas sur l'autre.

### L'assistant ne devine pas

L'assistant applique un vocabulaire fini, affiché dans son onglet. Une phrase
hors vocabulaire est refusée, avec la liste des formulations comprises. Ce n'est
pas une limite à contourner : c'est ce qui permet de savoir exactement ce qui
sera changé avant de l'appliquer. Aucun modèle distant n'est appelé, aucune clé
n'est nécessaire, et rien ne sort du serveur.
