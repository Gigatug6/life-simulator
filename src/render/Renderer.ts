import * as THREE from 'three'
import { ViewState } from './view'
import { terrainColor } from './terrainColor'
import { writeInstances } from './instances'
import type { Frame } from '../sim/protocol'
import type { WorldRenderer } from './types'
import { METEOR_FALL, clamp01, easeOut, effectDuration, type WorldEffect } from './effects'
import { lineageRgb } from './creatureColor'

const MAX_CREATURES = 20000 // mirror of creatures::MAX

/** Top-down 2D renderer. No dependency on Vue: data comes in through methods. */
export class Renderer implements WorldRenderer {
  readonly view = new ViewState()
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10)
  private terrainMesh: THREE.Mesh | null = null
  private terrainTex: THREE.DataTexture | null = null
  private terrainMat: THREE.MeshBasicMaterial | null = null
  private biome: Uint8Array | null = null
  private w = 0
  private h = 0
  private creatures: THREE.InstancedMesh
  private ring: THREE.Mesh
  private ringPos: { x: number; y: number } | null = null
  private lastFrame: Frame | null = null
  private uploadedZoom = 0
  private raf = 0
  private dirty = true
  private pointers = new Map<number, { x: number; y: number }>()
  private pinchDist = 0
  private cleanup: Array<() => void> = []
  private rings: Array<{ mesh: THREE.Mesh; effect: WorldEffect; start: number }> = []
  private downAt: { x: number; y: number; t: number } | null = null
  /** Called on a click (without dragging) with the world coordinates in cells. */
  onWorldClick: ((x: number, y: number) => void) | null = null

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.scene.background = new THREE.Color(0x070d0a)
    const tri = new THREE.BufferGeometry()
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0.6, 0, 0, -0.4, 0.35, 0, -0.4, -0.35, 0]), 3))
    this.creatures = new THREE.InstancedMesh(tri, new THREE.MeshBasicMaterial(), MAX_CREATURES)
    this.creatures.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.creatures.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CREATURES * 3), 3)
    this.creatures.instanceColor.setUsage(THREE.DynamicDrawUsage)
    this.creatures.frustumCulled = false
    this.creatures.count = 0
    this.scene.add(this.creatures)
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false, transparent: true }),
    )
    this.ring.renderOrder = 10
    this.ring.visible = false
    this.scene.add(this.ring)
    this.bindInput()
    this.resize()
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      if (this.rings.length) {
        this.tickRings(performance.now() / 1000)
        this.dirty = true // the shock waves animate: keep drawing while there are some
      }
      if (this.dirty) {
        this.draw()
        this.dirty = false
      }
    }
    loop()
  }

  get pixelsPerCell() {
    return this.view.zoom
  }

  /** Sets the terrain (once per world). The 2D view ignores the altitude. */
  setTerrain(w: number, h: number, biome: Uint8Array, _altitude?: Float32Array) {
    this.disposeTerrain()
    this.w = w
    this.h = h
    this.biome = biome
    this.view.worldW = w
    this.view.worldH = h
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) terrainColor(biome[i]!, 0, data, i * 4)
    this.terrainTex = new THREE.DataTexture(new Uint8Array(data.buffer), w, h, THREE.RGBAFormat)
    this.terrainTex.magFilter = THREE.NearestFilter
    this.terrainTex.minFilter = THREE.NearestFilter
    this.terrainTex.flipY = true
    this.terrainTex.colorSpace = THREE.SRGBColorSpace
    this.terrainTex.needsUpdate = true
    this.terrainMat = new THREE.MeshBasicMaterial({ map: this.terrainTex })
    this.terrainMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.terrainMat)
    // cell (0,0) at the top left; the world y axis points down -> scene y = -world y
    this.terrainMesh.position.set(w / 2, -h / 2, 0)
    this.scene.add(this.terrainMesh)
    this.view.resize(this.canvas.clientWidth || 800, this.canvas.clientHeight || 600)
    this.view.fit()
    this.dirty = true
  }

  /** Updates the colours with the current grass (w*h). */
  setGrass(grass: Float32Array) {
    if (!this.terrainTex || !this.biome || grass.length !== this.w * this.h) return
    const data = this.terrainTex.image.data as unknown as Uint8ClampedArray
    for (let i = 0; i < this.w * this.h; i++) terrainColor(this.biome[i]!, grass[i]!, data, i * 4)
    this.terrainTex.needsUpdate = true
    this.dirty = true
  }

  /** Draws a ring around the followed creature (null = none). */
  setSelection(pos: { x: number; y: number } | null) {
    this.ringPos = pos
    this.dirty = true
  }

  /** Updates the creatures from a simulation frame. */
  setCreatures(frame: Frame) {
    this.lastFrame = frame
    this.uploadCreatures()
  }

  private uploadCreatures() {
    const f = this.lastFrame
    if (!f) return
    const n = Math.min(f.count, MAX_CREATURES)
    writeInstances(n, f.x, f.y, f.angle, f.energy, f.species, f.size, f.hue, f.signal, this.view.zoom,
      this.creatures.instanceMatrix.array as Float32Array, this.creatures.instanceColor!.array as Float32Array)
    this.creatures.count = n
    this.creatures.instanceMatrix.needsUpdate = true
    this.creatures.instanceColor!.needsUpdate = true
    this.uploadedZoom = this.view.zoom
    this.dirty = true
  }

  /** The 2D view has no sun or seasons: only `setDaylight` matters. */
  setClock(_tick: number) {}

  /** No weather in the flat view. */
  setWeather(_rain: number) {}

  /** Nothing costly to turn off in the flat view. */
  setEffectsEnabled(_on: boolean) {}

  /** The "God" events are shown as an expanding ring (orange for a meteor, gold for a blessing, species colour for a spawn). */
  addEffect(e: WorldEffect) {
    const color =
      e.kind === 'meteor' ? new THREE.Color(1, 0.55, 0.15) : e.kind === 'bless' ? new THREE.Color(1, 0.85, 0.35) : new THREE.Color(...lineageRgb(e.species ?? 0, 0.5))
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.88, 1, 56),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthTest: false, side: THREE.DoubleSide }),
    )
    mesh.position.set(e.x, -e.y, 0.4)
    mesh.renderOrder = 9
    this.scene.add(mesh)
    this.rings.push({ mesh, effect: e, start: performance.now() / 1000 })
  }

  private tickRings(now: number) {
    this.rings = this.rings.filter((r) => {
      const t = now - r.start
      const e = r.effect
      let scale = 0
      let alpha = 0
      if (e.kind === 'meteor') {
        const u = clamp01((t - METEOR_FALL) / 0.9) // nothing until the meteor lands
        scale = e.radius * 1.15 * easeOut(u)
        alpha = t < METEOR_FALL ? 0 : 0.9 * (1 - clamp01((t - METEOR_FALL) / 1.1))
      } else if (e.kind === 'bless') {
        const u = clamp01(t / 1.4)
        scale = e.radius * (0.4 + 0.7 * easeOut(u))
        alpha = 0.85 * (1 - u)
      } else {
        const u = clamp01(t / effectDuration('spawn'))
        scale = 1.5 + 3.5 * easeOut(u)
        alpha = 0.9 * (1 - u)
      }
      r.mesh.scale.setScalar(Math.max(scale, 0.01))
      ;(r.mesh.material as THREE.MeshBasicMaterial).opacity = alpha
      const alive = t < effectDuration(e.kind)
      if (!alive) {
        this.scene.remove(r.mesh)
        r.mesh.geometry.dispose()
        ;(r.mesh.material as THREE.Material).dispose()
      }
      return alive
    })
  }

  /** Day/night: darkens the terrain (0 = night, 1 = full day). */
  setDaylight(d: number) {
    this.terrainMat?.color.setScalar(0.4 + 0.6 * d)
    this.dirty = true
  }

  resize() {
    const w = this.canvas.clientWidth || 800
    const h = this.canvas.clientHeight || 600
    this.renderer.setSize(w, h, false)
    this.view.resize(w, h)
    this.dirty = true
  }

  /** Captures a PNG (data URL) of the current image. */
  snapshot(): string {
    this.draw()
    return this.canvas.toDataURL('image/png')
  }

  private draw() {
    if (this.lastFrame && Math.abs(this.view.zoom - this.uploadedZoom) > 1e-6) this.uploadCreatures()
    const v = this.view
    const hw = v.vw / 2 / v.zoom
    const hh = v.vh / 2 / v.zoom
    if (this.ringPos) {
      const r = Math.max(2, 14 / v.zoom)
      this.ring.visible = true
      this.ring.position.set(this.ringPos.x, -this.ringPos.y, 0.5)
      this.ring.scale.set(r, r, 1)
    } else this.ring.visible = false
    this.camera.left = -hw
    this.camera.right = hw
    this.camera.top = hh
    this.camera.bottom = -hh
    this.camera.position.set(v.cx, -v.cy, 5)
    this.camera.updateProjectionMatrix()
    this.renderer.render(this.scene, this.camera)
  }

  private bindInput() {
    const c = this.canvas
    const on = <K extends keyof HTMLElementEventMap>(t: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      c.addEventListener(t, fn as EventListener, opts)
      this.cleanup.push(() => c.removeEventListener(t, fn as EventListener))
    }
    const local = (e: MouseEvent) => {
      const r = c.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    on('wheel', (e) => {
      e.preventDefault()
      const p = local(e)
      this.view.zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y)
      this.dirty = true
    }, { passive: false })
    on('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId)
      this.pointers.set(e.pointerId, local(e))
      this.pinchDist = this.pointerDistance()
      this.downAt = this.pointers.size === 1 ? { ...local(e), t: e.timeStamp } : null // event time, not handler time: robust when the main thread is busy
    })
    on('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId)
      if (!prev) return
      const p = local(e)
      this.pointers.set(e.pointerId, p)
      if (this.pointers.size === 1) this.view.panBy(p.x - prev.x, p.y - prev.y)
      else if (this.pointers.size === 2) {
        const d = this.pointerDistance()
        if (this.pinchDist > 0) {
          const [a, b] = [...this.pointers.values()]
          this.view.zoomAt(d / this.pinchDist, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2)
        }
        this.pinchDist = d
      }
      this.dirty = true
    })
    const up = (e: PointerEvent) => {
      const d = this.downAt
      if (d && e.type === 'pointerup' && this.pointers.size === 1) {
        const p = local(e)
        if (Math.hypot(p.x - d.x, p.y - d.y) < 5 && e.timeStamp - d.t < 400) {
          const w = this.view.screenToWorld(p.x, p.y)
          this.onWorldClick?.(w.x, w.y)
        }
      }
      this.downAt = null
      this.pointers.delete(e.pointerId)
      this.pinchDist = 0
    }
    on('pointerup', up)
    on('pointercancel', up)
    const ro = new ResizeObserver(() => this.resize())
    ro.observe(c)
    this.cleanup.push(() => ro.disconnect())
  }

  private pointerDistance() {
    if (this.pointers.size < 2) return 0
    const [a, b] = [...this.pointers.values()]
    return Math.hypot(a!.x - b!.x, a!.y - b!.y)
  }

  private disposeTerrain() {
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh)
      this.terrainMesh.geometry.dispose()
    }
    this.terrainMat?.dispose()
    this.terrainTex?.dispose()
    this.terrainMesh = null
    this.terrainMat = null
    this.terrainTex = null
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.cleanup.forEach((f) => f())
    this.disposeTerrain()
    this.rings.forEach((r) => {
      this.scene.remove(r.mesh)
      r.mesh.geometry.dispose()
      ;(r.mesh.material as THREE.Material).dispose()
    })
    this.rings = []
    this.scene.remove(this.ring)
    this.ring.geometry.dispose()
    ;(this.ring.material as THREE.Material).dispose()
    this.scene.remove(this.creatures)
    this.creatures.geometry.dispose()
    ;(this.creatures.material as THREE.Material).dispose()
    this.creatures.dispose()
    this.renderer.dispose()
  }
}
