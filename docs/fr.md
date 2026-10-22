# scanservjs

[scanservjs](https://github.com/sbs20/scanservjs) est une interface web qui
numérise avec SANE depuis n'importe quel appareil du réseau. Cette intégration
permet à Gladys de lancer une numérisation, d'un appui sur le tableau de bord
ou depuis une scène, et signale quand un fichier est prêt : depuis Gladys, ou
depuis l'interface web de scanservjs. Où le fichier part ensuite (un dossier
partagé, Paperless-ngx…), c'est l'affaire de scanservjs et de ses pipelines.

Testée contre un vrai scanservjs 3.3 (image Docker `sbs20/scanservjs`) pilotant
le scanner virtuel de SANE (son backend `test`) : numérisations de la vitre et
du chargeur de documents (10 pages), en PDF, JPEG et PNG, réglages refusés,
fichier supprimé, avec et sans authentification. Développée sans le matériel
(aucun scanner physique) et pas encore testée sur un vrai Gladys : vos retours
sont les bienvenus sur
[les issues](https://github.com/guim31/gladys-scanservjs/issues).

## Ce qu'il faut

- Gladys Assistant 5.1.0 ou plus récent.
- scanservjs 3.x (testé avec 3.3.0), son interface web joignable depuis la
  machine de Gladys (port 8080 par défaut), et un scanner qu'il voit.
- Si vous avez déclaré des utilisateurs dans son `config.local.js` : l'un
  d'eux et son mot de passe.

L'intégration lit la liste des fichiers de scanservjs toutes les minutes par
défaut, et ses scanners une fois par heure. Rien ne sort de votre réseau.

## Mise en route

### 1. Vérifier l'adresse de scanservjs

Ouvrez scanservjs dans un navigateur et notez son adresse, par exemple
`http://192.168.1.2:8080`. Faites un premier scan depuis son interface web :
s'il fonctionne là, il fonctionnera depuis Gladys.

### 2. Configurer l'intégration

Dans **Intégrations → scanservjs → Configuration** :

- **Adresse de scanservjs** : l'adresse ci-dessus. Une adresse IP seule
  utilise le port 8080.
- **Nom d'utilisateur** et **Mot de passe** : seulement si scanservjs les
  demande.
- **Préréglage 1, 2 et 3** : ce que fait un appui. Chaque préréglage a un
  **Nom** (le texte de son bouton ; vide, le préréglage est désactivé), une
  **Résolution**, un **Mode** (couleur, niveaux de gris, noir et blanc), un
  **Format** (PDF, PDF avec texte par OCR, JPEG, PNG) et une **Source** : celle
  par défaut du scanner, la vitre, ou le chargeur de documents, qui numérise
  toutes les feuilles qu'il contient (un seul fichier). Par défaut :
  _Document_ (300 dpi, niveaux de gris, PDF) et _Photo_ (300 dpi, couleur,
  JPEG). L'intégration trouve les mots de votre scanner (un mode « Color » peut
  s'appeler « 24bit Color ») ; un noir et blanc qu'il n'a pas devient niveaux
  de gris.
- **Pipeline scanservjs (facultatif)** : le nom exact d'un pipeline de
  scanservjs, l'un des vôtres par exemple (voir _Paperless et dossiers
  partagés_). Vide, l'intégration prend celui du format.
- **Intervalle de rafraîchissement** : en combien de temps un scan fait depuis
  l'interface web de scanservjs est vu (30 secondes, 1 ou 5 minutes). Un scan
  lancé depuis Gladys est vu tout de suite.
- **Autoriser la suppression des fichiers** : désactivé par défaut ; voir
  l'action plus bas.
- **Langue des noms** : la langue des noms des fonctionnalités (fixés à
  l'ajout d'un appareil) et des états.

**Tester la connexion** lit scanservjs et donne sa version, ses scanners et
ses fichiers.

### 3. Ajouter les appareils

Dans l'onglet **Découverte**, ajoutez les scanners et l'appareil
**scanservjs**. Rien n'est créé sans vous. Le widget et les scènes
fonctionnent sans eux, mais une scène ne peut choisir qu'un scanner ajouté.

## Les appareils

Un appareil par scanner de scanservjs :

