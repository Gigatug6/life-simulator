import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Frame } from '../sim/protocol'
import { Ground } from './relief'
import { terrainColor } from './terrainColor'
import { writeInstances3d, writeShadows3d } from './instances3d'
import { carnivoreGeometry, herbivoreGeometry } from './creatureModels'
import { skyAt } from './sky'
import { applySeason, seasonFactors, type SeasonFactors } from './seasons'
import { SKY_FRAGMENT, SKY_VERTEX, WATER_FRAGMENT, WATER_VERTEX } from './shaders'
import type { WorldRenderer } from './types'

const MAX_CREATURES = 20000 // mirror of creatures::MAX
const WATER_STEP = 2 // the water grid is twice as coarse as the terrain grid

/** sRGB byte -> linear lookup, so vertex colours match the colours of the 2D view. */
const SRGB_TO_LINEAR = new Float32Array(256).map((_, i) => {
  const c = i / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
})

/** 3D view: relief terrain, animated water, sun/moon/sky cycle, seasons, orbit camera, 3D creatures. */
export class Renderer3D implements WorldRenderer {
  onWorldClick: ((x: number, y: number) => void) | null = null

  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(50, 1, 0.5, 2500)
  private controls: OrbitControls

  // lights: the directional light is the sun by day and the moon by night
  private hemi = new THREE.HemisphereLight(0xaed0f2, 0x4d5a3a, 0.6)
  private sun = new THREE.DirectionalLight(0xfff0d8, 1.2)
  private fog = new THREE.Fog(0x0a1626, 260, 800)

