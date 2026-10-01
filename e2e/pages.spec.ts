import { expect, test } from '@playwright/test'

// Vérifie que le site fonctionne depuis un sous-dossier (GitHub Pages : /<dépôt>/) :
// toutes les ressources (JS, worker, WASM) se chargent, sans erreur 404 ni erreur console.
test('le site se charge et démarre le moteur (y compris sous un sous-dossier)', async ({ page }) => {
  const failed: string[] = []
  const errors: string[] = []
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`)
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto('./') // relatif à l'adresse de base (BASE_URL), pas à la racine du domaine
  await expect(page.getByTestId('status')).toContainText('Moteur WASM prêt')
  await expect(page.getByTestId('population')).toContainText('herbivores')
  expect(failed).toEqual([])
  expect(errors).toEqual([])
})
