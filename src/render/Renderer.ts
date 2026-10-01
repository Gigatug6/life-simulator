import * as THREE from 'three'
import { ViewState } from './view'
import { terrainColor } from './terrainColor'

/** Rendu 2D vue du ciel. Aucune dépendance à Vue : les données entrent par des méthodes. */
export class Renderer {
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
  private raf = 0
  private dirty = true
  private pointers = new Map<number, { x: number; y: number }>()
  private pinchDist = 0
  private cleanup: Array<() => void> = []

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.scene.background = new THREE.Color(0x070d0a)
    this.bindInput()
    this.resize()
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      if (this.dirty) {
        this.draw()
        this.dirty = false
      }
    }
    loop()
  }

  /** Définit le terrain (une fois par monde). */
  setTerrain(w: number, h: number, biome: Uint8Array) {
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
    // cellule (0,0) en haut à gauche ; l'axe y du monde pointe vers le bas -> y scène = -y monde
    this.terrainMesh.position.set(w / 2, -h / 2, 0)
    this.scene.add(this.terrainMesh)
    this.view.resize(this.canvas.clientWidth || 800, this.canvas.clientHeight || 600)
    this.view.fit()
    this.dirty = true
  }

  /** Met à jour les couleurs avec l'herbe courante (w*h). */
  setGrass(grass: Float32Array) {
    if (!this.terrainTex || !this.biome || grass.length !== this.w * this.h) return
    const data = this.terrainTex.image.data as unknown as Uint8ClampedArray
    for (let i = 0; i < this.w * this.h; i++) terrainColor(this.biome[i]!, grass[i]!, data, i * 4)
    this.terrainTex.needsUpdate = true
    this.dirty = true
  }

  /** Jour/nuit : assombrit le terrain (0 = nuit, 1 = plein jour). */
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

  /** Capture un PNG (data URL) de l'image courante. */
  snapshot(): string {
    this.draw()
    return this.canvas.toDataURL('image/png')
  }

  private draw() {
    const v = this.view
    const hw = v.vw / 2 / v.zoom
    const hh = v.vh / 2 / v.zoom
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
    this.renderer.dispose()
  }
}
