/// <reference lib="webworker" />
import wasmUrl from './wasm/life.wasm?url'
import { loadEngine, type LifeExports } from './engine'
import type { FromWorker, ToWorker } from './protocol'

let engine: LifeExports | null = null
const post = (m: FromWorker) => postMessage(m)

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  try {
    const msg = e.data
    if (msg.type === 'init') {
      engine = await loadEngine(fetch(wasmUrl))
      post({ type: 'ready', version: engine.version() })
    } else if (msg.type === 'tick' && engine) {
      let total = 0
      for (let i = 0; i < msg.n; i++) total = engine.tick()
      post({ type: 'ticked', total })
    }
  } catch (err) {
    post({ type: 'error', message: String(err) })
  }
}
