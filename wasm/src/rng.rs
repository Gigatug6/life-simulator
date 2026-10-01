//! Deterministic xorshift64* RNG (same seed -> same world, native and WASM).
#[derive(Clone, Copy)]
pub struct Rng(pub u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        // splitmix64 avoids the all-zero state and spreads small seeds well
        let mut z = seed.wrapping_add(0x9E3779B97F4A7C15);
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
        Rng((z ^ (z >> 31)) | 1)
    }
    pub fn next_u32(&mut self) -> u32 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        (x.wrapping_mul(0x2545F4914F6CDD1D) >> 32) as u32
    }
    /// Float in [0, 1).
    pub fn next_f32(&mut self) -> f32 {
        (self.next_u32() >> 8) as f32 / 16_777_216.0
    }
    /// Approximate Gaussian (Irwin-Hall, 4 draws), standard deviation ~1.
    pub fn gauss(&mut self) -> f32 {
        let s = self.next_f32() + self.next_f32() + self.next_f32() + self.next_f32();
        (s - 2.0) * 1.732
    }
}

/// Integer hash -> [0,1) for value noise.
pub fn hash2(seed: u32, x: i32, y: i32) -> f32 {
    let mut h = seed ^ (x as u32).wrapping_mul(0x85EBCA6B) ^ (y as u32).wrapping_mul(0xC2B2AE35);
    h ^= h >> 16;
    h = h.wrapping_mul(0x7FEB352D);
    h ^= h >> 15;
    h = h.wrapping_mul(0x846CA68B);
    h ^= h >> 16;
    (h >> 8) as f32 / 16_777_216.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deterministic() {
        let (mut a, mut b) = (Rng::new(42), Rng::new(42));
        for _ in 0..100 {
            assert_eq!(a.next_u32(), b.next_u32());
        }
        assert_ne!(Rng::new(1).next_u32(), Rng::new(2).next_u32());
    }

    #[test]
    fn f32_in_range() {
        let mut r = Rng::new(7);
        for _ in 0..10_000 {
            let f = r.next_f32();
            assert!((0.0..1.0).contains(&f));
        }
    }

    #[test]
    fn hash_in_range() {
        for i in -20..20 {
            let h = hash2(3, i, i * 7);
            assert!((0.0..1.0).contains(&h));
        }
    }
}
