<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useWorldStore } from './stores/world'
import { SPEEDS } from './sim/protocol'

const world = useWorldStore()
onMounted(() => world.start())
onUnmounted(() => world.stop())
const SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver']
</script>

<template>
  <main>
    <h1>Simulateur de vie</h1>
    <p data-testid="status">{{ world.status }}</p>
    <template v-if="world.frame">
      <p data-testid="ticks">Tick : {{ world.frame.tick }} · {{ SEASONS[world.frame.season] }}</p>
      <p data-testid="population">
        Population : {{ world.frame.count }} (herbivores {{ world.frame.herbivores }}, carnivores {{ world.frame.carnivores }})
      </p>
      <p>Cerveau moyen : {{ world.frame.hiddenHerbivores.toFixed(2) }} neurones cachés · {{ Math.round(world.ticksPerSecond) }} ticks/s</p>
    </template>
    <div>
      <button v-for="s in SPEEDS" :key="s" :disabled="world.speed === s" @click="world.setSpeed(s)">
        {{ s === 0 ? 'Pause' : '×' + s }}
      </button>
    </div>
  </main>
</template>

<style>
body { margin: 0; background: #0b1410; color: #d7f0dc; font-family: system-ui, sans-serif; }
main { padding: 2rem; }
button { margin-right: .5rem; }
</style>
