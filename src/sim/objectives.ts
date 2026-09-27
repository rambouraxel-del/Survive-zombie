// Objectifs : courte introduction jouable puis quête principale.
// Les conditions reposent sur des statistiques cumulées ou sur l'état du monde :
// un objectif déjà réalisé avant son activation est validé immédiatement.
// L'introduction peut être passée ; les anciennes sauvegardes ne la refont pas.
import type { Game } from './game';
import { FRAGMENTS, item } from '../data/items';
import { countItem } from './inventory';

export interface Objective {
  id: string;
  title: string;
  hint: string;
  /** progression courte (ligne d'objectif) */
  progress?: (g: Game) => string;
  /** détails (panneau d'objectif) : lignes de liste à cocher */
  checklist?: (g: Game) => { label: string; done: boolean; optional?: boolean }[];
  done: (g: Game) => boolean;
  /** fait partie de l'introduction (peut être passé) */
  intro?: boolean;
}

const c = (g: Game, id: string) => g.stats.collected[id] ?? 0;
const built = (g: Game, id: string) => (g.stats.built[id] ?? 0) > 0;
const inBag = (g: Game, id: string) => countItem(g.player.inv, id);

/** Nourriture disponible dans le sac (nombre de portions). */
export function foodPortions(g: Game): number {
  return g.player.inv.reduce((n, s) => n + (s && item(s.id).food ? s.qty : 0), 0);
}

export function hasWeapon(g: Game): boolean {
  const e = g.player.equip;
  const usable = (s: typeof e.weapon) => !!s && s.dur !== 0 && !!item(s.id).weapon;
  return usable(e.weapon) || usable(e.tool) || g.player.inv.some((s) => usable(s) && item(s!.id).kind === 'weapon');
}

export function defensesCount(g: Game): number {
  let n = 0;
  for (const b of g.world.buildings.values()) if (b.type === 'palisade' || b.type === 'door' || b.type === 'spikes') n++;
  return n;
}

/** Liste indicative de préparation à la nuit (non bloquante). */
export function nightChecklist(g: Game): { label: string; done: boolean; optional?: boolean }[] {
  return [
    { label: 'Une arme en main (lance, hache ou massue)', done: hasWeapon(g) },
    { label: `De quoi manger : ${Math.min(foodPortions(g), 3)}/3 portions`, done: foodPortions(g) >= 3 },
    { label: 'Un feu de camp allumé', done: [...g.world.buildings.values()].some((b) => b.type === 'campfire') },
    { label: `Quelques défenses : ${Math.min(defensesCount(g), 3)}/3 palissades, portes ou pieux`, done: defensesCount(g) >= 3, optional: true },
  ];
}

const startChestOpened = (g: Game) => g.world.objects.some((o) => o.guaranteed === 'start_chest' && o.opened);

