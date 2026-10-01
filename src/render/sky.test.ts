import { describe, expect, it } from 'vitest'
import { DAY_LEN, YEAR_LEN, skyAt } from './sky'
import { applySeason, seasonFactors, snowLine } from './seasons'

describe('skyAt', () => {
  it('follows the engine clock: noon at tick 300, midnight at tick 0', () => {
    const noon = skyAt(DAY_LEN / 2)
    const midnight = skyAt(0)
    expect(noon.elevation).toBeCloseTo(1)
    expect(midnight.elevation).toBeCloseTo(-1)
    expect(noon.day).toBe(1)
    expect(midnight.day).toBe(0)
    expect(skyAt(DAY_LEN * 7 + 300).elevation).toBeCloseTo(1) // periodic
  })

  it('moves the sun from east (+x) in the morning to west (-x) in the evening', () => {
    expect(skyAt(DAY_LEN * 0.27).sunDir[0]).toBeGreaterThan(0.5)
    expect(skyAt(DAY_LEN * 0.73).sunDir[0]).toBeLessThan(-0.5)
    for (const t of [0, 50, 150, 300, 450, 550]) {
      const [x, y, z] = skyAt(t).sunDir
      expect(Math.hypot(x, y, z)).toBeCloseTo(1) // a unit vector
    }
  })

  it('is bright by day, dark by night, and warm at dusk', () => {
    const lum = (c: number[]) => c[0]! + c[1]! + c[2]!
    expect(lum(skyAt(300).horizon)).toBeGreaterThan(lum(skyAt(0).horizon) * 4)
    expect(skyAt(300).lightIntensity).toBeGreaterThan(skyAt(0).lightIntensity * 2)
    const dusk = skyAt(DAY_LEN * 0.27) // sun just above the horizon
    expect(dusk.dusk).toBeGreaterThan(0.6)
    expect(dusk.horizon[0]).toBeGreaterThan(dusk.horizon[2]) // orange: more red than blue
    expect(skyAt(300).dusk).toBeLessThan(0.05)
    const moon = skyAt(0).lightColor
    expect(moon[2]).toBeGreaterThan(moon[0]) // the moon is bluish
  })
})

describe('seasons', () => {
  it('peaks autumn in the middle of autumn and winter in the middle of winter', () => {
    expect(seasonFactors(YEAR_LEN * 0.625).autumn).toBeCloseTo(1)
    expect(seasonFactors(YEAR_LEN * 0.875).winter).toBeCloseTo(1)
    expect(seasonFactors(YEAR_LEN * 0.375)).toEqual({ autumn: 0, winter: 0 }) // mid-summer
    expect(seasonFactors(0).winter).toBeCloseTo(1 - 0.125 / 0.17, 5) // winter wraps around into early spring (0.125 from its centre)
    expect(seasonFactors(YEAR_LEN + YEAR_LEN * 0.875).winter).toBeCloseTo(1) // periodic
  })

  it('puts snow on high ground in winter only, never on water', () => {
    const colour = () => [60, 110, 50, 255]
    const mountainWinter = colour()
    applySeason(mountainWinter, 0, 5, 0.9, { autumn: 0, winter: 1 })
    expect(mountainWinter[0]).toBeGreaterThan(200) // white-ish
    const lowlandWinter = colour()
    applySeason(lowlandWinter, 0, 3, 0.45, { autumn: 0, winter: 1 })
    expect(lowlandWinter[0]).toBeLessThan(mountainWinter[0]!) // only a light frost down there
    expect(lowlandWinter[0]).toBeGreaterThan(60)
    const sea = colour()
    applySeason(sea, 0, 1, 0.9, { autumn: 0, winter: 1 })
    expect(sea).toEqual(colour()) // water is untouched
    const summer = colour()
    applySeason(summer, 0, 5, 0.9, { autumn: 0, winter: 0 })
    expect(summer).toEqual(colour())
    expect(snowLine(1)).toBeLessThan(snowLine(0)) // the snow line drops in winter
  })

  it('turns plains and forests orange in autumn, but not mountains or water', () => {
    const forest = [31, 122, 48, 255]
    applySeason(forest, 0, 4, 0.6, { autumn: 1, winter: 0 })
    expect(forest[0]).toBeGreaterThan(100)
    expect(forest[0]).toBeGreaterThan(forest[1]! - 40) // red catches up with green: orange foliage
    const rock = [125, 122, 117, 255]
    applySeason(rock, 0, 5, 0.9, { autumn: 1, winter: 0 })
    expect(rock).toEqual([125, 122, 117, 255])
  })
})
