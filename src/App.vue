<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import SimWorker from './sim/worker?worker'
import type { FromWorker } from './sim/protocol'

const status = ref('Chargement du moteur…')
const ticks = ref(0)
let worker: Worker | null = null

onMounted(() => {
  worker = new SimWorker()
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const m = e.data
    if (m.type === 'ready') {
      status.value = `Moteur WASM prêt (v${m.version})`
      worker?.postMessage({ type: 'tick', n: 10 })
    } else if (m.type === 'ticked') ticks.value = m.total
    else if (m.type === 'error') status.value = `Erreur : ${m.message}`
  }
  worker.postMessage({ type: 'init' })
})
onUnmounted(() => worker?.terminate())
</script>

<template>
  <main>
    <h1>Simulateur de vie</h1>
    <p data-testid="status">{{ status }}</p>
    <p data-testid="ticks">Ticks : {{ ticks }}</p>
  </main>
</template>

<style>
body { margin: 0; background: #0b1410; color: #d7f0dc; font-family: system-ui, sans-serif; }
main { padding: 2rem; }
</style>
