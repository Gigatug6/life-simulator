//! Heritable physical traits ("body plan"): size, speed, vision range and a lineage hue.
//! Each trait trades a benefit for a cost (see `life::step`), so evolution has real choices to make.
use crate::rng::Rng;

pub const TRAIT_LEN: usize = 4;
pub const SIZE: usize = 0; // body scale: bigger stores more energy and bites more, but burns more
pub const SPEED: usize = 1; // top-speed multiplier: faster, but movement costs grow with speed²
pub const VISION: usize = 2; // sensor distance multiplier: sees further, pays a sensing cost
pub const HUE: usize = 3; // lineage colour in [0, 1): neutral, drifts slowly, makes families visible

pub const DEFAULT: [f32; TRAIT_LEN] = [1.0, 1.0, 1.0, 0.5];
/// (min, max) of the three physical traits (the hue wraps around instead of being clamped).
pub const RANGE: [(f32, f32); 3] = [(0.6, 1.6), (0.6, 1.6), (0.6, 1.8)];
const MUT_RATE: f32 = 0.3; // chance that a given trait mutates at birth
const MUT_SIGMA: f32 = 0.06; // relative size of a trait mutation
const HUE_DRIFT: f32 = 0.03;

fn clamp_trait(k: usize, v: f32) -> f32 {
    let (lo, hi) = RANGE[k];
    v.clamp(lo, hi)
}

/// Traits of a founder: close to the default body plan, with a random lineage hue.
pub fn random_founder(t: &mut [f32], rng: &mut Rng) {
    for k in 0..3 {
        t[k] = clamp_trait(k, 1.0 + (rng.next_f32() - 0.5) * 0.2);
    }
    t[HUE] = rng.next_f32();
}

/// Copies `parent` into `child` and mutates it: multiplicative noise on the physical traits,
/// a small wrapped drift on the hue.
pub fn mutate(child: &mut [f32], parent: &[f32], rng: &mut Rng) {
    for k in 0..3 {
        let mut v = parent[k];
        if rng.next_f32() < MUT_RATE {
            v *= 1.0 + rng.gauss() * MUT_SIGMA;
        }
        child[k] = clamp_trait(k, v);
    }
    let h = parent[HUE] + rng.gauss() * HUE_DRIFT;
    child[HUE] = h - (h as i32) as f32 + if h < 0.0 { 1.0 } else { 0.0 };
}

/// Energy-burn multiplier of a body size (linear stand-in for size^0.75, no powf in no_std).
pub fn upkeep(size: f32) -> f32 {
    0.4 + 0.6 * size
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn founders_stay_close_to_the_default_plan() {
        let mut rng = Rng::new(1);
        let mut t = [0.0; TRAIT_LEN];
        for _ in 0..500 {
            random_founder(&mut t, &mut rng);
            for k in 0..3 {
                assert!((t[k] - 1.0).abs() <= 0.1 + 1e-6, "{:?}", t);
            }
            assert!((0.0..1.0).contains(&t[HUE]));
        }
    }

    #[test]
    fn mutation_is_bounded_small_and_can_move() {
        let mut rng = Rng::new(2);
        let mut cur = DEFAULT;
        let mut moved = false;
        for _ in 0..5000 {
            let mut next = [0.0; TRAIT_LEN];
            mutate(&mut next, &cur, &mut rng);
            for k in 0..3 {
                let (lo, hi) = RANGE[k];
                assert!(next[k] >= lo && next[k] <= hi);
                assert!((next[k] / cur[k] - 1.0).abs() < 0.4, "a single step must stay small");
            }
            assert!((0.0..1.0).contains(&next[HUE]), "hue {}", next[HUE]);
            moved |= next[SIZE] != cur[SIZE];
            cur = next;
        }
        assert!(moved);
    }

    #[test]
    fn hue_wraps_around() {
        let mut rng = Rng::new(3);
        let parent = [1.0, 1.0, 1.0, 0.999];
        let mut wrapped = false;
        for _ in 0..2000 {
            let mut c = [0.0; TRAIT_LEN];
            mutate(&mut c, &parent, &mut rng);
            assert!((0.0..1.0).contains(&c[HUE]));
            wrapped |= c[HUE] < 0.5;
        }
        assert!(wrapped, "the hue should sometimes wrap past 1.0");
    }

    #[test]
    fn upkeep_grows_with_size() {
        assert!((upkeep(1.0) - 1.0).abs() < 1e-6);
        assert!(upkeep(1.6) > upkeep(1.0) && upkeep(0.6) < upkeep(1.0));
    }
}
