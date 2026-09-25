// Objectifs : tutoriel intégré puis quête principale.
// Les conditions reposent sur des statistiques cumulées depuis le début :
// un objectif déjà réalisé avant son activation est validé immédiatement.
import type { Game } from './game';
import { FRAGMENTS } from '../data/items';

export interface Objective {
  id: string;
  title: string;
  hint: string;
  progress?: (g: Game) => string;
  done: (g: Game) => boolean;
}

const c = (g: Game, id: string) => g.stats.collected[id] ?? 0;
const built = (g: Game, id: string) => (g.stats.built[id] ?? 0) > 0;

export const OBJECTIVES: Objective[] = [
  {
    id: 'o_gather',
    title: 'Récolter du bois, de la pierre et des fibres',
    hint: 'Approchez-vous d’un arbre, d’un rocher ou d’herbes hautes et appuyez sur le bouton d’action.',
    progress: (g) => `Bois ${Math.min(c(g, 'wood'), 3)}/3 · Pierre ${Math.min(c(g, 'stone'), 3)}/3 · Fibres ${Math.min(c(g, 'fiber'), 2)}/2`,
    done: (g) => c(g, 'wood') >= 3 && c(g, 'stone') >= 3 && c(g, 'fiber') >= 2,
  },
  {
    id: 'o_tool',
    title: 'Fabriquer un outil',
    hint: 'Ouvrez « Fabriquer » et créez une hache de pierre, une masse ou une lance.',
    done: (g) => ['stone_axe', 'stone_hammer', 'spear'].some((id) => (g.stats.crafted[id] ?? 0) > 0),
  },
  {
    id: 'o_food',
    title: 'Trouver de la nourriture et manger',
    hint: 'Cueillez des myrtilles ou des morilles, puis touchez-les dans la barre rapide pour les manger.',
    done: (g) => g.stats.ate > 0,
  },
  {
    id: 'o_fire',
    title: 'Installer un feu de camp',
    hint: 'Ouvrez « Construire », choisissez le feu de camp, placez-le puis validez.',
    done: (g) => built(g, 'campfire'),
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

export { FRAGMENTS };
