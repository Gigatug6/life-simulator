/** Indice d'intelligence : compétence comportementale (0,5 = hasard, 1 = parfaite) -> échelle 0-100. */
export const intelligenceIndex = (competence: number) => Math.round(Math.min(1, Math.max(0, (competence - 0.5) / 0.5)) * 1000) / 10

export interface Level {
  name: string
  min: number
}

/** Paliers d'intelligence du monde, du plus bas au plus haut. */
export const LEVELS: Level[] = [
  { name: 'Errants', min: 0 },
  { name: 'Fourrageurs', min: 15 },
  { name: 'Stratèges', min: 40 },
  { name: 'Sages', min: 70 },
]

export function levelOf(index: number): Level {
  let cur = LEVELS[0]!
  for (const l of LEVELS) if (index >= l.min) cur = l
  return cur
}
