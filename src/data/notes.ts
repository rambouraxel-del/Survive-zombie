// Notes courtes racontant le désastre. Elles sont placées par la génération du monde.
export interface NoteDef {
  id: string;
  title: string;
  text: string;
  zone: 'start' | 'forest' | 'hamlet' | 'cemetery' | 'corrupt' | 'sanctuary';
}

export const NOTES: NoteDef[] = [
  { id: 'n_camp', zone: 'start', title: 'Carnet du bûcheron', text: 'Nous avons dressé ce camp à l’automne. Le bois ici est bon, les baies abondantes. Les morts ne marchaient pas encore. Si tu lis ceci, rallume le feu avant la nuit.' },
  { id: 'n_road', zone: 'forest', title: 'Lettre froissée', text: 'Le charroi n’arrivera pas. Les bêtes ont fui, les hommes aussi. On dit que le sceau du sanctuaire s’est brisé en trois, et que chaque éclat a été emporté par la peur.' },
  { id: 'n_hunter', zone: 'forest', title: 'Conseil de chasseur', text: 'Un piège posé sur l’herbe prend lièvres et perdrix. Crue, la viande nourrit peu : fais-la rôtir. Mêlée à des morilles et des myrtilles, elle fait un ragoût qui remet sur pied.' },
  { id: 'n_hamlet', zone: 'hamlet', title: 'Registre du hameau', text: 'Le prévôt a caché un éclat du sceau dans la vieille forge, derrière les tonneaux. Les nôtres sont revenus la nuit suivante, sans leurs yeux. Barricadez les portes.' },
  { id: 'n_smith', zone: 'hamlet', title: 'Note du forgeron', text: 'Deux mesures de minerai pour une de charbon. Le charbon de bois fait l’affaire si les filons sont trop loin. Le fer seul tient tête aux grosses brutes.' },
  { id: 'n_cemetery', zone: 'cemetery', title: 'Prière du fossoyeur', text: 'Les tombes se sont ouvertes par le dessous. Le second éclat repose dans la crypte, sous la pierre du loup. Que Dieu garde ceux qui iront le chercher.' },
  { id: 'n_corrupt', zone: 'corrupt', title: 'Page arrachée', text: 'Les arbres ont perdu leurs feuilles en une nuit. Le troisième éclat pulse au milieu des pierres noires. Plus on s’en approche, plus ils sont nombreux.' },
  { id: 'n_sanctuary', zone: 'sanctuary', title: 'Inscription du sanctuaire', text: 'Réunis les trois éclats sur la pierre du loup. Quand le sceau sera entier, ils viendront tous. Tiens jusqu’à l’aube de la dernière vague, et la forêt sera libre.' },
];

export const NOTE_BY_ID: Record<string, NoteDef> = Object.fromEntries(NOTES.map((n) => [n.id, n]));
