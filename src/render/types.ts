import type { Frame } from '../sim/protocol'

/** What the UI needs from a world renderer; implemented by the 2D and the 3D renderers. */
export interface WorldRenderer {
  /** Called on a click (without dragging) with the world coordinates in cells. */
  onWorldClick: ((x: number, y: number) => void) | null
  /** Approximate screen pixels per world cell around the point of interest (for click tolerances). */
  readonly pixelsPerCell: number
  setTerrain(w: number, h: number, biome: Uint8Array, altitude: Float32Array): void
  /** Colours the terrain with the current grass layer (w*h). */
  setGrass(grass: Float32Array): void
  /** 0 = night, 1 = full day (the 2D view dims its terrain with it). */
  setDaylight(d: number): void
  /** Simulation clock in ticks: drives the sun, moon, sky and seasons of the 3D view (ignored in 2D). */
  setClock(tick: number): void
  setCreatures(frame: Frame): void
  /** Highlights the followed creature (null = none). */
  setSelection(pos: { x: number; y: number } | null): void
  /** Captures a PNG (data URL) of the current image. */
  snapshot(): string
  dispose(): void
}
