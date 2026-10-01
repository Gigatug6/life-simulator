import { describe, expect, it } from 'vitest'
import { METEOR_FALL, blessAlpha, clamp01, easeOut, effectDuration, meteorState, weatherLook } from './effects'

describe('meteorState', () => {
  it('falls first, then explodes at the impact', () => {
    const start = meteorState(0)
    expect(start).toMatchObject({ falling: true, fall: 0, flash: 0, waveAlpha: 0 })
    const mid = meteorState(METEOR_FALL / 2)
    expect(mid.falling).toBe(true)
    expect(mid.fall).toBeCloseTo(0.5)
    const hit = meteorState(METEOR_FALL)
    expect(hit.falling).toBe(false)
    expect(hit.fall).toBe(1)
    expect(hit.flash).toBe(1) // the flash is at full brightness at the impact
    expect(hit.wave).toBe(0)
  })

  it('the shock wave grows to a little more than the blast radius while fading', () => {
    const a = meteorState(METEOR_FALL + 0.2)
    const b = meteorState(METEOR_FALL + 0.6)
    const c = meteorState(METEOR_FALL + 1.5)
    expect(b.wave).toBeGreaterThan(a.wave)
    expect(c.wave).toBeCloseTo(1.15, 1)
    expect(c.waveAlpha).toBe(0)
    expect(a.waveAlpha).toBeGreaterThan(c.waveAlpha)
  })

  it('leaves a scorched mark that fades out by the end of the effect', () => {
    expect(meteorState(METEOR_FALL + 0.3).scorch).toBeGreaterThan(0.5)
    expect(meteorState(effectDuration('meteor')).scorch).toBeCloseTo(0, 5)
    expect(meteorState(METEOR_FALL + 0.3).flash).toBeGreaterThan(0)
    expect(meteorState(METEOR_FALL + 0.5).flash).toBe(0)
  })
})

describe('blessAlpha', () => {
  it('swells then fades, zero at both ends', () => {
    expect(blessAlpha(0)).toBe(0)
    expect(blessAlpha(effectDuration('bless'))).toBeCloseTo(0, 5)
    expect(blessAlpha(effectDuration('bless') / 2)).toBeCloseTo(1)
    expect(blessAlpha(0.3)).toBeLessThan(blessAlpha(1.0))
  })
})

describe('weatherLook', () => {
  it('rain dims the light and greys the sky; drought warms it', () => {
    const clear = weatherLook(0)
    expect(clear).toEqual({ rainAmount: 0, drought: 0, lightScale: 1, grey: 0, warm: 0 })
    const rain = weatherLook(1)
    expect(rain.rainAmount).toBe(1)
    expect(rain.lightScale).toBeLessThan(0.6)
    expect(rain.grey).toBeGreaterThan(0.5)
    const dry = weatherLook(-1)
    expect(dry.drought).toBe(1)
    expect(dry.warm).toBeGreaterThan(0.4)
    expect(dry.rainAmount).toBe(0)
    expect(dry.lightScale).toBeGreaterThanOrEqual(1) // no clouds in a drought
  })

  it('ignores the faint tail of a fading rain and clamps out-of-range values', () => {
    expect(weatherLook(0.05).rainAmount).toBe(0)
    expect(weatherLook(-0.05).drought).toBe(0)
    expect(weatherLook(0.3).rainAmount).toBeCloseTo(0.3)
    expect(weatherLook(7).rainAmount).toBe(1)
    expect(weatherLook(-7).drought).toBe(1)
  })
})

describe('helpers', () => {
  it('clamp01 and easeOut stay within 0..1 and are monotonic', () => {
    expect(clamp01(-3)).toBe(0)
    expect(clamp01(9)).toBe(1)
    let prev = -1
    for (let u = 0; u <= 1.0001; u += 0.1) {
      const v = easeOut(u)
      expect(v).toBeGreaterThanOrEqual(prev)
      expect(v).toBeLessThanOrEqual(1)
      prev = v
    }
    expect(easeOut(0.5)).toBeGreaterThan(0.5) // fast start, slow finish
  })
})
