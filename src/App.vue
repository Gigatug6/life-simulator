<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useWorldStore } from './stores/world'
import { useUiStore } from './stores/ui'
import WorldView from './components/WorldView.vue'
import TopBar from './components/TopBar.vue'
import GodTools from './components/GodTools.vue'
import Inspector from './components/Inspector.vue'
import Charts from './components/Charts.vue'

const world = useWorldStore()
const ui = useUiStore()
onMounted(() => world.start())
onUnmounted(() => world.stop())
</script>

<template>
  <WorldView />
  <div class="overlay">
    <TopBar />
    <div class="mid">
      <div class="side left"><Charts v-if="ui.chartsOpen" /></div>
      <div class="side right"><Inspector /></div>
    </div>
    <GodTools />
  </div>
</template>

<style>
html, body { margin: 0; height: 100%; overflow: hidden; }
body { background: #0b1410; color: #d7f0dc; font-family: system-ui, sans-serif; }
.overlay { position: fixed; inset: 0; display: flex; flex-direction: column; pointer-events: none; }
.overlay > * { pointer-events: auto; }
.mid { flex: 1; min-height: 0; display: flex; justify-content: space-between; align-items: flex-start; pointer-events: none; }
.mid > .side { pointer-events: none; min-height: 0; max-height: 100%; overflow: auto; }
.mid > .side > * { pointer-events: auto; }
@media (max-width: 640px) {
  .mid { flex-direction: column; justify-content: flex-start; }
  .mid > .side.left { max-height: 38vh; }
}
</style>