  // sky dome and sea
  private sky: THREE.Mesh
  private skyUniforms = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uHorizon: { value: new THREE.Color() },
    uZenith: { value: new THREE.Color() },
    uDay: { value: 1 },
    uDusk: { value: 0 },
  }
  private outerSea: THREE.Mesh | null = null // deep sea out to the horizon (same shader as the water)
  private water: THREE.Mesh | null = null // animated surface around the island
  private waterUniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uLightColor: { value: new THREE.Color(1, 1, 1) },
    uHorizon: { value: new THREE.Color() },
    uZenith: { value: new THREE.Color() },
    uDay: { value: 1 },
  }

  private terrainMesh: THREE.Mesh | null = null
  private cellColors: Float32Array | null = null // linear RGB per terrain vertex
  private ground: Ground | null = null
  private biome: Uint8Array | null = null
  private altitude: Float32Array | null = null
  private lastGrass: Float32Array | null = null
  private paintedSeason: SeasonFactors = { autumn: -1, winter: -1 }
  private w = 0
  private h = 0

  private bodies: [THREE.InstancedMesh, THREE.InstancedMesh] // herbivores, carnivores
  private shadows: THREE.InstancedMesh // flat dark discs under the creatures
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
    this.scene.fog = this.fog
    this.scene.add(this.hemi, this.sun, this.sun.target)

    // sky dome (always centred on the camera)
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        uniforms: this.skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    )
    this.sky.renderOrder = -10
    this.scene.add(this.sky)

    // creatures: one InstancedMesh per species (low-poly bodies with vertex colours for eyes, ears, feet)
    const makeBodies = (geometry: THREE.BufferGeometry) => {
      const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }), MAX_CREATURES)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CREATURES * 3), 3)
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
      mesh.frustumCulled = false
      mesh.count = 0
      this.scene.add(mesh)
      return mesh
    }
    this.bodies = [makeBodies(herbivoreGeometry()), makeBodies(carnivoreGeometry())]

    // blob shadows (real shadow maps would not scale to thousands of instances)
    this.shadows = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
      MAX_CREATURES,
    )
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.shadows.frustumCulled = false
    this.shadows.count = 0
    this.shadows.renderOrder = 2
    this.scene.add(this.shadows)

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

    this.setClock(300) // noon until the first frame says otherwise
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
    this.altitude = altitude
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
    this.paintedSeason = { autumn: -1, winter: -1 }
    this.paint(this.lastGrass, this.currentSeason)

    this.buildWater()

    // starting point of view: above the south edge, looking at the island centre
    this.controls.target.set(w / 2, 0, h / 2)
    this.camera.position.set(w / 2, Math.max(w, h) * 0.62, h * 1.18)
    this.controls.update()
    this.uploadedScale = 0
    this.setClock(this.tick) // places the sun/moon around the new island
  }

  /** The animated water surface: a coarse grid at height 0 whose vertices know how deep the water is. */
  private buildWater() {
    if (this.water) {
      this.scene.remove(this.water)
      this.water.geometry.dispose()
      ;(this.water.material as THREE.Material).dispose()
    }
    if (this.outerSea) {
      this.scene.remove(this.outerSea)
      this.outerSea.geometry.dispose()
    }
    const { w, h } = this
    const ground = this.ground!
    const nx = Math.ceil(w / WATER_STEP)
    const ny = Math.ceil(h / WATER_STEP)
    const stride = nx + 1
    const pos = new Float32Array(stride * (ny + 1) * 3)
    const depth = new Float32Array(stride * (ny + 1))
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = Math.min(i * WATER_STEP, w)
        const z = Math.min(j * WATER_STEP, h)
        const k = j * stride + i
        pos[k * 3] = x
        pos[k * 3 + 2] = z
        depth[k] = Math.max(0, -ground.at(x, z))
      }
    }
    const idx = new Uint32Array(nx * ny * 6)
    let o = 0
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * stride + i
        idx.set([a, a + stride, a + 1, a + 1, a + stride, a + stride + 1], o)
        o += 6
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1))
    geo.setAttribute('aWave', new THREE.BufferAttribute(new Float32Array(depth.length).fill(1), 1))
    geo.setIndex(new THREE.BufferAttribute(idx, 1))
    const material = new THREE.ShaderMaterial({
      vertexShader: WATER_VERTEX,
      fragmentShader: WATER_FRAGMENT,
      uniforms: this.waterUniforms,
      transparent: true,
      depthWrite: false,
    })
    this.water = new THREE.Mesh(geo, material)
    this.water.renderOrder = 1
    this.water.frustumCulled = false
    this.scene.add(this.water)

    // the deep sea around the island: four flat strips (no overlap with the island water) with the same
    // shader and a constant large depth, so the colours are continuous and the horizon is water
    const m = Math.max(w, h) * 6
    const strips: Array<[number, number, number, number]> = [
      [-m, -m, w + m, 0], // north
      [-m, h, w + m, h + m], // south
      [-m, 0, 0, h], // west
      [w, 0, w + m, h], // east
    ]
    const sp: number[] = []
    const si: number[] = []
    strips.forEach(([x0, z0, x1, z1], k) => {
      sp.push(x0, 0, z0, x1, 0, z0, x0, 0, z1, x1, 0, z1)
      const b = k * 4
      si.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
    })
    const og = new THREE.BufferGeometry()
    og.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3))
    og.setAttribute('aDepth', new THREE.Float32BufferAttribute(new Array(sp.length / 3).fill(25), 1))
    og.setAttribute('aWave', new THREE.Float32BufferAttribute(new Array(sp.length / 3).fill(0), 1))
    og.setIndex(si)
    this.outerSea = new THREE.Mesh(og, material)
    this.outerSea.renderOrder = 1
    this.outerSea.frustumCulled = false
    this.scene.add(this.outerSea)
  }

  private tick = 300
  private get currentSeason() {
    return seasonFactors(this.tick)
  }

  /** Repaints the vertex colours from the biomes, the grass (null = bare) and the season. */
  private paint(grass: Float32Array | null, season: SeasonFactors) {
    if (!this.biome || !this.altitude || !this.cellColors || !this.terrainMesh) return
    const { w, h } = this
    const rgba = new Uint8ClampedArray(4)
    const stride = w + 1
    for (let j = 0; j <= h; j++) {
      const cj = Math.min(j, h - 1)
      for (let i = 0; i <= w; i++) {
        const cell = cj * w + Math.min(i, w - 1)
        terrainColor(this.biome[cell]!, grass ? grass[cell]! : 0, rgba, 0)
        applySeason(rgba, 0, this.biome[cell]!, this.altitude[cell]!, season)
        const k = (j * stride + i) * 3
        this.cellColors[k] = SRGB_TO_LINEAR[rgba[0]!]!
        this.cellColors[k + 1] = SRGB_TO_LINEAR[rgba[1]!]!
        this.cellColors[k + 2] = SRGB_TO_LINEAR[rgba[2]!]!
      }
    }
    this.terrainMesh.geometry.getAttribute('color').needsUpdate = true
    this.paintedSeason = season
  }

  setGrass(grass: Float32Array) {
    if (grass.length !== this.w * this.h) return
    this.lastGrass = grass
    this.paint(grass, this.currentSeason)
  }

  /** The 3D view takes its lighting from the clock (`setClock`), not from a daylight factor. */
  setDaylight(_d: number) {}

  /** Moves the sun and moon, recolours the sky, the fog, the lights and the water, and updates the season. */
  setClock(tick: number) {
    this.tick = tick
    const s = skyAt(tick)
    const center = new THREE.Vector3(this.w / 2, 0, this.h / 2)

    // the directional light is the sun while it is up, the moon (opposite) otherwise
    const sunUp = s.elevation > -0.06
    const dir = new THREE.Vector3(...s.sunDir).multiplyScalar(sunUp ? 1 : -1)
    this.sun.position.copy(center).addScaledVector(dir, 320)
    this.sun.target.position.copy(center)
    this.sun.color.setRGB(...s.lightColor)
    this.sun.intensity = s.lightIntensity
    this.hemi.color.setRGB(...s.ambientSky)
    this.hemi.groundColor.setRGB(...s.ambientGround)
    this.hemi.intensity = s.ambientIntensity

    ;(this.shadows.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.3 * s.day // shadows fade at night
    this.skyUniforms.uSunDir.value.set(...s.sunDir)
    this.skyUniforms.uHorizon.value.setRGB(...s.horizon)
    this.skyUniforms.uZenith.value.setRGB(...s.zenith)
    this.skyUniforms.uDay.value = s.day
    this.skyUniforms.uDusk.value = s.dusk
    this.fog.color.setRGB(...s.horizon)

    this.waterUniforms.uSunDir.value.copy(dir)
    this.waterUniforms.uLightColor.value.setRGB(...s.lightColor)
    this.waterUniforms.uHorizon.value.setRGB(...s.horizon)
    this.waterUniforms.uZenith.value.setRGB(...s.zenith)
    this.waterUniforms.uDay.value = s.day

    // seasons: repaint the terrain when the look changed noticeably
    const f = seasonFactors(tick)
    if (Math.abs(f.autumn - this.paintedSeason.autumn) > 0.04 || Math.abs(f.winter - this.paintedSeason.winter) > 0.04) {
      this.paint(this.lastGrass, f)
    }
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
    const target = (m: THREE.InstancedMesh) => ({
      matrices: m.instanceMatrix.array as Float32Array,
      colors: m.instanceColor!.array as Float32Array,
    })
    const counts = writeInstances3d(n, f, this.ground, ppc, performance.now() / 1000, [target(this.bodies[0]), target(this.bodies[1])])
    this.bodies.forEach((m, k) => {
      m.count = counts[k]!
      m.instanceMatrix.needsUpdate = true
      m.instanceColor!.needsUpdate = true
    })
    writeShadows3d(n, f, this.ground, ppc, this.shadows.instanceMatrix.array as Float32Array)
    this.shadows.count = n
    this.shadows.instanceMatrix.needsUpdate = true
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
    this.waterUniforms.uTime.value = performance.now() / 1000
    this.sky.position.copy(this.camera.position)
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
      // event.timeStamp is when the input happened, not when this handler ran: a busy main thread
      // (software WebGL, slow device) must not turn a quick click into a "long press"
      this.down = { x: e.clientX, y: e.clientY, t: e.timeStamp }
    })
    on('pointerup', (e) => {
      const d = this.down
      this.down = null
      if (!d || !this.terrainMesh) return
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || e.timeStamp - d.t > 400) return
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
    const meshes = [this.sky, this.ring, ...(this.water ? [this.water] : [])]
    for (const m of meshes) {
      this.scene.remove(m)
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
    if (this.outerSea) {
      this.scene.remove(this.outerSea)
      this.outerSea.geometry.dispose() // its material is the water's, already disposed above
    }
    for (const m of [...this.bodies, this.shadows]) {
      this.scene.remove(m)
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
      m.dispose()
    }
    this.renderer.dispose()
  }
}