| Fonctionnalité        | Valeur                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| État                  | Prêt, Numérisation, Dernier scan en échec (jusqu'au prochain réussi), Introuvable (scanservjs ne le liste plus) |
| Numérisation en cours | 1 pendant un scan lancé depuis Gladys                                                                           |

Un appareil **scanservjs** pour les fichiers de son dossier de sortie :

| Fonctionnalité        | Valeur                                                   |
| --------------------- | -------------------------------------------------------- |
| Dernier scan          | Jour et heure du fichier le plus récent                  |
| Dernier fichier       | Son nom                                                  |
| Pages du dernier scan | Comptées dans le PDF (ou le ZIP d'images) ; 0 si inconnu |
| Scans du jour         | Fichiers créés depuis minuit                             |
| Fichiers              | Fichiers du dossier                                      |

Les fichiers ne sont pas sur les scanners : scanservjs ne note pas quel
scanner a produit un fichier.

## Tableau de bord

Le widget **Scanner** affiche les scans du jour, les pages du dernier scan,
l'état du scanner, les cinq derniers fichiers, et un bouton par préréglage
(_Document_, _Photo_…). Un appui numérise : le nom du fichier et ses pages
s'affichent en 20 secondes au plus, ou le widget indique que le scan continue
et se rafraîchit à sa fin. Dans ses réglages, choisissez le scanner (vide :
le premier).

## Scènes

### Déclencheurs

- **Un scan est terminé** : un nouveau fichier dans scanservjs, lancé depuis
  Gladys ou depuis son interface web. Filtres : lancé depuis (Gladys,
  l'interface web) et type de fichier. Variables : le fichier, ses pages, son
  type, sa taille, et pour un scan lancé depuis Gladys son préréglage, son
  pipeline et son scanner.
- **Un scan échoue** : un scan lancé depuis Gladys échoue (bourrage, chargeur
  vide, scanner éteint, réglage refusé). Filtre : les scanners. Variables : le
  scanner, le préréglage et l'erreur de scanservjs.

### Actions

- **Numériser** : numérise avec un préréglage (et un scanner ; vide, le
  premier) et attend le fichier, 100 secondes au plus. Ses résultats : si le
  fichier est prêt, son nom et ses pages. Un scan plus long continue, et
  **Un scan est terminé** se déclenche à sa fin.
- **Supprimer le dernier fichier** : supprime le fichier le plus récent de
  scanservjs, par exemple un scan raté. Inactif sauf si **Autoriser la
  suppression des fichiers** est activé. Son résultat : le nom du fichier
  supprimé.

### Idées de scènes

- Un bouton de l'entrée (interrupteur Zigbee) → **Numériser** avec le
  préréglage _Document_ : le courrier sur la vitre, un appui, il est dans
  Paperless.
- **Un scan est terminé** → envoyer un message « Numérisé : fichier (pages) »
  avec les variables du déclencheur.
- **Un scan échoue** → prévenir avec l'erreur : le chargeur était vide.

## Paperless et dossiers partagés

L'intégration lance les scans ; scanservjs fabrique et envoie les fichiers.
Pour qu'ils arrivent dans Paperless-ngx, faites pointer le dossier de sortie de
scanservjs (`/var/lib/scanservjs/output` dans son conteneur) sur le dossier de
consommation de Paperless, ou déclarez dans son `config.local.js` un pipeline
dont l'`afterAction` y déplace le fichier (voir la documentation de
scanservjs, « config.local.js »), puis tapez son nom dans **Pipeline
scanservjs** d'un préréglage.

## Dépannage

- **« scanservjs ne répond pas »** : vérifiez l'adresse et le port depuis la
  machine de Gladys.
- **« nom d'utilisateur ou mot de passe manquant ou refusé par scanservjs »** :
  scanservjs a des utilisateurs dans son `config.local.js` : saisissez l'un
  d'eux et son mot de passe.
- **« aucun scanservjs à cette adresse »** : l'adresse pointe vers autre
  chose.
- **« scanservjs ne voit aucun scanner »** : vérifiez le scanner dans son
  interface web, puis **Rechercher** dans l'onglet Découverte (les scanners
  sont relus).
- **« ce scanner n'a pas de chargeur de documents »** : le préréglage demande
  le chargeur ; choisissez la vitre ou la source par défaut du scanner.
- **Un scan échoue avec l'erreur de `scanimage`** : le même scan échoue
  sûrement depuis l'interface web de scanservjs ; ses logs en disent plus.
- Pour en voir plus, mettez la variable `LOG_LEVEL` de l'intégration à
  `debug`.

## Limites

- Une instance de scanservjs par intégration, un scan lancé depuis Gladys à la
  fois. scanservjs lui-même n'empêche pas un scan de son interface web de
  tourner en même temps qu'un scan de Gladys : évitez-le.
- Un scan lancé depuis l'interface web est vu quand son fichier apparaît, à la
  lecture suivante : son échec, son préréglage et son scanner ne sont pas
  connus.
- Les pages sont comptées dans les fichiers PDF et les archives ZIP ; un
  fichier texte de l'OCR compte pour une page.
- Développée sans le matériel : vos retours sont les bienvenus (un scanner
  virtuel de SANE seulement). Sans lien avec scanservjs ni SANE. Signalez un
  problème ou une idée sur
  [les issues](https://github.com/guim31/gladys-scanservjs/issues).
