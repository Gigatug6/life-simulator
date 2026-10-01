import * as THREE from 'three'
import type { Ground } from './relief'
import { METEOR_FALL, blessAlpha, clamp01, easeOut, effectDuration, meteorState, type WorldEffect } from './effects'
import { lineageRgb } from './creatureColor'

interface Active {
  effect: WorldEffect
  /** Effect time in seconds: advanced by the frame time (capped), not read from the wall clock. */
  t: number
  objects: THREE.Object3D[]
  /** Per-frame update with the effect time; returns false when the effect is over. */
  update: (t: number) => boolean
}

/**
 * The effect clock advances by at most this per frame: on a slow machine (a few frames per second) an effect
 * plays in slow motion instead of skipping to its end between two frames.
 */
export const MAX_EFFECT_STEP = 0.12

const EMBERS = 140

/** The visual events of the "God" powers in the 3D view: meteor, blessing, spawn pulse. */
export class Effects3D {
  private active: Active[] = []
  private ringGeo = new THREE.RingGeometry(0.88, 1, 64).rotateX(-Math.PI / 2)
  private discGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2)
  private sphereGeo = new THREE.SphereGeometry(1, 16, 12)
  private columnGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true)

  constructor(private scene: THREE.Scene, private ground: () => Ground | null) {}

  get running() {
    return this.active.length
  }

  /** Effect times of the running effects (seconds since each started). */
  get times() {
    return this.active.map((a) => a.t)
  }

  add(effect: WorldEffect) {
    const g = this.ground()
    if (!g) return
    const y0 = Math.max(g.at(effect.x, effect.y), 0)
    const a = effect.kind === 'meteor' ? this.meteor(effect, y0) : effect.kind === 'bless' ? this.bless(effect, y0) : this.spawn(effect, y0)
    this.active.push({ effect, t: 0, objects: a.objects, update: a.update })
    a.objects.forEach((o) => this.scene.add(o))
  }

  /** Advances every effect by `dt` seconds (capped at MAX_EFFECT_STEP). */
  update(dt: number) {
    const step = Math.min(Math.max(dt, 0), MAX_EFFECT_STEP)
    this.active = this.active.filter((a) => {
      a.t += step
      const alive = a.update(a.t)
      if (!alive) this.remove(a)
      return alive
    })
  }

  private remove(a: Active) {
    for (const o of a.objects) {
      this.scene.remove(o)
      // geometries are shared; only the per-effect materials (and the embers' own geometry) are released
      const m = o as THREE.Mesh | THREE.Points
      const mat = m.material as THREE.Material | undefined
      mat?.dispose()
      if (o instanceof THREE.Points) o.geometry.dispose()
    }
  }

  private additive(color: number, opacity = 1) {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  }

  /** A fireball falls from the sky, then: flash, shock wave ring, flying embers, a scorched disc. */
  private meteor(e: WorldEffect, y0: number) {
    const ball = new THREE.Mesh(this.sphereGeo, this.additive(0xffb347))
    const core = new THREE.Mesh(this.sphereGeo, this.additive(0xfff2cc))
    const wave = new THREE.Mesh(this.ringGeo, this.additive(0xffd9a0, 0))
    wave.position.set(e.x, y0 + 0.4, e.y)
    const flash = new THREE.Mesh(this.sphereGeo, this.additive(0xffffff, 0))
    flash.position.set(e.x, y0 + 1, e.y)
    const scorch = new THREE.Mesh(this.discGeo, new THREE.MeshBasicMaterial({ color: 0x120a06, transparent: true, opacity: 0, depthWrite: false }))
    scorch.position.set(e.x, y0 + 0.12, e.y)
    scorch.scale.set(e.radius, 1, e.radius)

    // embers: particles thrown out of the crater, falling back under gravity
    const pos = new Float32Array(EMBERS * 3)
    const vel = new Float32Array(EMBERS * 3)
    for (let i = 0; i < EMBERS; i++) {
      const ang = Math.random() * Math.PI * 2
      const sp = (0.35 + Math.random() * 0.8) * (6 + e.radius * 1.5)
      vel[i * 3] = Math.cos(ang) * sp
      vel[i * 3 + 1] = (0.6 + Math.random()) * (9 + e.radius * 0.6)
      vel[i * 3 + 2] = Math.sin(ang) * sp
    }
    const embersGeo = new THREE.BufferGeometry()
    embersGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const embers = new THREE.Points(
      embersGeo,
      new THREE.PointsMaterial({ color: 0xff9a3c, size: 1.6, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    embers.frustumCulled = false
    const objects: THREE.Object3D[] = [ball, core, wave, flash, scorch, embers]
    ball.visible = core.visible = false

    const update = (t: number) => {
      const s = meteorState(t)
      if (s.falling) {
        // coming in at a slant from the sky, growing as it nears
        const p = easeOut(s.fall * 0.85 + 0.15 * s.fall * s.fall)
        const h = 130 * (1 - p)
        ball.visible = core.visible = true
        ball.position.set(e.x + 42 * (1 - p), y0 + h + 1, e.y - 28 * (1 - p))
        core.position.copy(ball.position)
        ball.scale.setScalar(1.6 + 2.2 * p + e.radius * 0.08)
        core.scale.setScalar(0.9 + 1.2 * p)
        return true
      }
      ball.visible = core.visible = false
      wave.scale.set(Math.max(0.01, e.radius * s.wave), 1, Math.max(0.01, e.radius * s.wave))
      ;(wave.material as THREE.MeshBasicMaterial).opacity = s.waveAlpha
      flash.scale.setScalar(2 + e.radius * 0.7 * (1 + (1 - s.flash)))
      ;(flash.material as THREE.MeshBasicMaterial).opacity = s.flash
      ;(scorch.material as THREE.MeshBasicMaterial).opacity = s.scorch
      const dt = s.since
      for (let i = 0; i < EMBERS; i++) {
        pos[i * 3] = e.x + vel[i * 3]! * dt
        pos[i * 3 + 1] = y0 + 0.6 + vel[i * 3 + 1]! * dt - 9.8 * 0.5 * dt * dt * 2.2
        pos[i * 3 + 2] = e.y + vel[i * 3 + 2]! * dt
      }
      embersGeo.getAttribute('position').needsUpdate = true
      ;(embers.material as THREE.PointsMaterial).opacity = 0.95 * (1 - clamp01(dt / 2.2))
      return t < effectDuration('meteor')
    }
    return { objects, update }
  }

  /** A column of golden light over the area, rising sparkles, a ring on the ground. */
  private bless(e: WorldEffect, y0: number) {
    const height = 46
    const col = new THREE.Mesh(this.columnGeo, this.additive(0xffd76a, 0))
    col.scale.set(e.radius * 0.9, height, e.radius * 0.9)
    col.position.set(e.x, y0 + height / 2, e.y)
    const ring = new THREE.Mesh(this.ringGeo, this.additive(0xffe9a0, 0))
    ring.position.set(e.x, y0 + 0.35, e.y)
    const N = 90
    const pos = new Float32Array(N * 3)
    const seeds = Array.from({ length: N }, () => [Math.random() * Math.PI * 2, Math.sqrt(Math.random()), Math.random()])
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const sparks = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfff1b8, size: 1.3, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))
    sparks.frustumCulled = false
    const update = (t: number) => {
      const a = blessAlpha(t)
      ;(col.material as THREE.MeshBasicMaterial).opacity = 0.32 * a
      ring.scale.set(e.radius * (0.4 + 0.7 * easeOut(t / 1.2)), 1, e.radius * (0.4 + 0.7 * easeOut(t / 1.2)))
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * a
      for (let i = 0; i < N; i++) {
        const [ang, rad, ph] = seeds[i]!
        const rise = ((t * (0.35 + 0.3 * ph) + ph) % 1) * height * 0.8
        pos[i * 3] = e.x + Math.cos(ang! + t * 0.6) * rad! * e.radius * 0.85
        pos[i * 3 + 1] = y0 + rise
        pos[i * 3 + 2] = e.y + Math.sin(ang! + t * 0.6) * rad! * e.radius * 0.85
      }
      geo.getAttribute('position').needsUpdate = true
      ;(sparks.material as THREE.PointsMaterial).opacity = a
      return t < effectDuration('bless')
    }
    return { objects: [col, ring, sparks] as THREE.Object3D[], update }
  }

  /** A short pulse where creatures were sown, tinted by the species. */
  private spawn(e: WorldEffect, y0: number) {
    const [r, g, b] = lineageRgb(e.species ?? 0, 0.5)
    const ring = new THREE.Mesh(this.ringGeo, this.additive(new THREE.Color(r, g, b).getHex()))
    ring.position.set(e.x, y0 + 0.4, e.y)
    const update = (t: number) => {
      const u = clamp01(t / effectDuration('spawn'))
      const s = 1.5 + 3.5 * easeOut(u)
      ring.scale.set(s, 1, s)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - u)
      return u < 1
    }
    return { objects: [ring] as THREE.Object3D[], update }
  }

  dispose() {
    this.active.forEach((a) => this.remove(a))
    this.active = []
    for (const geo of [this.ringGeo, this.discGeo, this.sphereGeo, this.columnGeo]) geo.dispose()
  }
}

export { METEOR_FALL }
