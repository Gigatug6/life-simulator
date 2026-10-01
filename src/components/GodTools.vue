<script setup lang="ts">
import { TOOLS, useGodStore } from '../stores/god'

const god = useGodStore()
</script>

<template>
  <nav class="tools" aria-label="Pouvoirs divins">
    <button
      v-for="t in TOOLS"
      :key="t.id"
      :class="{ on: god.tool === t.id }"
      :title="t.hint"
      :data-testid="'tool-' + t.id"
      @click="god.tool = t.id"
    >
      {{ t.label }}
    </button>
    <span class="sep"></span>
    <button data-testid="weather-rain" title="Pluie : l'herbe pousse plus vite" @click="god.weather(1)">Pluie</button>
    <button data-testid="weather-drought" title="Sécheresse : l'herbe se meurt" @click="god.weather(-1)">Sécheresse</button>
    <button data-testid="weather-clear" title="Temps normal" @click="god.weather(0)">Beau temps</button>
    <label v-if="god.tool === 'meteor' || god.tool === 'bless'" class="radius">
      Rayon {{ god.radius }}
      <input v-model.number="god.radius" type="range" min="3" max="40" data-testid="radius" />
    </label>
    <span v-if="god.message" class="msg" data-testid="god-message">{{ god.message }}</span>
  </nav>
</template>

<style scoped>
.tools { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; justify-content: center; padding: .6rem .8rem; max-width: 100vw; background: rgba(7, 13, 10, 0.78); border-top-left-radius: 10px; border-top-right-radius: 10px; font-size: 14px; }
button { padding: .4rem .7rem; border: 1px solid #5c7a63; background: #14231a; color: #d7f0dc; border-radius: 6px; cursor: pointer; }
button.on { background: #2f7d46; border-color: #8be0a1; }
.sep { width: 1px; align-self: stretch; background: #3b5342; }
.radius { display: flex; align-items: center; gap: .4rem; color: #d7f0dc; }
.msg { color: #ffd23f; }
</style>
