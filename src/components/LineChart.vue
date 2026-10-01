<script setup lang="ts">
import { computed, ref } from 'vue'

export interface ChartSeries {
  name: string
  color: string // CSS variable (e.g. var(--series-1))
  values: number[]
}

const props = defineProps<{
  title: string
  xs: number[]
  series: ChartSeries[]
  /** Fixed y domain; otherwise [0, max]. */
  domain?: [number, number]
  format?: (v: number) => string
  xFormat?: (x: number) => string
  testId?: string
}>()

const W = 300
const H = 110
const M = { l: 34, r: 8, t: 8, b: 18 }
const fmt = (v: number) => (!Number.isFinite(v) ? '—' : props.format ? props.format(v) : String(Math.round(v)))
const xfmt = (x: number) => (props.xFormat ? props.xFormat(x) : String(x))

const yDomain = computed<[number, number]>(() => {
  if (props.domain) return props.domain
  const max = Math.max(1, ...props.series.flatMap((s) => s.values).filter(Number.isFinite))
  return [0, niceMax(max)]
})
function niceMax(v: number) {
  const p = 10 ** Math.floor(Math.log10(v))
  for (const k of [1, 2, 5, 10]) if (v <= k * p) return k * p
  return v
}
const xDomain = computed<[number, number]>(() => [props.xs[0] ?? 0, Math.max(props.xs[props.xs.length - 1] ?? 1, (props.xs[0] ?? 0) + 1)])
const sx = (x: number) => M.l + ((x - xDomain.value[0]) / (xDomain.value[1] - xDomain.value[0])) * (W - M.l - M.r)
const sy = (y: number) => {
  const [a, b] = yDomain.value
  return H - M.b - ((y - a) / (b - a || 1)) * (H - M.t - M.b)
}
const yTicks = computed(() => {
  const [a, b] = yDomain.value
  return [a, (a + b) / 2, b]
})
const paths = computed(() =>
  props.series.map((s) => ({
    ...s,
    // missing values (NaN: species gone) break the line
    d: s.values.map((v, i) => (Number.isFinite(v) ? `${i > 0 && Number.isFinite(s.values[i - 1]!) ? 'L' : 'M'}${sx(props.xs[i]!).toFixed(1)},${sy(v).toFixed(1)}` : '')).join(''),
    last: s.values.length && Number.isFinite(s.values[s.values.length - 1]!) ? { x: sx(props.xs[props.xs.length - 1]!), y: sy(s.values[s.values.length - 1]!), v: s.values[s.values.length - 1]! } : null,
  })),
)

// hover: crosshair + tooltip on the nearest sample
const hover = ref<number | null>(null)
function onMove(e: PointerEvent) {
  const svg = e.currentTarget as SVGSVGElement
  const r = svg.getBoundingClientRect()
  const x = ((e.clientX - r.left) / r.width) * W
  let best = 0
  let bd = Infinity
  props.xs.forEach((v, i) => {
    const d = Math.abs(sx(v) - x)
    if (d < bd) {
      bd = d
      best = i
    }
  })
  hover.value = props.xs.length ? best : null
}
const tip = computed(() => {
  const i = hover.value
  if (i === null || i >= props.xs.length) return null
  return { x: sx(props.xs[i]!), left: sx(props.xs[i]!) > W * 0.6, label: xfmt(props.xs[i]!), rows: props.series.map((s) => ({ name: s.name, color: s.color, v: fmt(s.values[i]!) })) }
})

const showTable = ref(false)
const tableRows = computed(() => props.xs.map((x, i) => ({ x, vals: props.series.map((s) => s.values[i]!) })).slice(-12).reverse())
</script>

