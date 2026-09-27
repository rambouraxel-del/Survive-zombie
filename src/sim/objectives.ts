// Objectifs et journal : courte ligne principale (guidage du premier lancement puis
// progression des régions) et quelques objectifs facultatifs. Pas de longue intrigue.
// Les objectifs ont des emplacements prévus pour de futurs dialogues et compagnons.
import type { Game } from './game';
import { countItem } from './inventory';
import { item } from '../data/items';

export interface Objective {
  id: string;
  title: string;
  hint: string;
  progress?: (g: Game) => string;
  checklist?: (g: Game) => { label: string; done: boolean; optional?: boolean }[];
  done: (g: Game) => boolean;
  /** guidage du premier lancement (peut être passé) */
  intro?: boolean;
  /** objectif facultatif (hors ligne principale) */
  optional?: boolean;
  /** emplacement réservé : dialogue à déclencher (futur) */
  dialogue?: string;
  /** emplacement réservé : compagnon associé (futur) */
  companion?: string;
}

const craftedGear = (g: Game) => Object.entries(g.stats.crafted).some(([id, n]) => n > 0 && ['weapon', 'armor', 'accessory'].includes(item(id).kind));

export const OBJECTIVES: Objective[] = [
  {
    id: 'o_weapon', intro: true, title: 'Choisir une arme au râtelier',
    hint: 'Le râtelier est à gauche du feu. Sept familles : dague, épée, masse, arc, arbalète, magie élémentaire, magie occulte. Vous pourrez fabriquer les autres et en changer à tout moment.',
    done: (g) => !!g.starter,
  },
  {
    id: 'o_gear', intro: true, title: 'Prendre les provisions du coffre',
    hint: 'Le coffre près de la maison contient des outils (hache, masse) et des vivres. Les outils servent depuis le sac : inutile de les tenir en main.',
    done: (g) => ['stone_axe', 'stone_hammer', 'bread', 'bandage'].some((id) => countItem(g.player.inv, id) > 0),
  },
  {
    id: 'o_try', intro: true, title: 'Essayer les commandes sur le mannequin',
    hint: 'Frappez le mannequin et utilisez une compétence (boutons ronds à côté de l’attaque). Le mannequin ne donne ni maîtrise ni charge d’ultime.',
    checklist: (g) => [
      { label: `Frapper le mannequin : ${Math.min(g.stats.dummyHits, 3)}/3`, done: g.stats.dummyHits >= 3 },
      { label: 'Utiliser une compétence', done: g.stats.skillsUsed >= 1 },
    ],
    progress: (g) => `Coups ${Math.min(g.stats.dummyHits, 3)}/3 · compétence ${g.stats.skillsUsed ? '✓' : '·'}`,
    done: (g) => g.stats.dummyHits >= 3 && g.stats.skillsUsed >= 1,
  },
  {
    id: 'o_outing', title: 'Partir au Bois des chasseurs',
    hint: 'Le carrefour des expéditions est au sud du camp : touchez « Partir ». Le Bois est une région de ressources, en plein jour.',
    done: (g) => g.stats.outings >= 1,
  },
  {
    id: 'o_return', title: 'Récolter, puis rentrer au camp',
    hint: 'Coupez du bois, cassez des pierres, chassez. Pour mettre votre récolte en sûreté, rentrez par le poteau de l’arrivée ou un point de halte. Une chute coûte 20 % de la récolte de la sortie.',
    progress: (g) => `Bois ${Math.min(g.stats.collected.wood ?? 0, 5)}/5 · retour ${g.flags.has('first_return') ? '✓' : '·'}`,
    done: (g) => g.flags.has('first_return') && (g.stats.collected.wood ?? 0) >= 5,
  },
  {
    id: 'o_upgrade', title: 'Améliorer votre équipement',
    hint: 'Fabriquez une arme, une protection ou un accessoire (établi, forge). Au camp, la fabrication puise aussi dans vos coffres.',
    done: (g) => craftedGear(g) || (g.stats.built.forge ?? 0) > 0,
  },
  {
    id: 'o_bastion', title: 'Explorer le Bastion abandonné',
    hint: 'Première expédition principale : allumez les points de halte, cherchez comment ouvrir la herse de la cour.',
    done: (g) => (g.levels.bastion?.status ?? 'new') !== 'new',
  },
  {
    id: 'o_chief', title: 'Vaincre le chef des mercenaires',
    hint: 'Il attend dans la grande salle du donjon. Ses coups sont annoncés : esquivez, puis frappez pendant sa récupération.',
    done: (g) => g.flags.has('boss_chief'),
  },
  {
    id: 'o_dungeon1', title: 'Réussir le premier palier du Bastion hanté',
    hint: 'Le donjon se choisit au carrefour, palier par palier. Une défaite ne change jamais le palier.',
    done: (g) => (g.dungeons.d_bastion?.cleared.length ?? 0) > 0,
  },
  {
    id: 'o_worm', title: 'Vaincre la créature de la carrière',
    hint: 'L’Ancienne carrière s’est ouverte. La créature dort au fond des galeries : un cercle au sol annonce son retour.',
    done: (g) => g.flags.has('boss_worm'),
  },
  {
    id: 'o_dungeon2', title: 'Réussir le premier palier des Profondeurs',
    hint: 'Le second donjon reprend la carrière, plus dangereuse. Les paliers supérieurs donnent de meilleurs matériaux.',
    done: (g) => (g.dungeons.d_carriere?.cleared.length ?? 0) > 0,
  },
  // ---- facultatifs
  { id: 'x_marais', optional: true, title: 'Explorer le Marais corrompu', hint: 'Matériaux d’enchantement et de potions. Les lanternes votives offrent un répit.', done: (g) => (g.stats.outings > 0 && g.levels.marais?.visited) === true },
  { id: 'x_predator', optional: true, title: 'Vaincre le Prédateur du Bois', hint: 'Dans la tanière, au nord-est du Bois des chasseurs. Ses crocs servent aux armes de rang III.', done: (g) => g.flags.has('boss_predator') },
  { id: 'x_enchant', optional: true, title: 'Graver un premier enchantement', hint: 'Construisez l’autel d’enchantement au camp.', done: (g) => [g.player.equip.weapon, g.player.equip.armor, g.player.equip.accessory, ...g.player.inv].some((s) => !!s?.ench) },
  { id: 'x_mastery', optional: true, title: 'Atteindre la maîtrise 5 dans une famille', hint: 'La maîtrise vient des dégâts réellement infligés aux ennemis.', done: (g) => Object.values(g.mastery).some((xp) => xp >= 1350) },
];

