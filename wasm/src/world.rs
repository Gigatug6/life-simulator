//! Grille du monde : altitude (bruit de valeurs multi-octaves) -> biomes.
use crate::rng::hash2;

pub const MAX_W: usize = 512;
pub const MAX_H: usize = 512;

pub const DEEP_WATER: u8 = 0;
pub const SHALLOW_WATER: u8 = 1;
pub const BEACH: u8 = 2;
pub const PLAIN: u8 = 3;
pub const FOREST: u8 = 4;
pub const MOUNTAIN: u8 = 5;

fn smooth(t: f32) -> f32 {
    t * t * (3.0 - 2.0 * t)
}

/// Bruit de valeurs 2D lissé, coordonnées positives.
fn value_noise(seed: u32, x: f32, y: f32) -> f32 {
    let (xi, yi) = (x as i32, y as i32);
    let (fx, fy) = (smooth(x - xi as f32), smooth(y - yi as f32));
    let a = hash2(seed, xi, yi);
    let b = hash2(seed, xi + 1, yi);
    let c = hash2(seed, xi, yi + 1);
    let d = hash2(seed, xi + 1, yi + 1);
    let top = a + (b - a) * fx;
    let bot = c + (d - c) * fx;
    top + (bot - top) * fy
}

pub fn biome_of(altitude: f32, moisture: f32) -> u8 {
    if altitude < 0.30 {
        DEEP_WATER
    } else if altitude < 0.38 {
        SHALLOW_WATER
    } else if altitude < 0.42 {
        BEACH
    } else if altitude > 0.78 {
        MOUNTAIN
    } else if moisture > 0.55 {
        FOREST
    } else {
        PLAIN
    }
}

/// Remplit `altitude` et `biome` (taille w*h). Déterministe pour une graine donnée.
pub fn generate(altitude: &mut [f32], biome: &mut [u8], w: usize, h: usize, seed: u32) {
    for y in 0..h {
        for x in 0..w {
            let (fx, fy) = (x as f32 / w as f32, y as f32 / h as f32);
            let mut alt = 0.0;
            let (mut amp, mut freq, mut norm) = (1.0f32, 4.0f32, 0.0f32);
            for o in 0..4u32 {
                alt += amp * value_noise(seed.wrapping_add(o * 101), fx * freq, fy * freq);
                norm += amp;
                amp *= 0.5;
                freq *= 2.0;
            }
            alt /= norm;
            // île : abaisse les bords pour entourer le monde d'eau
            let (dx, dy) = (fx - 0.5, fy - 0.5);
            let edge = (dx * dx + dy * dy) * 2.2;
            alt = (alt * 1.25 - edge * 0.5).clamp(0.0, 1.0);
            let moisture = value_noise(seed ^ 0xA5A5, fx * 6.0, fy * 6.0);
            altitude[y * w + x] = alt;
            biome[y * w + x] = biome_of(alt, moisture);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gen(seed: u32) -> (Vec<f32>, Vec<u8>) {
        let (w, h) = (128, 128);
        let (mut a, mut b) = (vec![0.0; w * h], vec![0u8; w * h]);
        generate(&mut a, &mut b, w, h, seed);
        (a, b)
    }

    #[test]
    fn deterministic_and_seeded() {
        assert_eq!(gen(5).1, gen(5).1);
        assert_ne!(gen(5).1, gen(6).1);
    }

    #[test]
    fn has_water_and_land_biomes() {
        let (a, b) = gen(11);
        assert!(a.iter().all(|v| (0.0..=1.0).contains(v)));
        for biome in [DEEP_WATER, BEACH, PLAIN] {
            assert!(b.contains(&biome), "biome {} absent", biome);
        }
        // les bords sont de l'eau (monde en île)
        assert_eq!(b[0], DEEP_WATER);
    }
}
