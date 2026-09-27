// Notes courtes : un peu de contexte, jamais une longue intrigue.
export interface NoteDef {
  id: string;
  title: string;
  text: string;
}

export const NOTES: NoteDef[] = [
  { id: 'n_bois_pavillon', title: 'Registre du pavillon', text: 'Saison maigre. Les cerfs descendent encore à la prairie de l’est, mais les loups gris rôdent autour de la réserve. Quelque chose de plus gros a pris la tanière au nord : on n’y va plus.' },
  { id: 'n_bois_braconnier', title: 'Mot du braconnier', text: 'Si tu trouves ma cache, prends le collier. Il m’a porté chance jusqu’à ce que la bête de la tanière me sente.' },
  { id: 'n_marais_cabane', title: 'Carnet de la guérisseuse', text: 'Les lanternes votives tiennent les âmes à distance, un temps seulement. La mousse noire pousse dans l’eau morte ; les champignons pâles, sur les îlots. Ne suivez pas les lueurs vers la chapelle.' },
  { id: 'n_bastion_chapelle', title: 'Ordre de Hrodgar', text: 'Le bastion est à nous. Treuil de la herse dans la caserne, levier des écuries côté cour. Personne n’entre dans la grande salle sans mon ordre.' },
  { id: 'n_carriere_camp', title: 'Journal du contremaître', text: 'On a percé trop profond. Le ver est remonté par les galeries et les bêtes ont changé. J’ai relevé l’échelle de la crête : qu’on la redescende d’en bas si on revient.' },
];

export const NOTE_BY_ID: Record<string, NoteDef> = Object.fromEntries(NOTES.map((n) => [n.id, n]));