export function evaluateObjectives(g: Game): string[] {
  const newly: string[] = [];
  for (const o of OBJECTIVES) {
    if (o.optional || g.completed.has(o.id)) continue;
    if (o.done(g)) {
      g.completed.add(o.id);
      newly.push(o.id);
      continue;
    }
    break; // ligne principale : on s'arrête au premier objectif non accompli
  }
  for (const o of OBJECTIVES) {
    if (!o.optional || g.completed.has(o.id)) continue;
    if (o.done(g)) {
      g.completed.add(o.id);
      newly.push(o.id);
    }
  }
  return newly;
}

export function currentObjective(g: Game): Objective | null {
  return OBJECTIVES.find((o) => !o.optional && !g.completed.has(o.id)) ?? null;
}

export function inIntro(g: Game): boolean {
  return !!currentObjective(g)?.intro;
}

/** Passe le guidage : les étapes restantes sont considérées comme faites. */
export function skipIntro(g: Game): void {
  g.tutorialSkipped = true;
  for (const o of OBJECTIVES) if (o.intro) g.completed.add(o.id);
  if (!g.starter) g.flags.add('skip_starter');
}

/** Après chargement : un objectif placé avant un objectif accompli est considéré comme fait. */
export function normalizeObjectives(g: Game): void {
  let lastDone = -1;
  OBJECTIVES.forEach((o, i) => {
    if (!o.optional && g.completed.has(o.id)) lastDone = i;
  });
  for (let i = 0; i <= lastDone; i++) if (!OBJECTIVES[i].optional) g.completed.add(OBJECTIVES[i].id);
}
