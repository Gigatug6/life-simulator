//! Moteur de simulation de vie (WebAssembly, sans std, sans crate externe).
//! Phase 0 : « hello » — vérifie la chaîne Docker -> wasm -> worker.
#![cfg_attr(target_arch = "wasm32", no_std)]

#[cfg(target_arch = "wasm32")]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

pub mod brain;
pub mod creatures;
pub mod life;
pub mod plants;
pub mod rng;
pub mod spatial;
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
            let c = &mut *core::ptr::addr_of_mut!(CREATURES);
            if c.count > 0 {
                let mut env = life::Env {
                    w: WIDTH as usize,
                    h: HEIGHT as usize,
                    biome: &bio[..n],
                    grass: &mut grass[..n],
                    daylight: plants::daylight(TICKS),
                };
                life::step(c, &mut *core::ptr::addr_of_mut!(GRID), &mut env, &mut *core::ptr::addr_of_mut!(RNG));
            }
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
static mut CREATURES: creatures::Creatures = creatures::Creatures::new();
static mut GRID: spatial::SpatialHash = spatial::SpatialHash::new();
static mut RAIN: f32 = 0.0;
static mut SEED: u32 = 0;
static mut RNG: rng::Rng = rng::Rng(1);
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
        RNG = rng::Rng::new(seed as u64 ^ 0xC0FFEE);
        (*core::ptr::addr_of_mut!(CREATURES)).clear();
        SEED = seed;
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

#[no_mangle]
pub extern "C" fn world_seed() -> u32 {
    unsafe { SEED }
}

#[no_mangle]
pub extern "C" fn world_tick() -> u32 {
    unsafe { TICKS }
}

#[no_mangle]
pub extern "C" fn world_rain() -> f32 {
    unsafe { RAIN }
}

/// Restaure les méta-données après que l'hôte a recopié altitude/biome/herbe dans la mémoire.
/// Renvoie 0 si OK, 1 si dimensions invalides.
#[no_mangle]
pub extern "C" fn world_restore(seed: u32, w: u32, h: u32, tick: u32, rain: f32) -> u32 {
    if w == 0 || h == 0 || w as usize > world::MAX_W || h as usize > world::MAX_H {
        return 1;
    }
    unsafe {
        SEED = seed;
        WIDTH = w;
        HEIGHT = h;
        TICKS = tick;
        RAIN = rain;
    }
    0
}

/// Crée une créature (espèce 0 herbivore, 1 carnivore) ; renvoie son index ou -1 si plein.
#[no_mangle]
pub extern "C" fn creature_spawn(x: f32, y: f32, species: u32) -> i32 {
    unsafe {
        let c = &mut *core::ptr::addr_of_mut!(CREATURES);
        let rng = &mut *core::ptr::addr_of_mut!(RNG);
        let mut genome = [0.0f32; brain::GENOME_LEN];
        brain::random_genome(&mut genome, rng);
        let angle = rng.next_f32() * 6.2831855;
        match c.spawn(x, y, angle, 50.0, species as u8, 0, &genome) {
            Some(i) => i as i32,
            None => -1,
        }
    }
}

#[no_mangle]
pub extern "C" fn genome_len() -> u32 {
    brain::GENOME_LEN as u32
}

#[no_mangle]
pub extern "C" fn creature_genome_ptr() -> *const f32 {
    unsafe { core::ptr::addr_of!(CREATURES.genome) as *const f32 }
}

/// État du générateur aléatoire (pour des snapshots reproductibles).
#[no_mangle]
pub extern "C" fn rng_lo() -> u32 {
    unsafe { RNG.0 as u32 }
}
#[no_mangle]
pub extern "C" fn rng_hi() -> u32 {
    unsafe { (RNG.0 >> 32) as u32 }
}
#[no_mangle]
pub extern "C" fn rng_restore(lo: u32, hi: u32) {
    unsafe { RNG = rng::Rng(((hi as u64) << 32) | lo as u64) }
}