export const OBJECTIVES: Objective[] = [
  {
    id: 'o_chest',
    intro: true,
    title: 'Fouiller le coffre du camp',
    hint: 'Le coffre est au bord de la clairière. Approchez-vous : le bouton d’action affiche « Fouiller ». Prenez tout.',
    done: (g) => startChestOpened(g),
  },
  {
    id: 'o_note',
    intro: true,
    title: 'Lire le carnet du bûcheron',
    hint: 'Une feuille traîne près du camp. Elle explique ce qui rôde ici la nuit.',
    done: (g) => g.stats.notesRead.includes('n_camp'),
  },
  {
    id: 'o_gather',
    intro: true,
    title: 'Récolter du bois, de la pierre et des fibres',
    hint: 'Touchez « Action » devant un arbre (Couper), un rocher (Miner) ou des herbes hautes (Arracher). Les ressources proches sont signalées.',
    progress: (g) => `Bois ${Math.min(c(g, 'wood'), 3)}/3 · Pierre ${Math.min(c(g, 'stone'), 3)}/3 · Fibres ${Math.min(c(g, 'fiber'), 2)}/2`,
    checklist: (g) => [
      { label: `Bois récolté : ${Math.min(c(g, 'wood'), 3)}/3 (dans le sac : ${inBag(g, 'wood')})`, done: c(g, 'wood') >= 3 },
      { label: `Pierre récoltée : ${Math.min(c(g, 'stone'), 3)}/3 (dans le sac : ${inBag(g, 'stone')})`, done: c(g, 'stone') >= 3 },
      { label: `Fibres récoltées : ${Math.min(c(g, 'fiber'), 2)}/2 (dans le sac : ${inBag(g, 'fiber')})`, done: c(g, 'fiber') >= 2 },
    ],
    done: (g) => c(g, 'wood') >= 3 && c(g, 'stone') >= 3 && c(g, 'fiber') >= 2,
  },
  {
    id: 'o_tool',
    intro: true,
    title: 'Fabriquer un premier outil',
    hint: 'Menu → Fabriquer : une hache de pierre coupe les arbres deux fois plus vite et sert d’arme ; une lance tient les zombies à distance.',
    // quantités actuelles du sac (pas les quantités déjà récoltées) : pas d'ambiguïté après une dépense
    progress: (g) => {
      const need: [string, number][] = [['wood', 3], ['stone', 3], ['fiber', 2]];
      const miss = need.filter(([id, n]) => inBag(g, id) < n);
      return miss.length ? `Hache : il manque ${miss.map(([id, n]) => `${n - inBag(g, id)} ${item(id).name.toLowerCase()}`).join(', ')}` : 'Hache prête à fabriquer';
    },
    done: (g) => ['stone_axe', 'stone_hammer', 'spear'].some((id) => (g.stats.crafted[id] ?? 0) > 0),
  },
  {
    id: 'o_prepare',
    intro: true,
    title: 'Préparer la première nuit',
    hint: 'Avant le crépuscule : une arme, de quoi manger et un feu de camp (Menu → Construire). Quelques palissades aident, sans être obligatoires.',
    progress: (g) => {
      const [arme, , feu] = nightChecklist(g);
      return `Arme ${arme.done ? '✓' : '·'} · Repas ${Math.min(foodPortions(g), 3)}/3 · Feu ${feu.done ? '✓' : '·'}`;
    },
    checklist: (g) => nightChecklist(g),
    done: (g) => nightChecklist(g).filter((x) => !x.optional).every((x) => x.done),
  },
  {
    id: 'o_base',
    title: 'Construire l’établi et un coffre',
    hint: 'L’établi permet de faire des planches, nécessaires au coffre.',
    progress: (g) => `Établi ${built(g, 'workbench') ? '✓' : '·'} · Coffre ${built(g, 'chest') ? '✓' : '·'}`,
    done: (g) => built(g, 'workbench') && built(g, 'chest'),
  },
  {
    id: 'o_night',
    title: 'Préparer un abri et survivre à une nuit',
    hint: 'Construisez une paillasse (point de réapparition) et quelques palissades, puis tenez jusqu’à l’aube.',
    progress: (g) => `Paillasse ${built(g, 'bed') ? '✓' : '·'} · Nuits ${Math.min(g.stats.nightsSurvived, 1)}/1`,
    checklist: (g) => [...nightChecklist(g), { label: 'Une paillasse (point de réapparition)', done: built(g, 'bed') }],
    done: (g) => built(g, 'bed') && g.stats.nightsSurvived >= 1,
  },
  {
    id: 'o_explore',
    title: 'Explorer un lieu maudit',
    hint: 'Suivez les chemins : ruines du hameau à l’est, cimetière à l’ouest, pierres noires au nord.',
    done: (g) => g.stats.cursedVisited.length > 0,
  },
  {
    id: 'o_fragments',
    title: 'Récupérer les trois fragments du sceau',
    hint: 'Un fragment repose dans chaque lieu maudit. Ils sont bien gardés : venez équipé.',
    progress: (g) => `${g.fragmentsFound()}/3`,
    done: (g) => g.fragmentsFound() >= 3 || g.final.state !== 'locked',
  },
  {
    id: 'o_restore',
    title: 'Restaurer le sanctuaire du Loup',
    hint: 'Le sanctuaire se trouve tout au nord. Déposez les fragments sur la pierre du loup.',
    done: (g) => g.final.state !== 'locked',
  },
  {
    id: 'o_final',
    title: 'Déclencher et repousser l’assaut final',
    hint: 'Préparez des défenses autour du sanctuaire, puis lancez l’assaut depuis la pierre du loup. Trois vagues.',
    progress: (g) => (g.final.state === 'active' ? `Vague ${g.final.wave + 1}/3` : ''),
    done: (g) => g.final.state === 'won',
  },
];

/** Anciens objectifs (sauvegardes v1) remplacés par l'introduction actuelle. */
export const LEGACY_OBJECTIVES = ['o_food', 'o_fire'];

export function evaluateObjectives(g: Game): string[] {
  const newly: string[] = [];
  for (const o of OBJECTIVES) {
    if (g.completed.has(o.id)) continue;
    if (o.done(g)) {
      g.completed.add(o.id);
      newly.push(o.id);
      continue;
    }
    break; // on s'arrête au premier objectif non accompli
  }
  return newly;
}

export function currentObjective(g: Game): Objective | null {
  return OBJECTIVES.find((o) => !g.completed.has(o.id)) ?? null;
}

export function inIntro(g: Game): boolean {
  return !!currentObjective(g)?.intro;
}

/** Passe l'introduction : les étapes restantes sont considérées comme faites. */
export function skipIntro(g: Game): void {
  g.tutorialSkipped = true;
  for (const o of OBJECTIVES) if (o.intro) g.completed.add(o.id);
}

/**
 * Cohérence après chargement : un objectif placé avant un objectif déjà accompli est
 * considéré comme fait (une ancienne partie ne refait pas l'introduction).
 */
export function normalizeObjectives(g: Game): void {
  let lastDone = -1;
  OBJECTIVES.forEach((o, i) => {
    if (g.completed.has(o.id)) lastDone = i;
  });
  // anciens objectifs de v1 : « manger » et « feu » équivalent à la fin de l'introduction
  if (LEGACY_OBJECTIVES.some((id) => g.completed.has(id))) lastDone = Math.max(lastDone, OBJECTIVES.findIndex((o) => o.id === 'o_prepare'));
  for (let i = 0; i <= lastDone; i++) g.completed.add(OBJECTIVES[i].id);
}

export { FRAGMENTS };
