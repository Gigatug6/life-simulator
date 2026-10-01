/**
 * Relief of the world for the 3D view. Single source of truth for the terrain height: the mesh is built
 * from `vertexHeights`, and creatures are placed with `Ground.at`, so they always stand on the surface.
 */

/** Altitude (0..1) at which the water surface sits (shallow water ends at 0.38, deep water at 0.30). */
export const SEA_LEVEL = 0.34
/** Vertical exaggeration: scene units (= world cells) per unit of altitude. */
export const RELIEF = 42

/** Scene height of an altitude; the water surface is at 0. */
export const heightOfAltitude = (a: number) => (a - SEA_LEVEL) * RELIEF

export class Ground {
  /** Heights at the (w+1) × (h+1) cell corners: each is the mean altitude of the cells touching it. */
  readonly vertexHeights: Float32Array

  constructor(readonly w: number, readonly h: number, altitude: Float32Array) {
    this.vertexHeights = new Float32Array((w + 1) * (h + 1))
    for (let j = 0; j <= h; j++) {
      for (let i = 0; i <= w; i++) {
        let sum = 0
        let n = 0
        for (let dj = -1; dj <= 0; dj++) {
          for (let di = -1; di <= 0; di++) {
            const ci = i + di
            const cj = j + dj
            if (ci >= 0 && ci < w && cj >= 0 && cj < h) {
              sum += altitude[cj * w + ci]!
              n++
            }
          }
        }
        this.vertexHeights[j * (w + 1) + i] = heightOfAltitude(sum / n)
      }
    }
  }

  /** Surface height at world position (x, y) in cells (bilinear between the corner heights). */
  at(x: number, y: number): number {
    const cx = Math.min(this.w - 1e-3, Math.max(0, x))
    const cy = Math.min(this.h - 1e-3, Math.max(0, y))
    const i = Math.floor(cx)
    const j = Math.floor(cy)
    const fx = cx - i
    const fy = cy - j
    const v = this.vertexHeights
    const s = this.w + 1
    const top = v[j * s + i]! * (1 - fx) + v[j * s + i + 1]! * fx
    const bottom = v[(j + 1) * s + i]! * (1 - fx) + v[(j + 1) * s + i + 1]! * fx
    return top * (1 - fy) + bottom * fy
  }
}
