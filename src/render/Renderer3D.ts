import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Frame } from '../sim/protocol'
import { Ground } from './relief'
import { terrainColor } from './terrainColor'
import { writeInstances3d } from './instances3d'
import type { WorldRenderer } from './types'

const MAX_CREATURES = 20000 // mirror of creatures::MAX

/** sRGB byte -> linear lookup, so vertex colours match the colours of the 2D view. */
const SRGB_TO_LINEAR = new Float32Array(256).map((_, i) => {
  const c = i / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
})

/** 3D view: relief terrain, water, lights, orbit camera, creatures standing on the ground. */
export class Renderer3D implements WorldRenderer {
  onWorldClick: ((x: number, y: number) => void) | null = null

  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(50, 1, 0.5, 2000)
  private controls: OrbitControls
  private ambient = new THREE.AmbientLight(0xffffff, 0.6)
  private sun = new THREE.DirectionalLight(0xfff0d8, 1.2)
  private water: THREE.Mesh
  private terrainMesh: THREE.Mesh | null = null
  private cellColors: Float32Array | null = null // linear RGB per terrain vertex
  private ground: Ground | null = null
  private biome: Uint8Array | null = null
  private w = 0
  private h = 0
  private creatures: THREE.InstancedMesh
  private ring: THREE.Mesh
  private ringPos: { x: number; y: number } | null = null
  private lastFrame: Frame | null = null
  private uploadedScale = 0
  private raf = 0
  private raycaster = new THREE.Raycaster()
  private down: { x: number; y: number; t: number } | null = null
  private cleanup: Array<() => void> = []

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.scene.background = new THREE.Color(0x0a1626)
    this.scene.fog = new THREE.Fog(0x0a1626, 250, 700)

    this.scene.add(this.ambient, this.sun, this.sun.target)

