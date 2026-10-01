<script setup lang="ts">
import { computed } from 'vue'
import { useWorldStore } from '../stores/world'
import BrainView from './BrainView.vue'
import { lineageCss } from '../render/creatureColor'

const world = useWorldStore()
const info = computed(() => world.lastSelected)
const alive = computed(() => !!world.frame?.selected)
const SPECIES = ['Herbivore', 'Carnivore']
</script>

<template>
  <aside v-if="world.selectedId !== null && info" class="inspector" data-testid="inspector">
    <header>
      <strong>{{ SPECIES[info.species] ?? 'Créature' }} #{{ info.id }}</strong>
      <button aria-label="Fermer" @click="world.select(null)">×</button>
    </header>
    <p v-if="!alive" class="dead" data-testid="inspector-dead">Cette créature est morte.</p>
    <dl>
      <dt>Énergie</dt><dd data-testid="inspector-energy">{{ info.energy.toFixed(1) }}</dd>
      <dt>Âge</dt><dd>{{ info.age }} ticks</dd>
      <dt>Génération</dt><dd>{{ info.generation }}</dd>
      <dt>Neurones cachés</dt><dd data-testid="inspector-hidden">{{ info.hidden }}</dd>
      <dt>Taille</dt><dd data-testid="inspector-size">×{{ info.traits.size.toFixed(2) }}</dd>
      <dt>Vitesse</dt><dd>×{{ info.traits.speed.toFixed(2) }}</dd>
      <dt>Vision</dt><dd>×{{ info.traits.vision.toFixed(2) }}</dd>
      <dt>Lignée</dt><dd><span class="swatch" :style="{ background: lineageCss(info.species, info.traits.hue) }"></span></dd>
    </dl>
    <BrainView :genome="info.genome" />
    <p class="legend"><span class="pos">vert = excite</span> · <span class="neg">rouge = inhibe</span></p>
  </aside>
</template>

<style scoped>
.inspector { width: min(340px, 92vw); box-sizing: border-box; padding: .8rem; background: rgba(7, 13, 10, 0.85); border-bottom-left-radius: 10px; font-size: 13px; }
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: .4rem; }
button { background: none; border: 0; color: #d7f0dc; font-size: 1.2rem; cursor: pointer; }
dl { display: grid; grid-template-columns: auto 1fr; gap: .15rem .8rem; margin: .3rem 0 .6rem; }
dt { color: #94b59b; }
dd { margin: 0; }
.dead { color: #ff8a80; margin: .2rem 0; }
.swatch { display: inline-block; width: 14px; height: 14px; border-radius: 50%; vertical-align: middle; border: 1px solid #ffffff55; }
.legend { margin: .3rem 0 0; color: #94b59b; font-size: 11px; }
.pos { color: #6fd08c; }
.neg { color: #e8806f; }
</style>