/// Nombre de créatures d'une espèce (statistiques pour l'UI).
#[no_mangle]
pub extern "C" fn stats_count(species: u32) -> u32 {
    unsafe { life::count_species(&*core::ptr::addr_of!(CREATURES), species as u8) as u32 }
}

/// Unités cachées moyennes d'une espèce (indice de complexité cérébrale).
#[no_mangle]
pub extern "C" fn stats_mean_hidden(species: u32) -> f32 {
    unsafe { life::mean_hidden(&*core::ptr::addr_of!(CREATURES), species as u8) }
}

/// Peuple le monde : `count` créatures de l'espèce donnée sur des cases de terre (plaine et plus).
/// Renvoie le nombre réellement créé.
#[no_mangle]
pub extern "C" fn world_populate(species: u32, count: u32) -> u32 {
    unsafe {
        if WIDTH == 0 {
            return 0;
        }
        let c = &mut *core::ptr::addr_of_mut!(CREATURES);
        let rng = &mut *core::ptr::addr_of_mut!(RNG);
        let bio = &*core::ptr::addr_of!(BIOME);
        let (w, h) = (WIDTH as usize, HEIGHT as usize);
        let mut made = 0;
        let mut tries = 0;
        while made < count && tries < count * 50 + 100 {
            tries += 1;
            let (x, y) = (rng.next_f32() * w as f32, rng.next_f32() * h as f32);
            if bio[(y as usize) * w + x as usize] >= world::PLAIN {
                let mut genome = [0.0f32; brain::GENOME_LEN];
                brain::random_genome(&mut genome, rng);
                let angle = rng.next_f32() * 6.2831855;
                if c.spawn(x, y, angle, 50.0, species as u8, 0, &genome).is_none() {
                    break;
                }
                made += 1;
            }
        }
        made
    }
}

#[no_mangle]
pub extern "C" fn creature_kill(i: u32) {
    unsafe { (*core::ptr::addr_of_mut!(CREATURES)).kill(i as usize) }
}

#[no_mangle]
pub extern "C" fn creature_count() -> u32 {
    unsafe { (*core::ptr::addr_of!(CREATURES)).count as u32 }
}

#[no_mangle]
pub extern "C" fn creature_next_id() -> u32 {
    unsafe { (*core::ptr::addr_of!(CREATURES)).next_id }
}

/// Restaure le compteur après que l'hôte a recopié les tableaux de créatures.
#[no_mangle]
pub extern "C" fn creatures_restore(count: u32, next_id: u32) -> u32 {
    if count as usize > creatures::MAX {
        return 1;
    }
    unsafe {
        let c = &mut *core::ptr::addr_of_mut!(CREATURES);
        c.count = count as usize;
        c.next_id = next_id;
    }
    0
}

#[no_mangle]
pub extern "C" fn creature_x_ptr() -> *const f32 {
    unsafe { core::ptr::addr_of!(CREATURES.x) as *const f32 }
}
#[no_mangle]
pub extern "C" fn creature_y_ptr() -> *const f32 {
    unsafe { core::ptr::addr_of!(CREATURES.y) as *const f32 }
}
#[no_mangle]
pub extern "C" fn creature_angle_ptr() -> *const f32 {
    unsafe { core::ptr::addr_of!(CREATURES.angle) as *const f32 }
}
#[no_mangle]
pub extern "C" fn creature_energy_ptr() -> *const f32 {
    unsafe { core::ptr::addr_of!(CREATURES.energy) as *const f32 }
}
#[no_mangle]
pub extern "C" fn creature_age_ptr() -> *const u32 {
    unsafe { core::ptr::addr_of!(CREATURES.age) as *const u32 }
}
#[no_mangle]
pub extern "C" fn creature_id_ptr() -> *const u32 {
    unsafe { core::ptr::addr_of!(CREATURES.id) as *const u32 }
}
#[no_mangle]
pub extern "C" fn creature_generation_ptr() -> *const u16 {
    unsafe { core::ptr::addr_of!(CREATURES.generation) as *const u16 }
}
#[no_mangle]
pub extern "C" fn creature_species_ptr() -> *const u8 {
    unsafe { core::ptr::addr_of!(CREATURES.species) as *const u8 }
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
