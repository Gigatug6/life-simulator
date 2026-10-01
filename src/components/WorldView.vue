<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { Renderer } from '../render/Renderer'
import { useWorldStore } from '../stores/world'

const world = useWorldStore()
const canvas = ref<HTMLCanvasElement | null>(null)
let renderer: Renderer | null = null

onMounted(() => {
  renderer = new Renderer(canvas.value!)
  if (world.terrain) renderer.setTerrain(world.terrain.w, world.terrain.h, world.terrain.biome)
})
onUnmounted(() => renderer?.dispose())

watch(() => world.terrain, (t) => t && renderer?.setTerrain(t.w, t.h, t.biome))
watch(() => world.frame, (f) => {
  if (!f || !renderer) return
  if (f.grass) renderer.setGrass(f.grass)
  renderer.setDaylight(f.daylight)
  renderer.setCreatures(f)
})
</script>

<template>
  <canvas ref="canvas" class="world" data-testid="world-canvas"></canvas>
</template>

<style scoped>
.world { position: fixed; inset: 0; width: 100vw; height: 100vh; display: block; touch-action: none; cursor: grab; }
.world:active { cursor: grabbing; }
</style>
