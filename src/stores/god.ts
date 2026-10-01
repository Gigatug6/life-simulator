import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useWorldStore } from './world'

export type Tool = 'observe' | 'herbivore' | 'carnivore' | 'meteor' | 'bless'

export const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'observe', label: 'Observer', hint: 'Regarder sans intervenir' },
  { id: 'herbivore', label: 'Herbivores', hint: 'Fait apparaître 10 herbivores' },
  { id: 'carnivore', label: 'Carnivores', hint: 'Fait apparaître 4 carnivores' },
  { id: 'meteor', label: 'Météorite', hint: 'Détruit tout dans le rayon' },
  { id: 'bless', label: 'Bénédiction', hint: 'Énergie et herbe au maximum dans le rayon' },
]

/** Outils du mode « Dieu » : l'outil actif s'applique au clic sur le monde. */
export const useGodStore = defineStore('god', () => {
  const tool = ref<Tool>('observe')
  const radius = ref(10) // cellules
  const message = ref('')

  function apply(x: number, y: number) {
    const world = useWorldStore()
    switch (tool.value) {
      case 'herbivore':
        world.spawn(x, y, 0, 10)
        message.value = 'Herbivores créés'
        break
      case 'carnivore':
        world.spawn(x, y, 1, 4)
        message.value = 'Carnivores créés'
        break
      case 'meteor':
        world.meteor(x, y, radius.value)
        message.value = 'Météorite !'
        break
      case 'bless':
        world.bless(x, y, radius.value)
        message.value = 'Bénédiction accordée'
        break
    }
  }

  /** Pluie (1), sécheresse (-1) ou retour à la normale (0). */
  function weather(v: number) {
    useWorldStore().rain(v)
    message.value = v > 0 ? 'Il pleut' : v < 0 ? 'Sécheresse' : 'Temps normal'
  }

  return { tool, radius, message, apply, weather }
})
