<script setup lang="ts">
import { computed } from 'vue'
import { INPUT_LABELS, NEURON_KINDS, OUTPUT_LABELS, describeBrain } from '../sim/brain'

const props = defineProps<{ genome: Float32Array }>()
const brain = computed(() => describeBrain(props.genome))

const W = 300
const ROW = 15
const colX = [82, 150, 232]
const inY = (i: number) => 12 + i * ROW
const height = 12 + INPUT_LABELS.length * ROW
// hidden neurons are spread over the height of the input column
const hidY = (h: number) => {
  const n = brain.value.hidden
  return n <= 1 ? height / 2 : 12 + (h * (INPUT_LABELS.length - 1) * ROW) / (n - 1)
}
const outY = (o: number) => 22 + (o * (height - 44)) / (OUTPUT_LABELS.length - 1)

const links = computed(() => {
  const b = brain.value
  const out: { x1: number; y1: number; x2: number; y2: number; w: number }[] = []
  b.w1.forEach((row, h) => row.forEach((w, i) => out.push({ x1: colX[0]!, y1: inY(i), x2: colX[1]!, y2: hidY(h), w })))
  b.w2.forEach((row, o) => row.forEach((w, h) => out.push({ x1: colX[1]!, y1: hidY(h), x2: colX[2]!, y2: outY(o), w })))
  return out.filter((l) => Math.abs(l.w) > 0.25)
})
const stroke = (w: number) => (w > 0 ? '#6fd08c' : '#e8806f')

/** Polygon points of a hidden neuron: its shape tells its kind (see NEURON_KINDS). */
function polygon(shape: string, cx: number, cy: number, r = 6): string {
  if (shape === 'diamond') return `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`
  if (shape === 'square') return `${cx - r + 1},${cy - r + 1} ${cx + r - 1},${cy - r + 1} ${cx + r - 1},${cy + r - 1} ${cx - r + 1},${cy + r - 1}`
  return `${cx},${cy - r} ${cx + r},${cy + r - 1} ${cx - r},${cy + r - 1}` // triangle
}
// the later-added senses and the light output are tinted so the new neurons are easy to spot
const isNewInput = (i: number) => i >= 10
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
      <circle :cx="colX[0]" :cy="inY(i)" r="3.6" :fill="isNewInput(i) ? '#9fd7ff' : '#d7f0dc'" />
      <text :x="colX[0]! - 8" :y="inY(i) + 3" text-anchor="end" class="lbl" :class="{ fresh: isNewInput(i) }">{{ label }}</text>
    </g>
    <g v-for="(kind, h) in brain.kinds" :key="'h' + h" :data-kind="NEURON_KINDS[kind]!.name">
      <circle v-if="NEURON_KINDS[kind]!.shape === 'circle'" :cx="colX[1]" :cy="hidY(h)" r="5.5" fill="#ffd23f" />
      <polygon v-else :points="polygon(NEURON_KINDS[kind]!.shape, colX[1]!, hidY(h))" fill="#ffb347" stroke="#fff3c4" stroke-width="0.8" />
    </g>
    <g v-for="(label, o) in OUTPUT_LABELS" :key="'o' + o">
      <circle :cx="colX[2]" :cy="outY(o)" r="3.6" :fill="o === 4 ? '#fff3a8' : '#d7f0dc'" />
      <text :x="colX[2]! + 8" :y="outY(o) + 3" class="lbl" :class="{ fresh: o === 4 }">{{ label }}</text>
    </g>
  </svg>
</template>

<style scoped>
.brain { width: 100%; height: auto; display: block; }
.lbl { fill: #b8d4be; font-size: 8px; }
.lbl.fresh { fill: #9fd7ff; }
</style>
