<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useWorldStore } from './stores/world'
import { SPEEDS } from './sim/protocol'
import WorldView from './components/WorldView.vue'

const world = useWorldStore()
onMounted(() => world.start())
onUnmounted(() => world.stop())
const SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver']
</script>

<template>
  <WorldView />
  <main class="hud">
    <h1>Simulateur de vie</h1>
    <p data-testid="status">{{ world.status }}</p>
    <p v-if="world.catchup" data-testid="catchup">
      Rattrapage du temps écoulé… {{ Math.round((100 * world.catchup.done) / world.catchup.total) }} %
      <progress :value="world.catchup.done" :max="world.catchup.total"></progress>
      <button @click="world.skipCatchup()">Passer</button>
    </p>
    <template v-if="world.frame">
      <p data-testid="ticks">Tick : {{ world.frame.tick }} · {{ SEASONS[world.frame.season] }}</p>
      <p data-testid="population">
        Population : {{ world.frame.count }} (herbivores {{ world.frame.herbivores }}, carnivores {{ world.frame.carnivores }})
      </p>
      <p>Cerveau moyen : {{ world.frame.hiddenHerbivores.toFixed(2) }} neurones cachés · {{ Math.round(world.ticksPerSecond) }} ticks/s</p>
    </template>
    <p v-if="world.saveError" class="err" data-testid="save-error">{{ world.saveError }}</p>
    <p data-testid="saved">
      {{ world.savedAt ? 'Sauvegardé à ' + new Date(world.savedAt).toLocaleTimeString('fr-FR') : world.persistent ? 'Sauvegarde automatique toutes les 10 s' : 'Sauvegarde indisponible (mémoire seulement)' }}
      <button @click="world.save()">Sauvegarder</button>
    </p>
    <div>
      <button v-for="s in SPEEDS" :key="s" :disabled="world.speed === s" @click="world.setSpeed(s)">
        {{ s === 0 ? 'Pause' : '×' + s }}
      </button>
    </div>
  </main>
</template>

<style>
body { margin: 0; background: #0b1410; color: #d7f0dc; font-family: system-ui, sans-serif; }
main.hud { position: fixed; top: 0; left: 0; padding: 1rem; background: rgba(7, 13, 10, 0.72); border-bottom-right-radius: 8px; font-size: 14px; }
main.hud h1 { font-size: 1.1rem; margin: 0 0 .4rem; }
main.hud p { margin: .15rem 0; }
button { margin-right: .5rem; }
.err { color: #ff8a80; }
</style>
