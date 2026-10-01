/// <reference lib="webworker" />
import wasmUrl from './wasm/life.wasm?url'
import { loadEngine } from './engine'
import { SimController } from './controller'
import type { FromWorker, ToWorker } from './protocol'

const FRAME_MS = 33
const BUDGET_MS = 22 // max compute time per frame: the simulation slows down rather than freezing

let sim: SimController | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let enginePromise: ReturnType<typeof loadEngine> | null = null

const post = (m: FromWorker, transfer: Transferable[] = []) => postMessage(m, transfer)

function loop() {
  if (!sim) return
  if (sim.catchingUp) {
    const r = sim.stepCatchup(20)
    post({ type: 'catchup', ...r })
    timer = setTimeout(loop, 0) // lets messages through (skip, save)
    return
  }
  const t0 = performance.now()
  const ticks = sim.advance(BUDGET_MS)
  const frame = sim.frame()
  const dt = Math.max(performance.now() - t0, 1)
  const transfer: Transferable[] = [frame.x.buffer, frame.y.buffer, frame.angle.buffer, frame.energy.buffer, frame.species.buffer, frame.id.buffer, frame.size.buffer, frame.hue.buffer, frame.signal.buffer, frame.asleep.buffer]
  if (frame.grass) transfer.push(frame.grass.buffer)
  if (frame.selected) transfer.push(frame.selected.genome.buffer)
  post({ type: 'frame', frame, ticksPerSecond: (ticks / dt) * 1000 }, transfer)
  timer = setTimeout(loop, Math.max(FRAME_MS - dt, 1))
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  try {
    const msg = e.data
    if (msg.type === 'init') {
      enginePromise ??= loadEngine(fetch(wasmUrl))
      const engine = await enginePromise
      if (timer) clearTimeout(timer)
      sim = new SimController(engine)
      const restored = !!msg.snapshot && sim.restore(msg.snapshot)
      if (!restored) sim.init(msg.seed, msg.w, msg.h, msg.herbivores, msg.carnivores)
      if (restored && msg.elapsedMs && msg.elapsedMs > 5000) sim.beginCatchup(msg.elapsedMs)
      post({ type: 'ready', version: engine.version(), restored })
      const t = sim.terrain()
      post({ type: 'terrain', ...t }, [t.biome.buffer, t.altitude.buffer])
      loop()
    } else if (!sim) {
      return
    } else if (msg.type === 'skipCatchup') {
      sim.skipCatchup()
    } else if (msg.type === 'save') {
      const snap = sim.snapshot()
      post({ type: 'snapshot', ...snap }, [snap.data.buffer])
    } else if (msg.type === 'setSpeed') sim.speed = msg.speed
    else if (msg.type === 'spawn') sim.spawn(msg.x, msg.y, msg.species, msg.count)
    else if (msg.type === 'select') sim.selectedId = msg.id
    else if (msg.type === 'rain') sim.rain(msg.value)
    else if (msg.type === 'meteor') sim.meteor(msg.x, msg.y, msg.r)
    else if (msg.type === 'bless') sim.bless(msg.x, msg.y, msg.r)
  } catch (err) {
    post({ type: 'error', message: String(err) })
  }
}
