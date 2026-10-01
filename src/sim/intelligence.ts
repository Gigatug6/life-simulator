/** Intelligence index: behavioural competence (0.5 = random, 1 = perfect) -> 0-100 scale. */
export const intelligenceIndex = (competence: number) => Math.round(Math.min(1, Math.max(0, (competence - 0.5) / 0.5)) * 1000) / 10

export interface Level {
  name: string
  min: number
}

/** World intelligence levels (names are UI text, in French), lowest to highest. */
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