    // water: one big translucent plane at height 0 (the terrain is below it where altitude < sea level)
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshPhongMaterial({ color: 0x2d74b5, transparent: true, opacity: 0.62, shininess: 80, specular: 0x9ec9ff }),
    )
    this.scene.add(this.water)

    // creatures: cones pointing along +x, one instance each
    const body = new THREE.ConeGeometry(0.42, 1.6, 6).rotateZ(-Math.PI / 2)
    this.creatures = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial(), MAX_CREATURES)
    this.creatures.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.creatures.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CREATURES * 3), 3)
    this.creatures.instanceColor.setUsage(THREE.DynamicDrawUsage)
    this.creatures.frustumCulled = false
    this.creatures.count = 0
    this.scene.add(this.creatures)

    // selection ring lying on the ground
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false, transparent: true }),
    )
    this.ring.renderOrder = 10
    this.ring.visible = false
    this.scene.add(this.ring)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.maxPolarAngle = Math.PI * 0.47 // never go under the ground
    this.controls.minDistance = 6
    this.controls.maxDistance = 450

    this.bindClicks()
    this.resize()
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      this.controls.update()
      this.draw()
    }
    loop()
  }

  get pixelsPerCell() {
    const dist = this.camera.position.distanceTo(this.controls.target)
    const viewH = this.canvas.clientHeight || 600
    return viewH / (2 * Math.max(dist, 1) * Math.tan((this.camera.fov * Math.PI) / 360))
  }

  setTerrain(w: number, h: number, biome: Uint8Array, altitude: Float32Array) {
    this.disposeTerrain()
    this.w = w
    this.h = h
    this.biome = biome
    this.ground = new Ground(w, h, altitude)

    // grid mesh: one vertex per cell corner, indexed triangles, colours per vertex
    const stride = w + 1
    const pos = new Float32Array(stride * (h + 1) * 3)
    for (let j = 0; j <= h; j++) {
      for (let i = 0; i <= w; i++) {
        const k = (j * stride + i) * 3
        pos[k] = i
        pos[k + 1] = this.ground.vertexHeights[j * stride + i]!
        pos[k + 2] = j
      }
    }
    const idx = new Uint32Array(w * h * 6)
    let o = 0
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const a = j * stride + i
        idx.set([a, a + stride, a + 1, a + 1, a + stride, a + stride + 1], o)
        o += 6
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.cellColors = new Float32Array(stride * (h + 1) * 3)
    geo.setAttribute('color', new THREE.BufferAttribute(this.cellColors, 3))
    geo.setIndex(new THREE.BufferAttribute(idx, 1))
    geo.computeVertexNormals()
    this.terrainMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }))
    this.scene.add(this.terrainMesh)
    this.paint(null)

    // sea plane much larger than the island, so the horizon is water
    this.water.scale.set(w * 6, 1, h * 6)
    this.water.position.set(w / 2, 0, h / 2)
    this.sun.position.set(w * 0.2, 260, h * 1.1)
    this.sun.target.position.set(w / 2, 0, h / 2)

    // starting point of view: above the south edge, looking at the island centre
    this.controls.target.set(w / 2, 0, h / 2)
    this.camera.position.set(w / 2, Math.max(w, h) * 0.62, h * 1.18)
    this.controls.update()
    this.uploadedScale = 0
  }

  /** Repaints the vertex colours from the biomes and the grass (null = bare terrain). */
  private paint(grass: Float32Array | null) {
    if (!this.biome || !this.cellColors || !this.terrainMesh) return
    const { w, h } = this
    const rgba = new Uint8ClampedArray(4)
    const stride = w + 1
    for (let j = 0; j <= h; j++) {
      const cj = Math.min(j, h - 1)
      for (let i = 0; i <= w; i++) {
        const cell = cj * w + Math.min(i, w - 1)
        terrainColor(this.biome[cell]!, grass ? grass[cell]! : 0, rgba, 0)
        const k = (j * stride + i) * 3
        this.cellColors[k] = SRGB_TO_LINEAR[rgba[0]!]!
        this.cellColors[k + 1] = SRGB_TO_LINEAR[rgba[1]!]!
        this.cellColors[k + 2] = SRGB_TO_LINEAR[rgba[2]!]!
      }
    }
    this.terrainMesh.geometry.getAttribute('color').needsUpdate = true
  }

  setGrass(grass: Float32Array) {
    if (grass.length === this.w * this.h) this.paint(grass)
  }

  /** Day/night: dims the sun and the ambient light and tints the sky. 0 = night, 1 = full day. */
  setDaylight(d: number) {
    this.sun.intensity = 0.12 + 1.15 * d
    this.ambient.intensity = 0.28 + 0.4 * d
    const sky = new THREE.Color(0x04080f).lerp(new THREE.Color(0x6fa8dc), d)
    ;(this.scene.background as THREE.Color).copy(sky)
    ;(this.scene.fog as THREE.Fog).color.copy(sky)
  }

  setSelection(pos: { x: number; y: number } | null) {
    this.ringPos = pos
  }

  setCreatures(frame: Frame) {
    this.lastFrame = frame
    this.uploadCreatures()
  }

  private uploadCreatures() {
    const f = this.lastFrame
    if (!f || !this.ground) return
    const n = Math.min(f.count, MAX_CREATURES)
    const ppc = this.pixelsPerCell
    writeInstances3d(n, f.x, f.y, f.angle, f.energy, f.species, f.size, f.hue, f.signal, this.ground, ppc,
      this.creatures.instanceMatrix.array as Float32Array, this.creatures.instanceColor!.array as Float32Array)
    this.creatures.count = n
    this.creatures.instanceMatrix.needsUpdate = true
    this.creatures.instanceColor!.needsUpdate = true
    this.uploadedScale = ppc
  }

  snapshot(): string {
    this.draw()
    return this.canvas.toDataURL('image/png')
  }

  resize() {
    const w = this.canvas.clientWidth || 800
    const h = this.canvas.clientHeight || 600
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private draw() {
    // creature size depends on the camera distance: rebuild the instances when it changed noticeably
    const ppc = this.pixelsPerCell
    if (this.lastFrame && Math.abs(ppc - this.uploadedScale) > this.uploadedScale * 0.08) this.uploadCreatures()
    if (this.ringPos && this.ground) {
      const { x, y } = this.ringPos
      const r = Math.max(2, 14 / Math.max(ppc, 0.01))
      this.ring.visible = true
      this.ring.position.set(x, Math.max(this.ground.at(x, y), 0) + 0.6, y)
      this.ring.scale.set(r, 1, r)
    } else this.ring.visible = false
    this.renderer.render(this.scene, this.camera)
  }

  /** A click (little movement, short press) picks the point of the terrain under the cursor. */
  private bindClicks() {
    const c = this.canvas
    const on = <K extends keyof HTMLElementEventMap>(t: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      c.addEventListener(t, fn as EventListener)
      this.cleanup.push(() => c.removeEventListener(t, fn as EventListener))
    }
    on('pointerdown', (e) => {
      this.down = { x: e.clientX, y: e.clientY, t: performance.now() }
    })
    on('pointerup', (e) => {
      const d = this.down
      this.down = null
      if (!d || !this.terrainMesh) return
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || performance.now() - d.t > 400) return
      const r = c.getBoundingClientRect()
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      this.raycaster.setFromCamera(ndc, this.camera)
      const hit = this.raycaster.intersectObject(this.terrainMesh)[0]
      if (hit) this.onWorldClick?.(hit.point.x, hit.point.z) // scene z is the world y axis
    })
    const ro = new ResizeObserver(() => this.resize())
    ro.observe(c)
    this.cleanup.push(() => ro.disconnect())
  }

  private disposeTerrain() {
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh)
      this.terrainMesh.geometry.dispose()
      ;(this.terrainMesh.material as THREE.Material).dispose()
    }
    this.terrainMesh = null
    this.cellColors = null
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.cleanup.forEach((f) => f())
    this.controls.dispose()
    this.disposeTerrain()
    for (const m of [this.water, this.ring]) {
      this.scene.remove(m)
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
    this.scene.remove(this.creatures)
    this.creatures.geometry.dispose()
    ;(this.creatures.material as THREE.Material).dispose()
    this.creatures.dispose()
    this.renderer.dispose()
  }
}