<template>
  <figure class="chart" :data-testid="testId">
    <figcaption>
      <span class="title">{{ title }}</span>
      <span v-if="series.length > 1" class="legend">
        <span v-for="s in series" :key="s.name"><i :style="{ background: s.color }"></i>{{ s.name }}</span>
      </span>
    </figcaption>
    <div class="plot">
      <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="title" @pointermove="onMove" @pointerleave="hover = null">
        <g class="grid">
          <line v-for="t in yTicks" :key="t" :x1="M.l" :x2="W - M.r" :y1="sy(t)" :y2="sy(t)" />
        </g>
        <text v-for="t in yTicks" :key="'l' + t" :x="M.l - 4" :y="sy(t) + 3" text-anchor="end" class="axis">{{ fmt(t) }}</text>
        <text :x="M.l" :y="H - 4" class="axis">{{ xs.length ? xfmt(xs[0]!) : '' }}</text>
        <text :x="W - M.r" :y="H - 4" text-anchor="end" class="axis">{{ xs.length ? xfmt(xs[xs.length - 1]!) : '' }}</text>
        <path v-for="p in paths" :key="p.name" :d="p.d" fill="none" :stroke="p.color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        <g v-for="p in paths" :key="'e' + p.name">
          <circle v-if="p.last" :cx="p.last.x" :cy="p.last.y" r="3.5" :fill="p.color" class="ring" />
        </g>
        <g v-if="tip">
          <line :x1="tip.x" :x2="tip.x" :y1="M.t" :y2="H - M.b" class="cross" />
          <template v-for="(p, k) in paths" :key="'h' + k">
            <circle v-if="Number.isFinite(p.values[hover!]!)" :cx="tip.x" :cy="sy(p.values[hover!]!)" r="3.5" :fill="p.color" class="ring" />
          </template>
        </g>
      </svg>
      <div v-if="tip" class="tip" :style="tip.left ? { right: `${(1 - tip.x / W) * 100 + 2}%` } : { left: `${(tip.x / W) * 100 + 2}%` }">
        <div class="tt">{{ tip.label }}</div>
        <div v-for="r in tip.rows" :key="r.name"><i :style="{ background: r.color }"></i>{{ r.name }} <b>{{ r.v }}</b></div>
      </div>
    </div>
    <button class="tbl" :aria-expanded="showTable" @click="showTable = !showTable">{{ showTable ? 'Masquer le tableau' : 'Voir le tableau' }}</button>
    <table v-if="showTable">
      <thead>
        <tr><th>Temps</th><th v-for="s in series" :key="s.name">{{ s.name }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in tableRows" :key="r.x"><td>{{ xfmt(r.x) }}</td><td v-for="(v, k) in r.vals" :key="k">{{ fmt(v) }}</td></tr>
      </tbody>
    </table>
  </figure>
</template>

<style scoped>
.chart { margin: 0 0 .7rem; color: var(--text-primary); }
figcaption { display: flex; justify-content: space-between; align-items: baseline; gap: .5rem; margin-bottom: .15rem; }
.title { font-weight: 600; font-size: 13px; }
.legend { display: flex; gap: .7rem; font-size: 12px; color: var(--text-secondary); }
.legend i, .tip i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
.plot { position: relative; }
svg { width: 100%; height: auto; display: block; touch-action: none; }
.grid line { stroke: var(--grid); stroke-width: 1; }
.axis { fill: var(--text-muted); font-size: 8.5px; }
.cross { stroke: var(--text-muted); stroke-width: 1; stroke-dasharray: 2 2; }
.ring { stroke: var(--surface); stroke-width: 2; }
.tip { position: absolute; top: 0; pointer-events: none; background: var(--surface-raised); border: 1px solid var(--grid); border-radius: 6px; padding: 4px 8px; font-size: 12px; white-space: nowrap; color: var(--text-primary); }
.tt { color: var(--text-secondary); margin-bottom: 2px; }
.tbl { background: none; border: 0; color: var(--text-secondary); font-size: 11px; text-decoration: underline; cursor: pointer; padding: 0; }
table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: .3rem; color: var(--text-secondary); }
th, td { text-align: right; padding: 1px 4px; }
th:first-child, td:first-child { text-align: left; }
</style>
