/**
 * Low-poly bodies of the creatures for the 3D view. Each species is ONE merged geometry (so a species is
 * one InstancedMesh), with vertex colours for the parts that must stay dark (eyes, feet) or lighter
 * (ears): the instance colour (lineage + energy + glow) multiplies them.
 * Model space: +x = heading, +y = up, about 1.6 long, centred on the body.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

type Part = { geometry: THREE.BufferGeometry; at: [number, number, number]; scale?: [number, number, number]; color: [number, number, number] }

function build(parts: Part[]): THREE.BufferGeometry {
  const prepared = parts.map(({ geometry, at, scale, color }) => {
    const g = geometry.clone()
    if (scale) g.scale(...scale)
    g.translate(...at)
    g.deleteAttribute('uv') // every part must carry the same attributes to be merged
    const n = g.getAttribute('position').count
    const c = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) c.set(color, i * 3)
    g.setAttribute('color', new THREE.BufferAttribute(c, 3))
    return g
  })
  const merged = mergeGeometries(prepared, false)!
  prepared.forEach((g) => g.dispose())
  merged.computeVertexNormals()
  return merged
}

const EYE: [number, number, number] = [0.04, 0.04, 0.05]
const WHITE: [number, number, number] = [1, 1, 1]
const FOOT: [number, number, number] = [0.5, 0.5, 0.52]
const EAR: [number, number, number] = [0.82, 0.82, 0.84]

/** Round herbivore: plump body, small head with long ears and big dark eyes, puffy tail, four stubby feet. */
export function herbivoreGeometry(): THREE.BufferGeometry {
  const sphere = (r: number, w: number, h: number) => new THREE.SphereGeometry(r, w, h)
  const parts: Part[] = [
    { geometry: sphere(0.5, 8, 6), at: [0, 0, 0], scale: [1.0, 0.72, 0.78], color: WHITE }, // body
    { geometry: sphere(0.27, 7, 5), at: [0.58, 0.17, 0], color: WHITE }, // head
    { geometry: sphere(0.065, 4, 3), at: [0.8, 0.26, 0.13], color: EYE },
    { geometry: sphere(0.065, 4, 3), at: [0.8, 0.26, -0.13], color: EYE },
    { geometry: new THREE.ConeGeometry(0.09, 0.32, 4), at: [0.5, 0.5, 0.12], color: EAR }, // ears
    { geometry: new THREE.ConeGeometry(0.09, 0.32, 4), at: [0.5, 0.5, -0.12], color: EAR },
    { geometry: sphere(0.14, 5, 4), at: [-0.58, 0.1, 0], color: WHITE }, // tail
  ]
  for (const [x, z] of [[0.28, 0.22], [0.28, -0.22], [-0.28, 0.22], [-0.28, -0.22]] as const) {
    parts.push({ geometry: sphere(0.1, 4, 3), at: [x, -0.36, z], color: FOOT })
  }
  return build(parts)
}

/** Lean carnivore: long low body, pointed muzzle, dorsal spikes, tapering tail, dark eyes. */
export function carnivoreGeometry(): THREE.BufferGeometry {
  const sphere = (r: number, w: number, h: number) => new THREE.SphereGeometry(r, w, h)
  const forward = (g: THREE.BufferGeometry) => g.rotateZ(-Math.PI / 2) // cone tip: +y -> +x
  const backward = (g: THREE.BufferGeometry) => g.rotateZ(Math.PI / 2) // cone tip: +y -> -x
  const parts: Part[] = [
    { geometry: sphere(0.5, 8, 6), at: [-0.05, 0, 0], scale: [1.18, 0.62, 0.62], color: WHITE }, // body
    { geometry: sphere(0.25, 7, 5), at: [0.62, 0.1, 0], scale: [1.0, 0.9, 0.9], color: WHITE }, // skull
    { geometry: forward(new THREE.ConeGeometry(0.17, 0.5, 5)), at: [0.98, 0.06, 0], color: WHITE }, // muzzle
    { geometry: sphere(0.06, 4, 3), at: [0.78, 0.2, 0.12], color: EYE },
    { geometry: sphere(0.06, 4, 3), at: [0.78, 0.2, -0.12], color: EYE },
    { geometry: backward(new THREE.ConeGeometry(0.13, 0.55, 5)), at: [-0.78, 0.04, 0], color: WHITE }, // tail
  ]
  for (const x of [0.25, -0.05, -0.35]) {
    parts.push({ geometry: new THREE.ConeGeometry(0.07, 0.24, 4), at: [x, 0.38, 0], color: EAR }) // spikes
  }
  for (const [x, z] of [[0.3, 0.18], [0.3, -0.18], [-0.32, 0.18], [-0.32, -0.18]] as const) {
    parts.push({ geometry: sphere(0.09, 4, 3), at: [x, -0.32, z], color: FOOT })
  }
  return build(parts)
}
