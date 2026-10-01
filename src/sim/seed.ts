/** World seed from the page address: `?seed=13` makes a fresh world reproducible (and shareable). */
export function parseSeed(search: string): number | null {
  const v = new URLSearchParams(search).get('seed')
  if (v === null || !/^\d{1,10}$/.test(v)) return null
  const n = Number(v)
  return n <= 0xffffffff ? n : null // the engine seed is a u32
}
