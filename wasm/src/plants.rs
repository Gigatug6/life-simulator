//! Grass: logistic regrowth driven by biome fertility, seasons and rain.
use crate::world::*;

pub const DAY_LEN: u32 = 600; // ticks per day
pub const YEAR_LEN: u32 = DAY_LEN * 12; // ticks per year (4 seasons)
const STRIDE: u32 = 4; // 1 cell in 4 updated per tick (rate ×4)

/// Maximum grass capacity per biome.
pub fn capacity(biome: u8) -> f32 {
    match biome {
        PLAIN => 1.0,
        FOREST => 0.8,
        BEACH => 0.1,
        MOUNTAIN => 0.15,
        _ => 0.0,
    }
}

/// Triangle wave 0..1..0 for a phase in [0,1) (no sin in no_std).
pub fn tri(phase: f32) -> f32 {
    let p = phase - (phase as i32) as f32;
    if p < 0.5 { p * 2.0 } else { 2.0 - p * 2.0 }
}

/// 0 = spring, 1 = summer, 2 = autumn, 3 = winter.
pub fn season(tick: u32) -> u32 {
    (tick % YEAR_LEN) / (YEAR_LEN / 4)
}

/// Seasonal growth factor (0.1 in winter .. 1.0 in summer).
pub fn season_factor(tick: u32) -> f32 {
    let year_phase = (tick % YEAR_LEN) as f32 / YEAR_LEN as f32;
    // peak in mid-summer (phase 0.375), trough in mid-winter
    let t = tri(year_phase + 0.125);
    0.1 + 0.9 * t
}

/// Daylight 0 (night) .. 1 (full day).
pub fn daylight(tick: u32) -> f32 {
    let p = (tick % DAY_LEN) as f32 / DAY_LEN as f32;
    tri(p)
}

/// Advances grass regrowth by one tick. `rain` in [-1,1]: positive = rain
/// (faster growth), negative = drought (no growth, then the grass dies off).
pub fn step(grass: &mut [f32], biome: &[u8], n: usize, tick: u32, rain: f32) {
    let boost = 1.0 + 2.0 * rain;
    let rate = 0.004 * STRIDE as f32 * season_factor(tick) * if boost > 0.0 { boost } else { 0.0 };
    let wither = if rain < 0.0 { -rain * 0.004 * STRIDE as f32 } else { 0.0 };
    let mut i = (tick % STRIDE) as usize;
    while i < n {
        let cap = capacity(biome[i]);
        if cap > 0.0 {
            let g = grass[i];
            let ng = g + rate * (g + 0.02) * (1.0 - g / cap) - g * wither;
            grass[i] = if ng > cap { cap } else { ng };
        }
        i += STRIDE as usize;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn season_cycle() {
        assert_eq!(season(0), 0);
        assert_eq!(season(YEAR_LEN / 4), 1);
        assert_eq!(season(YEAR_LEN - 1), 3);
        assert_eq!(season(YEAR_LEN), 0);
    }

    #[test]
    fn summer_beats_winter() {
        let summer = season_factor(YEAR_LEN * 3 / 8);
        let winter = season_factor(YEAR_LEN * 7 / 8);
        assert!(summer > 0.95 && winter < 0.2, "{} {}", summer, winter);
    }

    #[test]
    fn day_and_night() {
        assert!(daylight(DAY_LEN / 2) > 0.95);
        assert!(daylight(0) < 0.05);
    }

    #[test]
    fn drought_withers_grass() {
        let biome = vec![PLAIN; 4];
        let mut g = vec![0.8f32; 4];
        for t in 0..800 {
            step(&mut g, &biome, 4, t, -1.0);
        }
        assert!(g[0] < 0.1, "{}", g[0]);
    }

    #[test]
    fn grass_grows_bounded_and_rain_helps() {
        let biome = vec![PLAIN, FOREST, DEEP_WATER, MOUNTAIN];
        let (mut dry, mut wet) = (vec![0.0f32; 4], vec![0.0f32; 4]);
        for t in 0..2000 {
            step(&mut dry, &biome, 4, t, 0.0);
            step(&mut wet, &biome, 4, t, 1.0);
        }
        assert!(dry[0] > 0.1 && dry[0] <= 1.0);
        assert!(wet[0] > dry[0]);
        assert_eq!(dry[2], 0.0); // no grass on water
        assert!(dry[1] <= 0.8 && dry[3] <= 0.15);
    }
}
