import { describe, expect, it } from 'vitest'
import { History, type Sample } from './history'

const s = (tick: number, h = 10): Sample => ({ tick, herbivores: h, carnivores: 1, hiddenHerbivores: 4, hiddenCarnivores: 4 })

describe('History', () => {
  it("only samples at the minimum interval and ignores going back in time", () => {
    const h = new History(60)
    expect(h.push(s(0))).toBe(true)
    expect(h.push(s(30))).toBe(false)
    expect(h.push(s(60))).toBe(true)
    expect(h.push(s(10))).toBe(false)
    expect(h.points.map((p) => p.tick)).toEqual([0, 60])
  })

  it('stays bounded while keeping the whole timeline (resolution halved)', () => {
    const h = new History(10, 50)
    for (let t = 0; t < 10_000; t += 10) h.push(s(t))
    expect(h.points.length).toBeLessThanOrEqual(50)
    expect(h.points[0]!.tick).toBe(0)
    expect(h.points[h.points.length - 1]!.tick).toBeGreaterThan(9000)
    expect(h.every).toBeGreaterThan(10)
  })

  it('serializes, restores and rejects invalid data', () => {
    const h = new History(60)
    h.push(s(0))
    h.push(s(60, 20))
    const back = History.fromJSON(JSON.parse(JSON.stringify(h)))
    expect(back.points).toEqual(h.points)
    expect(back.every).toBe(60)
    expect(History.fromJSON({ every: 'x', points: 3 }).points).toEqual([])
    expect(History.fromJSON({ every: 60, points: [s(0), { tick: 'a' }, null] }).points.length).toBe(1)
    expect(History.fromJSON(null).points).toEqual([])
  })

  it('forgets the points after a tick', () => {
    const h = new History(60)
    for (let t = 0; t <= 300; t += 60) h.push(s(t))
    h.pruneAfter(150)
    expect(h.points.map((p) => p.tick)).toEqual([0, 60, 120])
  })

  it("accepts old samples without an intelligence index", () => {
    const old = { tick: 0, herbivores: 1, carnivores: 0, hiddenHerbivores: 4, hiddenCarnivores: 0 }
    const h = History.fromJSON({ every: 60, points: [old, { ...old, tick: 60, iqHerbivores: 12.5, iqCarnivores: null }] })
    expect(h.points.length).toBe(2)
    expect(h.points[1]!.iqHerbivores).toBe(12.5)
  })
})
