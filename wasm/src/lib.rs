//! Moteur de simulation de vie (WebAssembly, sans std, sans crate externe).
//! Phase 0 : « hello » — vérifie la chaîne Docker -> wasm -> worker.
#![cfg_attr(target_arch = "wasm32", no_std)]

#[cfg(target_arch = "wasm32")]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

pub mod plants;
pub mod rng;
pub mod world;

static mut TICKS: u32 = 0;

/// Version du protocole du moteur (incrémentée si le format mémoire change).
#[no_mangle]
pub extern "C" fn version() -> u32 {
    1
}

/// Avance la simulation d'un tick et renvoie le compteur total.
#[no_mangle]
pub extern "C" fn tick() -> u32 {
    unsafe {
        TICKS = TICKS.wrapping_add(1);
        if WIDTH > 0 {
            let n = (WIDTH * HEIGHT) as usize;
            let grass = &mut *core::ptr::addr_of_mut!(GRASS);
            let bio = &*core::ptr::addr_of!(BIOME);
            plants::step(&mut grass[..n], &bio[..n], n, TICKS, RAIN);
            RAIN *= 0.999; // la pluie s'estompe lentement
        }
        TICKS
    }
}

#[no_mangle]
pub extern "C" fn add(a: i32, b: i32) -> i32 {
    a.wrapping_add(b)
}

static mut ALTITUDE: [f32; world::MAX_W * world::MAX_H] = [0.0; world::MAX_W * world::MAX_H];
static mut GRASS: [f32; world::MAX_W * world::MAX_H] = [0.0; world::MAX_W * world::MAX_H];
static mut RAIN: f32 = 0.0;
static mut BIOME: [u8; world::MAX_W * world::MAX_H] = [0; world::MAX_W * world::MAX_H];
static mut WIDTH: u32 = 0;
static mut HEIGHT: u32 = 0;

/// Génère le monde (w, h <= 512). Renvoie 0 si OK, 1 si dimensions invalides.
#[no_mangle]
pub extern "C" fn world_init(seed: u32, w: u32, h: u32) -> u32 {
    if w == 0 || h == 0 || w as usize > world::MAX_W || h as usize > world::MAX_H {
        return 1;
    }
    unsafe {
        let n = (w * h) as usize;
        let alt = &mut *core::ptr::addr_of_mut!(ALTITUDE);
        let bio = &mut *core::ptr::addr_of_mut!(BIOME);
        world::generate(&mut alt[..n], &mut bio[..n], w as usize, h as usize, seed);
        // herbe initiale : la moitié de la capacité du biome
        let grass = &mut *core::ptr::addr_of_mut!(GRASS);
        for i in 0..n {
            grass[i] = plants::capacity(bio[i]) * 0.5;
        }
        TICKS = 0;
        RAIN = 0.0;
        WIDTH = w;
        HEIGHT = h;
    }
    0
}

#[no_mangle]
pub extern "C" fn world_width() -> u32 {
    unsafe { WIDTH }
}

#[no_mangle]
pub extern "C" fn world_height() -> u32 {
    unsafe { HEIGHT }
}

/// Pointeur (offset mémoire WASM) vers les altitudes f32 (w*h).
#[no_mangle]
pub extern "C" fn world_altitude_ptr() -> *const f32 {
    core::ptr::addr_of!(ALTITUDE) as *const f32
}

/// Pointeur vers les biomes u8 (w*h).
#[no_mangle]
pub extern "C" fn world_biome_ptr() -> *const u8 {
    core::ptr::addr_of!(BIOME) as *const u8
}

/// Pointeur vers l'herbe f32 (w*h), valeurs 0..capacité.
#[no_mangle]
pub extern "C" fn world_grass_ptr() -> *const f32 {
    core::ptr::addr_of!(GRASS) as *const f32
}

/// Saison courante : 0 printemps, 1 été, 2 automne, 3 hiver.
#[no_mangle]
pub extern "C" fn world_season() -> u32 {
    unsafe { plants::season(TICKS) }
}

/// Luminosité 0..1 (jour/nuit).
#[no_mangle]
pub extern "C" fn world_daylight() -> f32 {
    unsafe { plants::daylight(TICKS) }
}

/// Déclenche la pluie (intensité 0..1) — outil de « Dieu ».
#[no_mangle]
pub extern "C" fn world_set_rain(v: f32) {
    unsafe { RAIN = if v < 0.0 { 0.0 } else if v > 1.0 { 1.0 } else { v } }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_works() {
        assert_eq!(add(2, 3), 5);
    }

    #[test]
    fn version_is_one() {
        assert_eq!(version(), 1);
    }
}
