import { defineStore } from 'pinia'
import { markRaw, ref, shallowRef } from 'vue'
import SimWorker from '../sim/worker?worker'
import type { Frame, FromWorker, Speed, ToWorker } from '../sim/protocol'

/** État du monde côté UI. Les tableaux typés restent hors de la réactivité profonde. */
export const useWorldStore = defineStore('world', () => {
  const status = ref('Chargement du moteur…')
  const ready = ref(false)
  const speed = ref<Speed>(1)
  const ticksPerSecond = ref(0)
  const frame = shallowRef<Frame | null>(null)
  const terrain = shallowRef<{ w: number; h: number; biome: Uint8Array } | null>(null)
  let worker: Worker | null = null

  const send = (m: ToWorker) => worker?.postMessage(m)

  function start(seed = 1, w = 256, h = 256) {
    stop()
    worker = new SimWorker()
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data
      if (m.type === 'ready') {
        ready.value = true
        status.value = `Moteur WASM prêt (v${m.version})`
      } else if (m.type === 'terrain') terrain.value = markRaw(m)
      else if (m.type === 'frame') {
        frame.value = markRaw(m.frame)
        ticksPerSecond.value = m.ticksPerSecond
      } else if (m.type === 'error') status.value = `Erreur : ${m.message}`
    }
    send({ type: 'init', seed, w, h, herbivores: 400, carnivores: 20 })
  }

  function stop() {
    worker?.terminate()
    worker = null
    ready.value = false
  }

  function setSpeed(s: Speed) {
    speed.value = s
    send({ type: 'setSpeed', speed: s })
  }

  return {
    status, ready, speed, ticksPerSecond, frame, terrain,
    start, stop, setSpeed,
    spawn: (x: number, y: number, species: number, count: number) => send({ type: 'spawn', x, y, species, count }),
    rain: (value: number) => send({ type: 'rain', value }),
  }
})
