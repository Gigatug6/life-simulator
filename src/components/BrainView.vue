<script setup lang="ts">
import { computed } from 'vue'
import { INPUT_LABELS, OUTPUT_LABELS, describeBrain } from '../sim/brain'

const props = defineProps<{ genome: Float32Array }>()
const brain = computed(() => describeBrain(props.genome))

const W = 300
const ROW = 17
const colX = [78, 150, 232]
const inY = (i: number) => 14 + i * ROW
const hidY = (h: number) => 14 + h * ((INPUT_LABELS.length - 1) * ROW / Math.max(1, brain.value.hidden - 1)) * (brain.value.hidden > 1 ? 1 : 0) + (brain.value.hidden === 1 ? 70 : 0)
const outY = (o: number) => 34 + o * 40
const height = 14 + INPUT_LABELS.length * ROW

const links = computed(() => {
  const b = brain.value
  const out: { x1: number; y1: number; x2: number; y2: number; w: number }[] = []
  b.w1.forEach((row, h) => row.forEach((w, i) => out.push({ x1: colX[0]!, y1: inY(i), x2: colX[1]!, y2: hidY(h), w })))
  b.w2.forEach((row, o) => row.forEach((w, h) => out.push({ x1: colX[1]!, y1: hidY(h), x2: colX[2]!, y2: outY(o), w })))
  return out.filter((l) => Math.abs(l.w) > 0.25)
})
const stroke = (w: number) => (w > 0 ? '#6fd08c' : '#e8806f')
</script>

<template>
  <svg :viewBox="`0 0 ${W + 90} ${height}`" class="brain" role="img" aria-label="Schéma du cerveau" data-testid="brain">
    <line
      v-for="(l, k) in links"
      :key="k"
      :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2"
      :stroke="stroke(l.w)"
      :stroke-width="Math.min(2.5, Math.abs(l.w) * 1.2)"
      :opacity="Math.min(0.9, 0.2 + Math.abs(l.w) * 0.3)"
    />
    <g v-for="(label, i) in INPUT_LABELS" :key="'i' + i">
      <circle :cx="colX[0]" :cy="inY(i)" r="4" fill="#d7f0dc" />
      <text :x="colX[0]! - 8" :y="inY(i) + 3" text-anchor="end" class="lbl">{{ label }}</text>
    </g>
    <circle v-for="h in brain.hidden" :key="'h' + h" :cx="colX[1]" :cy="hidY(h - 1)" r="5" fill="#ffd23f" />
    <g v-for="(label, o) in OUTPUT_LABELS" :key="'o' + o">
      <circle :cx="colX[2]" :cy="outY(o)" r="4" fill="#d7f0dc" />
      <text :x="colX[2]! + 8" :y="outY(o) + 3" class="lbl">{{ label }}</text>
    </g>
  </svg>
</template>

<style scoped>
.brain { width: 100%; height: auto; display: block; }
.lbl { fill: #b8d4be; font-size: 8.5px; }
</style>
