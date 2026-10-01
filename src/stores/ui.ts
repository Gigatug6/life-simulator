import { defineStore } from 'pinia'
import { ref } from 'vue'

/** Display preferences (open/closed panels), remembered in the browser. */
export const useUiStore = defineStore('ui', () => {
  function readMode(): '2d' | '3d' {
    try {
      return localStorage.getItem('life-simulator:ui:mode') === '3d' ? '3d' : '2d'
    } catch {
      return '2d'
    }
  }
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
  /** Which world view is shown: the flat top-down view or the 3D view. */
  const mode = ref<'2d' | '3d'>(readMode())
  const menuOpen = ref(false)

  function toggleCharts() {
    chartsOpen.value = !chartsOpen.value
    try {
      localStorage.setItem('life-simulator:ui:charts', chartsOpen.value ? '1' : '0')
    } catch {
      /* non-critical preference */
    }
  }

  function toggleMode() {
    mode.value = mode.value === '3d' ? '2d' : '3d'
    try {
      localStorage.setItem('life-simulator:ui:mode', mode.value)
    } catch {
      /* non-critical preference */
    }
  }

  return { chartsOpen, menuOpen, mode, toggleCharts, toggleMode }
})
