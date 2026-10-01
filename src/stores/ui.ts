import { defineStore } from 'pinia'
import { ref } from 'vue'

/** Display preferences (open/closed panels), remembered in the browser. */
export const useUiStore = defineStore('ui', () => {
  const read = (k: string, d: boolean) => {
    try {
      const v = localStorage.getItem(`life-simulator:ui:${k}`)
      return v === null ? d : v === '1'
    } catch {
      return d
    }
  }
  const wide = typeof window !== 'undefined' && window.innerWidth >= 900
  const chartsOpen = ref(read('charts', wide))
  const menuOpen = ref(false)

  function toggleCharts() {
    chartsOpen.value = !chartsOpen.value
    try {
      localStorage.setItem('life-simulator:ui:charts', chartsOpen.value ? '1' : '0')
    } catch {
      /* non-critical preference */
    }
  }

  return { chartsOpen, menuOpen, toggleCharts }
})
