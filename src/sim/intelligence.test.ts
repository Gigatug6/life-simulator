import { describe, expect, it } from 'vitest'
import { intelligenceIndex, levelOf } from './intelligence'

describe('intelligence', () => {
  it("converts competence into a 0-100 index (0.5 = random)", () => {
    expect(intelligenceIndex(0.5)).toBe(0)
    expect(intelligenceIndex(0.45)).toBe(0) // below chance: clamped
    expect(intelligenceIndex(0.75)).toBe(50)
    expect(intelligenceIndex(1)).toBe(100)
    expect(intelligenceIndex(2)).toBe(100)
  })

  it('names the levels', () => {
    expect(levelOf(0).name).toBe('Errants')
    expect(levelOf(14.9).name).toBe('Errants')
    expect(levelOf(15).name).toBe('Fourrageurs')
    expect(levelOf(39).name).toBe('Fourrageurs')
    expect(levelOf(40).name).toBe('Stratèges')
    expect(levelOf(99).name).toBe('Sages')
  })
})
