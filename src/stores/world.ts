import { defineStore } from 'pinia'
import { markRaw, ref, shallowRef } from 'vue'
import { History, forgetHistory, loadHistory, saveHistory, type Sample } from '../sim/history'
import { snapshotInfo } from '../sim/snapshot'
import { createSaveStore, type SaveStore } from '../persist/store'
import SimWorker from '../sim/worker?worker'
import type { Frame, Inspected, FromWorker, Speed, ToWorker } from '../sim/protocol'

/** État du monde côté UI. Les tableaux typés restent hors de la réactivité profonde. */
export const useWorldStore = defineStore('world', () => {
  const status = ref('Chargement du moteur…')
  const ready = ref(false)
  const speed = ref<Speed>(1)
  const ticksPerSecond = ref(0)
  const frame = shallowRef<Frame | null>(null)
  const terrain = shallowRef<{ w: number; h: number; biome: Uint8Array } | null>(null)
  const selectedId = ref<number | null>(null)
  const lastSelected = shallowRef<Inspected | null>(null)
  const history = shallowRef<Sample[]>([])
  let hist = new History()
  let worldSeed = 0
  const restored = ref(false)
  const catchup = ref<{ done: number; total: number } | null>(null)
  const savedAt = ref<number | null>(null)
  const saveError = ref<string | null>(null)
  const persistent = ref(false)
  let worker: Worker | null = null
  let saveStore: SaveStore | null = null
  let pendingExport = false
  let pendingImport = false
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
    status.value = 'Chargement du moteur…'
    frame.value = null
    selectedId.value = null
    lastSelected.value = null
    catchup.value = null
    saveStore = createSaveStore()
    persistent.value = saveStore.persistent
    let snapshot: Uint8Array | undefined
    let elapsedMs = 0
    let savedTick = 0
    worldSeed = seed
    try {
      const rec = await saveStore.load()
      snapshot = rec?.data
      elapsedMs = rec ? Math.max(0, Date.now() - rec.meta.savedAt) : 0
      if (rec) {
        worldSeed = rec.meta.seed
        savedTick = rec.meta.tick
      }
    } catch (err) {
      saveError.value = `Lecture de la sauvegarde impossible : ${err}`
    }
    // historique des courbes : repris pour le même monde, tronqué à l'instant de la sauvegarde
    hist = snapshot ? loadHistory(worldSeed) : new History()
    hist.pruneAfter(savedTick)
    history.value = hist.points.slice()
    worker = new SimWorker()
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data
      if (m.type === 'ready') {
        ready.value = true
        restored.value = m.restored
        if (pendingImport) {
          pendingImport = false
          if (!m.restored) saveError.value = 'Fichier de sauvegarde invalide ou incompatible : un nouveau monde a été créé.'
        }
        status.value = m.restored ? `Monde repris depuis la sauvegarde (v${m.version})` : `Moteur WASM prêt (v${m.version})`
        autosave = setInterval(save, AUTOSAVE_MS)
        document.addEventListener('visibilitychange', onHidden)
        window.addEventListener('pagehide', save)
      } else if (m.type === 'terrain') terrain.value = markRaw(m)
      else if (m.type === 'frame') {
        frame.value = markRaw(m.frame)
        const fr = m.frame
        if (hist.push({ tick: fr.tick, herbivores: fr.herbivores, carnivores: fr.carnivores, hiddenHerbivores: fr.hiddenHerbivores, hiddenCarnivores: fr.hiddenCarnivores, iqHerbivores: fr.iqHerbivores, iqCarnivores: fr.iqCarnivores })) {
          history.value = hist.points.slice()
        }
        if (m.frame.selected) lastSelected.value = markRaw(m.frame.selected)
        ticksPerSecond.value = m.ticksPerSecond
      } else if (m.type === 'catchup') {
        catchup.value = m.finished ? null : { done: m.done, total: m.total }
      } else if (m.type === 'snapshot') {
        const store = saveStore
        if (pendingExport) {
          pendingExport = false
          download(m.data, `monde-${m.meta.seed.toString(16)}-t${m.meta.tick}.life`)
        }
        saveHistory(m.meta.seed, hist)
        store
          ?.save(m.data, { savedAt: Date.now(), ...m.meta })
          .then(() => {
            savedAt.value = Date.now()
            saveError.value = null
          })
          .catch((err) => (saveError.value = `Sauvegarde impossible : ${err}`))
      } else if (m.type === 'error') status.value = `Erreur : ${m.message}`
    }
    send({ type: 'init', seed, w, h, herbivores: 400, carnivores: 20, snapshot, elapsedMs })
  }

  function download(data: Uint8Array, name: string) {
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/octet-stream' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  /** Télécharge le monde courant dans un fichier .life (en plus de la sauvegarde navigateur). */
  function exportFile() {
    if (!ready.value) return
    pendingExport = true
    save()
  }

  /** Remplace le monde par celui d'un fichier .life. */
  async function importFile(file: File) {
    const data = new Uint8Array(await file.arrayBuffer())
    const info = snapshotInfo(data)
    if (!info) {
      saveError.value = 'Ce fichier n’est pas une sauvegarde valide.'
      return
    }
    const store = saveStore ?? createSaveStore()
    try {
      await store.save(data, { savedAt: Date.now(), tick: info.tick, seed: info.seed })
    } catch (err) {
      saveError.value = `Import impossible : ${err}`
      return
    }
    pendingImport = true
    await start()
  }

  /** Efface la sauvegarde et repart d'un nouveau monde (graine aléatoire). */
  async function newWorld() {
    try {
      await (saveStore ?? createSaveStore()).clear()
    } catch (err) {
      saveError.value = `Effacement impossible : ${err}`
    }
    forgetHistory(worldSeed)
    savedAt.value = null
    frame.value = null
    await start()
  }

  function stop() {
    if (autosave) clearInterval(autosave)
    autosave = null
    document.removeEventListener('visibilitychange', onHidden)
    window.removeEventListener('pagehide', save)
    worker?.terminate()
    worker = null
    ready.value = false
    catchup.value = null
  }

  /** Sélectionne la créature la plus proche de (x, y) dans `maxDist` cellules ; sinon désélectionne. */
  function pick(x: number, y: number, maxDist: number) {
    const f = frame.value
    let best = -1
    let bestD = maxDist * maxDist
    if (f) {
      for (let i = 0; i < f.count; i++) {
        const d = (f.x[i]! - x) ** 2 + (f.y[i]! - y) ** 2
        if (d <= bestD) {
          bestD = d
          best = i
        }
      }
    }
    select(best >= 0 ? f!.id[best]! : null)
    return best >= 0
  }

  function select(id: number | null) {
    selectedId.value = id
    if (id === null) lastSelected.value = null
    send({ type: 'select', id })
  }

  function setSpeed(s: Speed) {
    speed.value = s
    send({ type: 'setSpeed', speed: s })
  }

  return {
    status, ready, history, speed, ticksPerSecond, frame, terrain, restored, catchup, savedAt, saveError, persistent,
    selectedId, lastSelected, pick, select,
    start, stop, setSpeed, save, exportFile, importFile, newWorld,
    skipCatchup: () => send({ type: 'skipCatchup' }),
    spawn: (x: number, y: number, species: number, count: number) => send({ type: 'spawn', x, y, species, count }),
    rain: (value: number) => send({ type: 'rain', value }),
    meteor: (x: number, y: number, r: number) => send({ type: 'meteor', x, y, r }),
    bless: (x: number, y: number, r: number) => send({ type: 'bless', x, y, r }),
  }
})
