import { describe, expect, it } from 'vitest'
import { ViewState } from './view'
import { terrainColor } from './terrainColor'
import { Biome } from '../sim/engine'

describe('ViewState', () => {
  const make = () => {
    const v = new ViewState(200, 100)
    v.resize(800, 400)
    v.fit()
    return v
  }

  it('frames the whole world at the centre', () => {
    const v = make()
    expect([v.cx, v.cy]).toEqual([100, 50])
    expect(v.zoom).toBeCloseTo(3.8)
  })

  it('zoom keeps the point under the cursor fixed', () => {
    const v = make()
    const before = v.screenToWorld(600, 100)
    v.zoomAt(2, 600, 100)
    const after = v.screenToWorld(600, 100)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('clamps the zoom and the panning', () => {
    const v = make()
    v.zoomAt(1e6, 400, 200)
    expect(v.zoom).toBe(v.maxZoom)
    v.zoomAt(1e-9, 400, 200)
    expect(v.zoom).toBeCloseTo(v.minZoom)
    v.panBy(-1e7, 1e7)
    expect(v.cx).toBe(200)
    expect(v.cy).toBe(0)
  })

  it('dragging right moves the view towards the left of the world', () => {
    const v = make()
    v.zoomAt(4, 400, 200)
    const x = v.cx
    v.panBy(40, 0)
    expect(v.cx).toBeLessThan(x)
  })
})

describe('terrainColor', () => {
  const px = (biome: number, grass: number) => {
    const o = new Uint8ClampedArray(4)
    terrainColor(biome, grass, o, 0)
    return Array.from(o)
  }
  it("grass greens the plain, not the water", () => {
    expect(px(Biome.Plain, 1)[1]!).toBeGreaterThan(px(Biome.Plain, 0)[1]!)
    expect(px(Biome.DeepWater, 1)).toEqual(px(Biome.DeepWater, 0))
    expect(px(Biome.Plain, 0)[3]).toBe(255)
  })
})
