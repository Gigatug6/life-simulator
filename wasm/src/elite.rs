//! Memory of the best genomes: the species can be reborn from its most competent ancestors.
use crate::brain::GENOME_LEN;
use crate::rng::Rng;

pub const ELITES: usize = 8;

pub struct Elites {
    pub count: usize,
    pub rescues: u32,
    pub score: [f32; ELITES],
    pub genome: [f32; ELITES * GENOME_LEN],
}

impl Elites {
    pub const fn new() -> Self {
        Elites { count: 0, rescues: 0, score: [0.0; ELITES], genome: [0.0; ELITES * GENOME_LEN] }
    }

    pub fn clear(&mut self) {
        self.count = 0;
        self.rescues = 0;
    }

    /// Offers a genome; it enters if there is room or if it beats the worst one. Returns true if kept.
    pub fn consider(&mut self, genome: &[f32], score: f32) -> bool {
        let slot = if self.count < ELITES {
            self.count += 1;
            self.count - 1
        } else {
            let mut worst = 0;
            for k in 1..ELITES {
                if self.score[k] < self.score[worst] {
                    worst = k;
                }
            }
            if score <= self.score[worst] {
                return false;
            }
            worst
        };
        self.score[slot] = score;
        self.genome[slot * GENOME_LEN..(slot + 1) * GENOME_LEN].copy_from_slice(&genome[..GENOME_LEN]);
        true
    }

    /// Genome of a randomly drawn elite (None if there is none).
    pub fn pick(&self, rng: &mut Rng) -> Option<&[f32]> {
        if self.count == 0 {
            return None;
        }
        let k = (rng.next_u32() as usize) % self.count;
        Some(&self.genome[k * GENOME_LEN..(k + 1) * GENOME_LEN])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn boxed() -> Box<Elites> {
        let mut b = unsafe { Box::<Elites>::new_zeroed().assume_init() };
        b.clear();
        b
    }

    #[test]
    fn keeps_the_best_and_ignores_the_worse() {
        let mut e = boxed();
        let g = |v: f32| [v; GENOME_LEN];
        for k in 0..ELITES {
            assert!(e.consider(&g(k as f32), 0.5 + k as f32 * 0.01));
        }
        assert_eq!(e.count, ELITES);
        assert!(!e.consider(&g(99.0), 0.4)); // worse than all of them
        assert!(e.consider(&g(100.0), 0.9)); // replaces the worst (score 0.5)
        assert!(e.score.iter().all(|&s| s > 0.5));
        let mut rng = Rng::new(1);
        assert!(e.pick(&mut rng).is_some());
        e.clear();
        assert!(e.pick(&mut rng).is_none());
    }
}
