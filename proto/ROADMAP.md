# Roadmap — 30h restantes

> État actuel : formulaire KPI + analyse Claude + dashboard résultats + portfolio + comparaison + historique.
> Objectif : outil d'analyse de prototype qui couvre le workflow complet Voodoo de la soumission à la décision.

---

## Ce que la table de prototype permet

### Gameplay metrics
D1/D7 permettent de la prédiction — D7 est fortement corrélé à D1 par genre, les coefficients sont dans la littérature publique GameAnalytics/Sensor Tower. Sessions/day × duration donne un proxy LTV sans monétisation. Ce que Claude apporte sur ces données : identifier des patterns non-linéaires ("D1 fort + D7 faible = problème de profondeur, pas d'acquisition — la solution n'est pas dans les créatifs UA").

### Marketing metrics
CPI seul est insuffisant. Ce qui compte : IPM (installs per mille impressions) et ROAS J7. Avec CPI + D7 on peut calculer un break-even réel et une projection LTV. C'est là que la BI devient concrète pour un publisher.

### Features extraites (vision / NLP)
Le champ le plus sous-utilisé. Depuis une vidéo de gameplay, Claude peut extraire des signaux structurés : fréquence de récompense visuelle (nb/minute), nombre d'éléments UI simultanés, présence implicite de tutorial, tempo du core loop. Ces features sont des prédicteurs prouvés du D1. C'est là que l'IA fait quelque chose qu'un humain ne peut pas faire à l'échelle de 2000 jeux/an.

### Human scores
Le gold label. Même 50 analyses historiques avec la décision finale et le résultat réel permettent de montrer la corrélation avec le score IA — validation externe qui transforme un prototype de démo en outil crédible.

---

## Stack technique

### Changements par rapport à l'existant

**Tool use (JSON schema enforcement)**
Remplacer le parsing de JSON depuis du texte par le tool use de Claude pour forcer le schéma de sortie. Zéro parsing fragile, erreurs structurées.

```js
tools: [{
  name: "submit_analysis",
  description: "Submit the prototype analysis result",
  input_schema: {
    type: "object",
    properties: {
      score: { type: "integer", minimum: 0, maximum: 100 },
      verdict: { type: "string", enum: ["PUBLISH", "ITERATE", "KILL"] },
      // ...
    }
  }
}]
```

**Streaming**
`stream: true` sur l'appel API. Le résultat s'affiche progressivement — la page n'est plus un spinner de 4 secondes mais une analyse qui se construit en direct. Effet dramatique pour la démo, et techniquement plus honnête sur la latence réelle.

**Prompt caching**
Le system prompt avec la base de jeux comparables va peser 3-4k tokens. Cacher le `system` block économise 90% du coût et réduit la latence de 40%.

```js
system: [{
  type: "text",
  text: SYSTEM_PROMPT,
  cache_control: { type: "ephemeral" }
}]
```

**Extended thinking (verdict final uniquement)**
`claude-opus-4-7` avec un budget thinking de 2000 tokens sur la décision finale. Le raisonnement intermédiaire est visible dans l'UI — démo technique impressionnante, qualité du verdict plus élevée.

**Dexie.js**
Remplacer localStorage JSON par IndexedDB via Dexie. Permet de stocker des vidéos et images sans la limite 5MB, et de faire des vraies queries (filtrer par genre, trier par score, etc.).

---

## Les 6 chantiers par priorité

### 1. Analyse vidéo (8h) — priorité absolue

C'est la différence entre "joli formulaire" et "outil qui fait quelque chose d'impossible manuellement".

**Implémentation :**
- Upload MP4/MOV dans le browser
- Extraction de frames via Canvas API (1 frame toutes les 3s, max 8 frames)
- Envoi multimodal à Claude : frames + prompt spécifique "analyse la mécanique de jeu"

**Nouveaux champs extraits dans `visual_analysis` :**
```typescript
{
  reward_frequency: number,       // récompenses visuelles par minute
  ui_element_count: number,       // nb éléments sur le premier écran
  tutorial_type: "implicit" | "explicit" | "none",
  loop_tempo: "slow" | "medium" | "fast",
  first_action_clarity: number,   // 0-100
}
```

**Pitch :** "On analyse 2000 vidéos de gameplay en 3 minutes. Un manager en analyserait 3 par jour."

---

### 2. Base de jeux comparables (4h)

