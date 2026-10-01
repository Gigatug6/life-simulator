<script setup lang="ts">
import { computed } from 'vue'
import { useWorldStore } from '../stores/world'
import { useUiStore } from '../stores/ui'
import { SPEEDS } from '../sim/protocol'
import { levelOf } from '../sim/intelligence'

const world = useWorldStore()
const ui = useUiStore()
const SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver']
const f = computed(() => world.frame)
// intelligence du monde : celle des herbivores (espèce de base), à défaut des carnivores
const iq = computed(() => f.value?.iqHerbivores ?? f.value?.iqCarnivores ?? null)

function onImport(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) {
    ui.menuOpen = false
    world.importFile(file)
  }
}
function onNewWorld() {
  ui.menuOpen = false
  if (window.confirm('Effacer ce monde et en créer un nouveau ?')) world.newWorld()
}
</script>

<template>
  <header class="topbar">
    <strong class="brand">Simulateur de vie</strong>
    <template v-if="f">
      <span class="chip" data-testid="ticks">Tick : {{ f.tick }} · {{ SEASONS[f.season] }} · {{ f.daylight > 0.5 ? 'jour' : 'nuit' }}</span>
      <span v-if="iq !== null" class="chip" data-testid="iq" title="Compétence comportementale moyenne : 0 = hasard, 100 = parfaite">Intelligence : {{ Math.round(iq) }} · {{ levelOf(iq).name }}</span>
      <span class="chip" data-testid="population">Population : {{ f.count }} (herbivores {{ f.herbivores }}, carnivores {{ f.carnivores }})</span>
    </template>
    <span class="speeds" role="group" aria-label="Vitesse">
      <button v-for="s in SPEEDS" :key="s" :class="{ on: world.speed === s }" :disabled="world.speed === s" @click="world.setSpeed(s)">
        {{ s === 0 ? 'Pause' : '×' + s }}
      </button>
    </span>
    <span class="grow"></span>
    <button :class="{ on: ui.chartsOpen }" data-testid="charts-toggle" @click="ui.toggleCharts()">Courbes</button>
    <button :class="{ on: ui.menuOpen }" data-testid="menu-toggle" aria-haspopup="true" :aria-expanded="ui.menuOpen" @click="ui.menuOpen = !ui.menuOpen">Menu</button>

    <div v-if="ui.menuOpen" class="menu" role="menu" data-testid="menu">
      <p data-testid="saved" class="small">
        {{ world.savedAt ? 'Sauvegardé à ' + new Date(world.savedAt).toLocaleTimeString('fr-FR') : world.persistent ? 'Sauvegarde automatique toutes les 10 s' : 'Sauvegarde indisponible (mémoire seulement)' }}
      </p>
      <button role="menuitem" @click="world.save()">Sauvegarder</button>
      <button role="menuitem" data-testid="export" @click="world.exportFile()">Exporter</button>
      <label class="btn" role="menuitem">
        Importer
        <input type="file" accept=".life" data-testid="import-input" hidden @change="onImport" />
      </label>
      <button role="menuitem" class="danger" data-testid="new-world" @click="onNewWorld">Nouveau monde</button>
      <p v-if="f" class="small">Cerveau moyen {{ f.hiddenHerbivores.toFixed(1) }} neurones cachés · {{ Math.round(world.ticksPerSecond) }} ticks/s</p>
    </div>
    <span class="status" data-testid="status">{{ world.status }}</span>
  </header>
  <p v-if="world.catchup" class="banner" data-testid="catchup">
    Rattrapage du temps écoulé… {{ Math.round((100 * world.catchup.done) / world.catchup.total) }} %
    <progress :value="world.catchup.done" :max="world.catchup.total"></progress>
    <button @click="world.skipCatchup()">Passer</button>
  </p>
  <p v-if="world.saveError" class="banner err" data-testid="save-error">{{ world.saveError }}</p>
</template>

<style scoped>
.topbar { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: .4rem .6rem; padding: .5rem .8rem; background: rgba(7, 13, 10, 0.82); font-size: 13px; }
.brand { font-size: 14px; }
.chip { color: #c3d9c8; white-space: nowrap; }
.grow { flex: 1; }
.speeds { display: inline-flex; gap: .25rem; }
button, .btn { padding: .3rem .6rem; border: 1px solid #5c7a63; background: #14231a; color: #d7f0dc; border-radius: 6px; cursor: pointer; font-size: 13px; }
button.on { background: #2f7d46; border-color: #8be0a1; }
button:disabled { cursor: default; }
button.danger { border-color: #a05a52; color: #ffb4a8; }
.status { flex-basis: 100%; color: #7f9d86; font-size: 11px; }
.menu { position: absolute; top: 100%; right: .6rem; z-index: 20; display: flex; flex-direction: column; gap: .35rem; min-width: 220px; padding: .6rem; background: #14201a; border: 1px solid #3b5342; border-radius: 8px; box-shadow: 0 6px 20px #0008; }
.menu .btn { text-align: center; display: block; }
.small { margin: 0; font-size: 12px; color: #a9c4af; }
.banner { margin: 0; padding: .4rem .8rem; background: rgba(7, 13, 10, 0.82); font-size: 13px; }
.banner.err { color: #ff8a80; }
@media (max-width: 640px) {
  .brand { flex-basis: 100%; }
  .chip { white-space: normal; flex-basis: 100%; font-size: 12px; }
}
</style>
