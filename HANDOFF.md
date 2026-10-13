# HANDOFF – Mon CAP Logistique

Prompt de reprise pour une nouvelle session (Claude ou développeur). À coller en début de session.
Dernière mise à jour : 2026-10-13.

```
Tu reprends le projet « Mon CAP Logistique », un site de révision pour des élèves de CAP Opérateur logistique
(public : adolescents qui lisent peu, avec difficultés de lecture ou d'attention). Réponds en français, de façon
courte et concrète : une action à la fois, listes courtes.

## Dépôt et déploiement
- Dépôt : GitHub taoufikbo/VercelCaplogistique, branche main (cloné en local).
- Un seul fichier index.html (HTML+CSS+JS, ~265 Ko, sans dépendance : pas de lib ni de police externe).
- Un push sur main redéploie Vercel automatiquement.
- Sites : https://vercelcaplogistique.vercel.app et https://www.moncaplogistique.fr (domaine OVH, DNS OK).
- Ancienne version intacte sur /legacy/ (copie de index.backup.html) : ne pas la modifier.
- Le propriétaire veut qu'on pousse directement sur main, sans branche.
- HANDOFF.md est exclu du déploiement par .vercelignore ; il reste lisible sur GitHub (dépôt public) :
  n'y mettre ni secret, ni donnée personnelle.

## Pièges Git / réseau
- Le réseau de l'utilisateur impose parfois un proxy qui échoue (erreur 407). Utiliser :
  git -c http.proxy= -c https.proxy= fetch|pull|push
- Le propriétaire (compte taoufikbo) ou une autre session pousse aussi sur main : faire `git fetch`, lire
  `git log origin/main`, puis rebase/merge AVANT de coder et avant chaque push. Ne jamais forcer.
  Une branche refonte-pedago existe.
- Pas de Node ni de Playwright installés sur la machine : les tests du dossier tests/ ne s'y exécutent pas.

## Méthode de test (à recréer, le dossier temporaire de session est effacé)
Chrome headless : "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu
--virtual-time-budget=200000 --dump-dom. Principe : copier index.html, y injecter un script qui s'exécute 700 ms
après le chargement, écrire les résultats dans un <pre id=res>, lire le DOM. Les captures en 390 px se font en
plaçant la page dans une iframe de 390 px (Chrome refuse les fenêtres < 500 px).
Contrôle de base : jouer les 89 jeux en répondant juste (pick(q.ok) ; pour les questions tapées, q.type :
mettre q.answers[0] dans #ti puis checkTyped()), ouvrir les 124 fiches, zéro erreur console.

## Architecture (index.html)
- État S en localStorage, clé "mouad-cap-ol-v1" : NE PAS CHANGER (les étoiles des élèves en dépendent). save().
- Données : BLOCS (9 matières) > seqs (37 cours) > slides (fiches) et games > qs (questions).
  Question : icon, text, opts, ok, why (+ hint, story, hear…). Les ids de jeux doivent rester stables.
- Écrans : home, openBloc, openSeq, fiche, play/showQ/pick/feedback/finish, refView, glossaire,
  recompenses, carte.
- Menu rond générique : ringHtml(cfg) (accueil, matière, cours).
- Voix : say/spk. Rythme calme : calm(), pace(), hold().
- Travail du propriétaire (commits du 11/10) : mission du jour, mémoire par question (QIDX, recordQ, Leitner),
  tickets et récompenses réelles validées par un adulte (S.rw), bonus bowling/cinéma, régulation
  (reg, cur.lean/assist). Ne pas casser ; ses tests utilisent QIDX sans compteurs figés.
- Ajouts de la session précédente : indices limités à 3 par jeu (armHint, hintsLeft) ; jeu « J'écris » par cours
  (genEcrire : recopier, dictée, compléter, calculer ; questions q.type='type', showTyped/checkTyped) ;
  bonus tirs au but et mémo (miniPen, miniMemo, branchés dans S.rw.bonus) ; récap « Je retiens » en fin de jeu
  (recapHtml) ; 35 schémas SVG générés (SCH, buildSchema) ; vue « Carte » en graphe (carteHtml, gLayout,
  GT/GS ; interrupteur Cercle/Carte sur l'accueil, S.view) ; glossaire (26 termes) ; humeur/conseil/badges ;
  réglages d'affichage (bouton Aa).
- Leçon apprise : les collisions de noms de classes CSS ont déjà cassé deux écrans (.aim, .mb).
  Avant d'ajouter une classe, vérifier avec grep qu'elle n'existe pas.

## Contraintes de conception
Peu de texte, pictogrammes, voix 🔊 sur chaque texte, boutons ≥ 44 px, couleurs douces, pas de chronomètre ni
de classement (rythme calme), récompenses sobres. Le drapeau britannique est dessiné en SVG (constante UK)
car Windows n'affiche pas les emojis drapeaux ; éviter 🇫🇷 et 🇪🇺 en emoji.

## Limites connues, non testées
- Rien n'a été testé sur un vrai téléphone (clavier mobile, pincement, survol souris).
- Les textes (fiches, glossaire, schémas, objectifs) ont été rédigés avec l'aide d'une IA et n'ont pas été
  relus par un enseignant.
- Le domaine moncaplogistique.fr peut être bloqué par certains réseaux d'entreprise (domaine récent) ;
  l'adresse vercelcaplogistique.vercel.app sert de secours.

## Prochaine étape proposée (non commencée)
Prototyper « Remets les étapes dans l'ordre » en les touchant (données déjà présentes dans 9 jeux dont les
réponses sont « Étape n : X »), puis un jeu de construction de palette, puis un calculateur visuel.
Backlog plus lointain : exercices à manipuler, comptes élèves + synchronisation, pipeline e-mail → IA →
brouillon validé par l'enseignant (nécessite d'abord de sortir le contenu de index.html vers des fichiers JSON),
tableau de suivi enseignant.

Commence par : git fetch, lire git log, vérifier que le site répond, puis demande quelle étape faire.
```
