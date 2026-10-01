import { defineStore } from 'pinia'
import { markRaw, ref, shallowRef } from 'vue'
import { createSaveStore, type SaveStore } from '../persist/store'
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
  const restored = ref(false)
  const savedAt = ref<number | null>(null)
  const saveError = ref<string | null>(null)
  const persistent = ref(false)
  let worker: Worker | null = null
  let saveStore: SaveStore | null = null
  let autosave: ReturnType<typeof setInterval> | null = null
  const AUTOSAVE_MS = 10_000

  const send = (m: ToWorker) => worker?.postMessage(m)

  const onHidden = () => {
    if (document.visibilityState === 'hidden') save()
  }

  /** Demande un snapshot au worker ; l'écriture se fait ici (le thread principal survit à pagehide). */
  function save() {
    if (ready.value) send({ type: 'save' })
  }

  async function start(seed = Math.floor(Math.random() * 2 ** 32), w = 256, h = 256) {
    stop()
    saveStore = createSaveStore()
    persistent.value = saveStore.persistent
    let snapshot: Uint8Array | undefined
    try {
      snapshot = (await saveStore.load())?.data
    } catch (err) {
      saveError.value = `Lecture de la sauvegarde impossible : ${err}`
    }
    worker = new SimWorker()
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data
      if (m.type === 'ready') {
        ready.value = true
        restored.value = m.restored
        status.value = m.restored ? `Monde repris depuis la sauvegarde (v${m.version})` : `Moteur WASM prêt (v${m.version})`
        autosave = setInterval(save, AUTOSAVE_MS)
        document.addEventListener('visibilitychange', onHidden)
        window.addEventListener('pagehide', save)
      } else if (m.type === 'terrain') terrain.value = markRaw(m)
      else if (m.type === 'frame') {
        frame.value = markRaw(m.frame)
        ticksPerSecond.value = m.ticksPerSecond
      } else if (m.type === 'snapshot') {
        const store = saveStore
        store
          ?.save(m.data, { savedAt: Date.now(), ...m.meta })
          .then(() => {
            savedAt.value = Date.now()
            saveError.value = null
          })
          .catch((err) => (saveError.value = `Sauvegarde impossible : ${err}`))
      } else if (m.type === 'error') status.value = `Erreur : ${m.message}`
    }
    send({ type: 'init', seed, w, h, herbivores: 400, carnivores: 20, snapshot })
  }

  function stop() {
    if (autosave) clearInterval(autosave)
    autosave = null
    document.removeEventListener('visibilitychange', onHidden)
    window.removeEventListener('pagehide', save)
    worker?.terminate()
    worker = null
    ready.value = false
  }

  function setSpeed(s: Speed) {
    speed.value = s
    send({ type: 'setSpeed', speed: s })
  }

  return {
    status, ready, speed, ticksPerSecond, frame, terrain, restored, savedAt, saveError, persistent,
    start, stop, setSpeed, save,
    spawn: (x: number, y: number, species: number, count: number) => send({ type: 'spawn', x, y, species, count }),
    rain: (value: number) => send({ type: 'rain', value }),
  }
})
