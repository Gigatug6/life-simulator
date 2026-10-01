import { defineStore } from 'pinia'
import { markRaw, ref, shallowRef } from 'vue'
import { History, forgetHistory, loadHistory, saveHistory, type Sample } from '../sim/history'
import { snapshotInfo } from '../sim/snapshot'
import { createSaveStore, type SaveStore } from '../persist/store'
import SimWorker from '../sim/worker?worker'
import { SPEEDS } from '../sim/protocol'
import { parseSeed } from '../sim/seed'
import type { WorldEffect } from '../render/effects'
import type { Frame, Inspected, FromWorker, Speed, ToWorker } from '../sim/protocol'

/** World state on the UI side. Typed arrays stay out of deep reactivity. */
export const useWorldStore = defineStore('world', () => {
  const status = ref('Chargement du moteur…')
  const ready = ref(false)
  const SPEED_KEY = 'life-simulator:ui:speed'
  /** The chosen speed (pause included) is remembered across reloads. */
  const readSpeed = (): Speed => {
    try {
      const v = Number(localStorage.getItem(SPEED_KEY))
      return (SPEEDS as readonly number[]).includes(v) && localStorage.getItem(SPEED_KEY) !== null ? (v as Speed) : 1
    } catch {
      return 1
    }
  }
  const speed = ref<Speed>(readSpeed())
  const ticksPerSecond = ref(0)
  const frame = shallowRef<Frame | null>(null)
  const terrain = shallowRef<{ w: number; h: number; biome: Uint8Array; altitude: Float32Array } | null>(null)
  /** Latest visual event of a "God" power; the id changes on every event so that watchers fire even for equal ones. */
  const lastEffect = shallowRef<{ id: number; effect: WorldEffect } | null>(null)
  let effectId = 0
  const pushEffect = (effect: WorldEffect) => (lastEffect.value = { id: ++effectId, effect })
  /** Latest grass layer (the frames only carry it now and then); renderers created later start from it. */
  const grass = shallowRef<Float32Array | null>(null)
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
  let startGen = 0 // number of the latest start: an older start that is still pending gives up
  let saveStore: SaveStore | null = null
  let pendingExport = false
  let pendingImport = false
  let autosave: ReturnType<typeof setTimeout> | null = null
  let autosaveMs = 10_000
  let writing = false

  const send = (m: ToWorker) => worker?.postMessage(m)

  const onHidden = () => {
    if (document.visibilityState === 'hidden') save()
  }

  /** Autosave: every 10 s, spaced out when the world is big (≈ 2 s per MB, max 60 s). */
  function scheduleAutosave() {
    if (autosave) clearTimeout(autosave)
    autosave = setTimeout(() => {
      save()
      scheduleAutosave()
    }, autosaveMs)
  }

  /** Asks the worker for a snapshot; the write happens here (the main thread survives pagehide). */
  function save() {
    if (ready.value) send({ type: 'save' })
  }

  // a fresh world uses the seed of the page address (?seed=N) when there is one, otherwise a random seed
  async function start(seed = parseSeed(location.search) ?? Math.floor(Math.random() * 2 ** 32), w = 256, h = 256) {
    stop()
    const gen = ++startGen
    status.value = 'Chargement du moteur…'
    frame.value = null
    grass.value = null
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
    if (gen !== startGen) return // another start (or a stop) happened while the save was being read
    // chart history: resumed for the same world, truncated at the save instant
    hist = snapshot ? loadHistory(worldSeed) : new History()
    hist.pruneAfter(savedTick)
    history.value = hist.points.slice()
    worker = new SimWorker()
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data
      if (m.type === 'ready') {
        ready.value = true
        restored.value = m.restored
        send({ type: 'setSpeed', speed: speed.value }) // the worker starts at ×1: apply the remembered speed
        if (pendingImport) {
          pendingImport = false
          if (!m.restored) saveError.value = 'Fichier de sauvegarde invalide ou incompatible : un nouveau monde a été créé.'
        }
        status.value = m.restored ? `Monde repris depuis la sauvegarde (v${m.version})` : `Moteur WASM prêt (v${m.version})`
        scheduleAutosave()
        document.addEventListener('visibilitychange', onHidden)
        window.addEventListener('pagehide', save)
      } else if (m.type === 'terrain') terrain.value = markRaw(m)
      else if (m.type === 'frame') {
        frame.value = markRaw(m.frame)
        if (m.frame.grass) grass.value = markRaw(m.frame.grass)
        const fr = m.frame
        if (hist.push({ tick: fr.tick, herbivores: fr.herbivores, carnivores: fr.carnivores, hiddenHerbivores: fr.hiddenHerbivores, hiddenCarnivores: fr.hiddenCarnivores, iqHerbivores: fr.iqHerbivores, iqCarnivores: fr.iqCarnivores, body: fr.bodyHerbivores, kinds: fr.kindsHerbivores })) {
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
        autosaveMs = Math.min(60_000, Math.max(10_000, (m.data.length / 1e6) * 2000))
        if (writing) return // previous write still in progress: do not pile up
        writing = true
        store
          ?.save(m.data, { savedAt: Date.now(), ...m.meta })
          .then(() => {
            savedAt.value = Date.now()
            saveError.value = null
          })
          .catch((err) => (saveError.value = `Sauvegarde impossible : ${err}`))
          .finally(() => (writing = false))
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

  /** Downloads the current world as a .life file (in addition to the browser save). */
  function exportFile() {
    if (!ready.value) return
    pendingExport = true
    save()
  }

  /** Replaces the world with the one from a .life file. */
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

  /** Erases the save and starts over with a new world (random seed). */
  async function newWorld() {
    try {
      await (saveStore ?? createSaveStore()).clear()
    } catch (err) {
      saveError.value = `Effacement impossible : ${err}`
    }
    forgetHistory(worldSeed)
    savedAt.value = null
    frame.value = null
    grass.value = null
    await start(Math.floor(Math.random() * 2 ** 32)) // "New world" is always a different world, whatever the address says
  }

  function stop() {
    startGen++ // cancels a pending start
    if (autosave) clearTimeout(autosave)
    autosave = null
    document.removeEventListener('visibilitychange', onHidden)
    window.removeEventListener('pagehide', save)
    worker?.terminate()
    worker = null
    ready.value = false
    catchup.value = null
  }

  /** Selects the creature nearest to (x, y) within `maxDist` cells; otherwise deselects. */
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
    try {
      localStorage.setItem(SPEED_KEY, String(s))
    } catch {
      /* non-critical preference */
    }
    send({ type: 'setSpeed', speed: s })
  }

  return {
    status, ready, history, speed, ticksPerSecond, frame, terrain, grass, lastEffect, pushEffect, restored, catchup, savedAt, saveError, persistent,
    selectedId, lastSelected, pick, select,
    start, stop, setSpeed, save, exportFile, importFile, newWorld,
    skipCatchup: () => send({ type: 'skipCatchup' }),
    spawn: (x: number, y: number, species: number, count: number) => send({ type: 'spawn', x, y, species, count }),
    rain: (value: number) => send({ type: 'rain', value }),
    meteor: (x: number, y: number, r: number) => send({ type: 'meteor', x, y, r }),
    bless: (x: number, y: number, r: number) => send({ type: 'bless', x, y, r }),
  }
})
