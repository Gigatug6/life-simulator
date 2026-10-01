<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useWorldStore } from './stores/world'
import { SPEEDS } from './sim/protocol'
import WorldView from './components/WorldView.vue'
import GodTools from './components/GodTools.vue'
import Inspector from './components/Inspector.vue'
import Charts from './components/Charts.vue'

const world = useWorldStore()
onMounted(() => world.start())
onUnmounted(() => world.stop())
function onImport(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) world.importFile(file)
}
function onNewWorld() {
  if (window.confirm('Effacer ce monde et en créer un nouveau ?')) world.newWorld()
}
const SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver']
</script>

<template>
  <WorldView />
  <GodTools />
  <Inspector />
  <div class="left">
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
    <p>
      <button data-testid="export" @click="world.exportFile()">Exporter</button>
      <label class="btn">
        Importer
        <input type="file" accept=".life" data-testid="import-input" hidden @change="onImport" />
      </label>
      <button data-testid="new-world" @click="onNewWorld">Nouveau monde</button>
    </p>
    <div>
      <button v-for="s in SPEEDS" :key="s" :disabled="world.speed === s" @click="world.setSpeed(s)">
        {{ s === 0 ? 'Pause' : '×' + s }}
      </button>
    </div>
  </main>
  <Charts />
  </div>
</template>

<style>
body { margin: 0; background: #0b1410; color: #d7f0dc; font-family: system-ui, sans-serif; }
div.left { position: fixed; top: 0; left: 0; max-height: 100vh; overflow: auto; }
main.hud { padding: 1rem; background: rgba(7, 13, 10, 0.72); border-bottom-right-radius: 8px; font-size: 14px; }
main.hud h1 { font-size: 1.1rem; margin: 0 0 .4rem; }
main.hud p { margin: .15rem 0; }
button { margin-right: .5rem; }
.err { color: #ff8a80; }
.btn { display: inline-block; padding: 1px 6px; margin-right: .5rem; background: #efefef; color: #000; border: 1px solid #767676; border-radius: 3px; cursor: pointer; font-size: 13px; }
</style>
