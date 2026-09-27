import { MAP_BASTION } from './bastion';
import { MAP_BOIS } from './bois';
import { MAP_CAMP } from './camp';
import { MAP_CARRIERE } from './carriere';
import { MAP_HOUSE } from './house';
import { MAP_MARAIS } from './marais';
import type { MapDef } from './types';

export const MAPS: Record<string, MapDef> = {
  camp: MAP_CAMP,
  house: MAP_HOUSE,
  bois: MAP_BOIS,
  marais: MAP_MARAIS,
  bastion: MAP_BASTION,
  carriere: MAP_CARRIERE,
};

export function mapDef(id: string): MapDef {
  const d = MAPS[id];
  if (!d) throw new Error(`Carte inconnue : ${id}`);
  return d;
}
