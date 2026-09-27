// Carte « house » — dessinée en ASCII (légende : src/maps/types.ts ; brouillon : tools/maps/draw_maps.py).
import type { MapDef } from './types';

export const MAP_HOUSE: MapDef = {
  id: 'house',
  name: 'La maison',
  palette: 'summer',
  base: '_',
  wall: 'brick',
  light: { darkness: 0.28, color: [40, 20, 10] },
  viewTiles: 8.5,
  music: 'music_camp',
  trees: [],
  deadTrees: [],
  legend: {
    X: { kind: 'door', to: 'camp', ground: '_' },
    P: { kind: 'start' },
    B: { kind: 'building', type: 'bed' },
    H: { kind: 'building', type: 'hearth' },
    C: { kind: 'building', type: 'chest' },
  },
  areas: [
    { name: 'La maison', x: 0, y: 0, w: 12, h: 9 },
  ],
  rows: [
    '############',
    '############',
    '%B____H___C%',
    '%__________%',
    '%__________%',
    '%__________%',
    '%____P_____%',
    '%__________%',
    '%%%%%XX%%%%%',
  ],
};
