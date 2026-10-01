import { describe, expect, it } from 'vitest'
import { parseSeed } from './seed'

describe('parseSeed', () => {
  it('reads a numeric seed from the query string', () => {
    expect(parseSeed('?seed=13')).toBe(13)
    expect(parseSeed('?a=1&seed=4294967295&b=2')).toBe(4294967295)
    expect(parseSeed('?seed=0')).toBe(0)
  })
  it('ignores missing, malformed or out-of-range seeds', () => {
    expect(parseSeed('')).toBeNull()
    expect(parseSeed('?seed=')).toBeNull()
    expect(parseSeed('?seed=abc')).toBeNull()
    expect(parseSeed('?seed=-5')).toBeNull()
    expect(parseSeed('?seed=1.5')).toBeNull()
    expect(parseSeed('?seed=4294967296')).toBeNull() // does not fit in a u32
    expect(parseSeed('?seed=99999999999')).toBeNull()
  })
})
