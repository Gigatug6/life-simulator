<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Renderer } from '../render/Renderer'
import { Renderer3D } from '../render/Renderer3D'
import type { WorldRenderer } from '../render/types'
import { useWorldStore } from '../stores/world'
import { useGodStore } from '../stores/god'
import { useUiStore } from '../stores/ui'

const world = useWorldStore()
const god = useGodStore()
const ui = useUiStore()
const canvas = ref<HTMLCanvasElement | null>(null)
let renderer: WorldRenderer | null = null

/** (Re)creates the renderer for the current mode on the current canvas and feeds it what we already know. */
function create() {
  if (!canvas.value) return
  const r: WorldRenderer = ui.mode === '3d' ? new Renderer3D(canvas.value) : new Renderer(canvas.value)
  r.onWorldClick = (x, y) => god.apply(x, y, r.pixelsPerCell)
  if (world.terrain) r.setTerrain(world.terrain.w, world.terrain.h, world.terrain.biome, world.terrain.altitude)
  if (world.grass) r.setGrass(world.grass)
  r.setEffectsEnabled(ui.effects)
  const f = world.frame
  if (f) {
    r.setWeather(f.rain)
    r.setDaylight(f.daylight)
    r.setClock(f.tick)
    r.setCreatures(f)
    r.setSelection(f.selected ? { x: f.selected.x, y: f.selected.y } : null)
  }
  renderer = r
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__lifeRenderer = r // dev-only handle for debugging / e2e
}

onMounted(create)
onUnmounted(() => renderer?.dispose())

// switching 2D <-> 3D needs a fresh canvas (a canvas cannot change its context type): the template re-keys it
watch(() => ui.mode, async () => {
  renderer?.dispose()
  renderer = null
  await nextTick()
  create()
})

watch(() => ui.effects, (on) => renderer?.setEffectsEnabled(on))
watch(() => world.lastEffect, (e) => e && renderer?.addEffect(e.effect))
watch(() => world.terrain, (t) => t && renderer?.setTerrain(t.w, t.h, t.biome, t.altitude))
watch(() => world.frame, (f) => {
  if (!f || !renderer) return
  if (f.grass) renderer.setGrass(f.grass)
  renderer.setWeather(f.rain)
  renderer.setDaylight(f.daylight)
  renderer.setClock(f.tick)
  renderer.setCreatures(f)
  renderer.setSelection(f.selected ? { x: f.selected.x, y: f.selected.y } : null)
})
</script>

<template>
  <canvas :key="ui.mode" ref="canvas" class="world"   :data-mode="ui.mode" :data-effects="ui.effects ? 'on' : 'off'" data-testid="world-canvas"></canvas>
</template>

<style scoped>
.world { position: fixed; inset: 0; width: 100vw; height: 100vh; display: block; touch-action: none; cursor: grab; }
.world:active { cursor: grabbing; }
</style>
