<script setup lang="ts">
import { computed } from 'vue'
import { useWorldStore } from '../stores/world'
import LineChart from './LineChart.vue'

const world = useWorldStore()
const pts = computed(() => world.history)
const xs = computed(() => pts.value.map((p) => p.tick))
// Couleur = entité (jamais le rang) : herbivores bleu, carnivores orange — validées par validate_palette.js (dark).
const HERB = 'var(--series-1)'
const CARN = 'var(--series-2)'
const YEAR = 7200 // ticks par an (12 × 600)
const when = (t: number) => (t < 600 ? `tick ${t}` : t < YEAR ? `jour ${(t / 600).toFixed(1)}` : `an ${(t / YEAR).toFixed(1)}`)
const SERIES_POP = computed(() => [
  { name: 'Herbivores', color: HERB, values: pts.value.map((p) => p.herbivores) },
  { name: 'Carnivores', color: CARN, values: pts.value.map((p) => p.carnivores) },
])
const SERIES_IQ = computed(() => [
  { name: 'Herbivores', color: HERB, values: pts.value.map((p) => p.hiddenHerbivores) },
  { name: 'Carnivores', color: CARN, values: pts.value.map((p) => p.hiddenCarnivores) },
])
</script>

<template>
  <section v-if="xs.length > 1" class="charts" data-testid="charts" aria-label="Évolution du monde">
    <!-- axe y de l'intelligence : neurones cachés moyens (3 à 12) -->
    <LineChart title="Population" :xs="xs" :series="SERIES_POP" :x-format="when" test-id="chart-population" />
    <LineChart title="Intelligence moyenne" :xs="xs" :series="SERIES_IQ" :domain="[3, 12]" :format="(v) => v.toFixed(1)" :x-format="when" test-id="chart-intelligence" />
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
  width: 330px;
  max-width: 92vw;
  box-sizing: border-box;
  padding: .7rem .8rem .2rem;
  background: var(--surface);
  border-radius: 8px;
  margin-top: .5rem;
  pointer-events: auto;
}
</style>
