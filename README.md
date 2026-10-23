# Kanytrade

Terminal web/PWA Next.js pour suivre des cotations de marché et préparer une analyse. L’application n’est pas connectée à un compte de courtage et ne transmet aucun ordre.

## Lancer le projet

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Sources de marché

- Crypto spot USD : cotations et chandeliers publics Kraken pour les paires intégrées.
- Catalogue mondial et cotations à la demande : actions, forex, matières premières, indices, crypto, ETF et fonds via Twelve Data, selon la couverture de chaque place et le forfait associé au symbole.
- Copier `.env.example` vers `.env.local`, puis renseigner `TWELVE_DATA_API_KEY` avec une clé obtenue auprès de [Twelve Data](https://twelvedata.com/). Cette clé est lue uniquement côté serveur ; ne pas lui ajouter le préfixe `NEXT_PUBLIC_` et ne jamais la committer.
- Sans clé ou sans accès fournisseur, l’interface affiche clairement l’indisponibilité au lieu d’un cours ou d’un instrument de remplacement.
- Les listes de catalogues sont mises en cache cinq minutes et les fiches de cotation une minute. Les quotas d’un forfait gratuit ne permettent pas une diffusion temps réel continue de tout l’univers mondial ; les cotations ne sont demandées que pour un instrument ouvert.
- Le fil d’actualités utilise Google News RSS, mis en cache dix minutes. Seuls les titres, éditeurs et liens d’origine sont affichés ; le contenu des articles n’est pas republié.
- Les cotations Kraken déjà intégrées sont actualisées toutes les 15 secondes. Les historiques dépendent des limites et de l’offre du fournisseur.

Les horodatages sont affichés en UTC. Les fournisseurs peuvent appliquer des délais, limites, droits de redistribution et tarifs selon le compte et le symbole. Vérifier ces conditions avant tout déploiement public.

## Mobile

Le manifeste Next.js permet d’installer l’application comme PWA depuis un navigateur compatible, notamment « Ajouter à l’écran d’accueil » sur iOS ou « Installer » dans Chrome. Cela fournit une expérience web autonome ; ce n’est pas un binaire iOS/Android distribué dans les stores.

## Sécurité et périmètre

L’API de données est en lecture seule. Aucune API de compte Kraken ni permission d’ordre n’est utilisée. Le solde du calculateur doit être saisi par l’utilisateur ; les notes du journal restent dans le stockage local du navigateur et ne constituent pas une comptabilité de courtage.

L’application fournit des outils d’organisation et de calcul, pas un conseil financier. Les prix peuvent être retardés ou indisponibles ; toute opération comporte un risque de perte.

## Vérifications

```bash
npm run lint
npm run build
```
