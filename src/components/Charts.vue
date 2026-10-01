<script setup lang="ts">
import { computed } from 'vue'
import { useWorldStore } from '../stores/world'
import LineChart from './LineChart.vue'

const world = useWorldStore()
const pts = computed(() => world.history)
const xs = computed(() => pts.value.map((p) => p.tick))
// Colour = entity (never the rank): herbivores blue, carnivores orange — validated with validate_palette.js (dark).
const HERB = 'var(--series-1)'
const CARN = 'var(--series-2)'
const YEAR = 7200 // ticks per year (12 × 600)
const when = (t: number) => (t < 600 ? `tick ${t}` : t < YEAR ? `jour ${(t / 600).toFixed(1)}` : `an ${(t / YEAR).toFixed(1)}`)
const SERIES_POP = computed(() => [
  { name: 'Herbivores', color: HERB, values: pts.value.map((p) => p.herbivores) },
  { name: 'Carnivores', color: CARN, values: pts.value.map((p) => p.carnivores) },
])
// Body-plan chart: the three lines are TRAITS (not species), so they use the first three validated
// categorical slots (blue, orange, aqua: the palette passes the all-pairs checks for 3 series) and the legend names them.
const trait = (pick: (b: { size: number; speed: number; vision: number }) => number) =>
  pts.value.map((p) => (p.body ? pick(p.body) : NaN))
const SERIES_BODY = computed(() => [
  { name: 'Taille', color: 'var(--series-1)', values: trait((b) => b.size) },
  { name: 'Vitesse', color: 'var(--series-2)', values: trait((b) => b.speed) },
  { name: 'Vision', color: 'var(--series-3)', values: trait((b) => b.vision) },
])

// Neuron-kind chart: share of the herbivores' hidden neurons that are not classic (tanh) — same three
// validated slots as the body chart; the legend names the kinds.
const kind = (pick: (k: { bump: number; step: number; wave: number }) => number) =>
  pts.value.map((p) => (p.kinds ? pick(p.kinds) * 100 : NaN))
const SERIES_KINDS = computed(() => [
  { name: 'Détecteur', color: 'var(--series-1)', values: kind((k) => k.bump) },
  { name: 'Interrupteur', color: 'var(--series-2)', values: kind((k) => k.step) },
  { name: 'Onde', color: 'var(--series-3)', values: kind((k) => k.wave) },
])

// intelligence index 0-100; NaN = species absent (line broken)
const iq = (v: number | null | undefined) => (typeof v === 'number' ? v : NaN)
const SERIES_IQ = computed(() => {
  const list = [{ name: 'Herbivores', color: HERB, values: pts.value.map((p) => iq(p.iqHerbivores)) }]
  const carn = pts.value.map((p) => iq(p.iqCarnivores))
  if (carn.some(Number.isFinite)) list.push({ name: 'Carnivores', color: CARN, values: carn })
  return list
})
</script>

<template>
  <section v-if="xs.length > 1" class="charts" data-testid="charts" aria-label="Évolution du monde">
    <LineChart title="Population" :xs="xs" :series="SERIES_POP" :x-format="when" test-id="chart-population" />
    <LineChart title="Corps des herbivores (moyenne)" :xs="xs" :series="SERIES_BODY" :domain="[0.6, 1.8]" :format="(v) => v.toFixed(2)" :x-format="when" test-id="chart-body" />
    <LineChart title="Types de neurones (% des herbivores)" :xs="xs" :series="SERIES_KINDS" :domain="[0, 100]" :format="(v) => Math.round(v) + ' %'" :x-format="when" test-id="chart-kinds" />
    <LineChart title="Intelligence (indice 0-100)" :xs="xs" :series="SERIES_IQ" :domain="[0, 100]" :format="(v) => String(Math.round(v))" :x-format="when" test-id="chart-intelligence" />
  </section>
</template>

<style scoped>
.charts {
  --surface: #1a1a19;
  --surface-raised: #242422;
  --text-primary: #ffffff;
  --text-secondary: #c3c2b7;
  --text-muted: #8f8e84;
  --grid: #3a3a37;
  --series-1: #3987e5;
  --series-2: #d95926;
  --series-3: #199e70;
  width: 330px;
  max-width: 92vw;
  box-sizing: border-box;
  padding: .7rem .8rem .2rem;
  background: var(--surface);
  border-radius: 8px;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}
</style>
