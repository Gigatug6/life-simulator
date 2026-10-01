import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useWorldStore } from './world'
import { METEOR_FALL } from '../render/effects'

export type Tool = 'observe' | 'inspect' | 'herbivore' | 'carnivore' | 'meteor' | 'bless'

export const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'observe', label: 'Observer', hint: 'Regarder sans intervenir' },
  { id: 'inspect', label: 'Inspecter', hint: 'Cliquer une créature pour voir son cerveau' },
  { id: 'herbivore', label: 'Herbivores', hint: 'Fait apparaître 10 herbivores' },
  { id: 'carnivore', label: 'Carnivores', hint: 'Fait apparaître 4 carnivores' },
  { id: 'meteor', label: 'Météorite', hint: 'Détruit tout dans le rayon' },
  { id: 'bless', label: 'Bénédiction', hint: 'Énergie et herbe au maximum dans le rayon' },
]

/** Tools of the "God" mode: the active tool applies on a click on the world. */
export const useGodStore = defineStore('god', () => {
  const tool = ref<Tool>('observe')
  const radius = ref(10) // cells
  const message = ref('')

  function apply(x: number, y: number, zoom = 4) {
    const world = useWorldStore()
    switch (tool.value) {
      case 'inspect':
        // 14 px tolerance on screen
        message.value = world.pick(x, y, Math.max(1.5, 14 / zoom)) ? 'Créature sélectionnée' : 'Aucune créature ici'
        break
      case 'herbivore':
        world.pushEffect({ kind: 'spawn', x, y, radius: 3, species: 0 })
        world.spawn(x, y, 0, 10)
        message.value = 'Herbivores créés'
        break
      case 'carnivore':
        world.pushEffect({ kind: 'spawn', x, y, radius: 3, species: 1 })
        world.spawn(x, y, 1, 4)
        message.value = 'Carnivores créés'
        break
      case 'meteor': {
        // the meteor is seen falling first: the engine hit lands when the fireball does
        const r = radius.value
        world.pushEffect({ kind: 'meteor', x, y, radius: r })
        setTimeout(() => world.meteor(x, y, r), METEOR_FALL * 1000)
        message.value = 'Météorite !'
        break
      }
        message.value = 'Météorite !'
        break
      case 'bless':
        world.pushEffect({ kind: 'bless', x, y, radius: radius.value })
        world.bless(x, y, radius.value)
        message.value = 'Bénédiction accordée'
        break
    }
  }

  /** Rain (1), drought (-1) or back to normal (0). */
  function weather(v: number) {
    useWorldStore().rain(v)
    message.value = v > 0 ? 'Il pleut' : v < 0 ? 'Sécheresse' : 'Temps normal'
  }

  return { tool, radius, message, apply, weather }
})