Un JSON de 60 jeux avec métriques réelles (données publiques — AppsFlyer State of Gaming, GameAnalytics benchmarks, interviews publiques de studios).

**Structure :**
```js
{
  name: "Ball Sort Puzzle",
  studio: "IEC Global",
  genre: "hyper_casual",
  launch_year: 2020,
  d1: 41, d7: 18, cpi: 0.18,
  peak_rank: 1,
  mechanic_tags: ["sort", "color", "tube"],
  outcome: "published",
  notes: "Lancé avec D1=41%, scalé au #1 mondial en 3 semaines après baisse CPI à $0.12 avec fan creatives"
}
```

Claude reçoit cette base dans le system prompt caché. Il peut dire : "Ton D1 de 42% dépasse le D1 de lancement de Ball Sort Puzzle (41%) qui a atteint le top 1 mondial." Spécifique, crédible, actionnable.

---

### 3. Moteur financier (3h)

Ce que Voodoo regarde vraiment : est-ce que je peux être profitable en UA ?

- **D7 prédit** depuis D1 : régression linéaire par genre (coefficients hardcodés depuis données publiques)
- **LTV J30 estimé** : `D1 × D7_prédit × 0.4 × ARPDAU_genre`
- **Break-even** : nb d'installs pour couvrir le budget UA à ce CPI
- **Probabilité de succès** : score calibré sur la base de comparables

Nouvelle carte "Financial Projection" dans le dashboard avec un graphique LTV vs CPI et un chiffre clé : "Payback estimé : J14 — viable pour UA scaling."

**Nouveaux champs dans le résultat :**
```typescript
financial_projection: {
  d7_predicted: number,
  d7_confidence: "HIGH" | "MEDIUM" | "LOW",
  ltv_estimate: { low: number, mid: number, high: number },
  breakeven_days: number,
  ua_viable: boolean,
  payback_scenario: string,
}
```

---

### 4. Analyse batch CSV (4h)

Upload d'un CSV de prototypes (une ligne = un jeu, colonnes = KPIs). Appels Claude en parallèle (Promise.all avec rate limiting à 3 simultanés). Résultat : tableau trié par score, exportable.

**Format CSV attendu :**
```
name,genre,retentionD1,retentionD7,cpi,sessionsPerDay,sessionDuration,testDays,platform
Marble Sort,hyper_casual,42,19,0.22,5.2,6,10,both
```

Feature clé pour le pitch : "On peut traiter ta queue de 50 soumissions hebdomadaires en une nuit sans intervention humaine."

---

### 5. Qualité du prompt (3h)

La différence entre une analyse générique et une analyse Voodoo-quality est dans le prompt.

- 3-4 exemples few-shot : prototype → analyse attendue (vrais noms de jeux)
- Rôle system précis : contexte Voodoo, accès historique 1200 jeux, critères de publication
- Instructions différenciées selon la donnée disponible (video only / KPIs only / full)
- Ton direct, chiffré, sans hedge — le style d'un publishing manager senior

---

### 6. Polish et démo (8h restantes)

- Streaming visible dans l'UI : les sections du résultat apparaissent une par une au fur et à mesure de la génération
- Export PDF : snapshot du dashboard complet
- Responsive mobile
- Correction edge cases
- Préparation des deux cas démo : PUBLISH dramatique + KILL évident
- Deploy Vercel

---

## Ordre d'exécution recommandé

1. Analyse vidéo — change la nature du produit
2. Base de comparables — améliore toutes les autres features
3. Moteur financier — rend la BI concrète
4. Streaming — polish technique à fort impact visuel
5. Prompt quality — amélioration continue
6. Batch CSV — feature de scale
7. Polish + démo

---

## Table de données cible

```
Prototype_ID
  Gameplay metrics    D1, D7, D30, sessions/day, session duration, test days
  Marketing metrics   CPI, IPM, CTR, ROAS J7, platform
  Features extraites  genre détecté, visual complexity, reward frequency,
                      ui_element_count, tutorial_type, loop_tempo,
                      first_action_clarity, art_style, comparable_hits
  Metadata            genre déclaré, platform, studio, test date, build version
  Human scores        manager score, decision made, outcome (published / revenue)
  AI output           score, verdict, confidence, dimensions, financial_projection
```

---

*VoodooHack 2026 — Track 3 AI for Business Intelligence*
