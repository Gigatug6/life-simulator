//! Life simulation engine (WebAssembly, no std, no external crate).
//! Exports a C ABI: the host (TypeScript) reads the data through raw pointers into linear memory.
#![cfg_attr(target_arch = "wasm32", no_std)]

#[cfg(target_arch = "wasm32")]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

pub mod brain;
pub mod creatures;
pub mod elite;
pub mod life;
pub mod plants;
pub mod rng;
pub mod spatial;
pub mod world;

static mut TICKS: u32 = 0;

/// Engine protocol version (incremented when the memory layout changes).
#[no_mangle]
pub extern "C" fn version() -> u32 {
    1
}

/// Advances the simulation by one tick and returns the total tick counter.
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
            let mut env = life::Env {
                w: WIDTH as usize,
                h: HEIGHT as usize,
                biome: &bio[..n],
                grass: &mut grass[..n],
                daylight: plants::daylight(TICKS),
            };
            let rng = &mut *core::ptr::addr_of_mut!(RNG);
            if c.count > 0 {
                life::step(c, &mut *core::ptr::addr_of_mut!(GRID), &mut env, rng);
            }
            life::maintain(c, &mut *core::ptr::addr_of_mut!(ELITES), &env, rng, TICKS);
            RAIN *= 0.999; // rain fades slowly
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
static mut ELITES: elite::Elites = elite::Elites::new();
static mut RAIN: f32 = 0.0;
static mut SEED: u32 = 0;
static mut RNG: rng::Rng = rng::Rng(1);
static mut BIOME: [u8; world::MAX_W * world::MAX_H] = [0; world::MAX_W * world::MAX_H];
static mut WIDTH: u32 = 0;
static mut HEIGHT: u32 = 0;

/// Generates the world (w, h <= 512). Returns 0 if OK, 1 if the dimensions are invalid.
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
        // initial grass: half the biome capacity
        let grass = &mut *core::ptr::addr_of_mut!(GRASS);
        for i in 0..n {
            grass[i] = plants::capacity(bio[i]) * 0.5;
        }
        TICKS = 0;
        RAIN = 0.0;
        RNG = rng::Rng::new(seed as u64 ^ 0xC0FFEE);
        (*core::ptr::addr_of_mut!(CREATURES)).clear();
        (*core::ptr::addr_of_mut!(ELITES)).clear();
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

/// Pointer (WASM memory offset) to the f32 altitudes (w*h).
#[no_mangle]
pub extern "C" fn world_altitude_ptr() -> *const f32 {
    core::ptr::addr_of!(ALTITUDE) as *const f32
}

/// Pointer to the u8 biomes (w*h).
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

/// Restores the metadata after the host has copied altitude/biome/grass into memory.
/// Returns 0 if OK, 1 if the dimensions are invalid.
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

/// Creates a creature (species 0 herbivore, 1 carnivore); returns its index, or -1 if full.
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
pub extern "C" fn learn_len() -> u32 {
    brain::LEARN_LEN as u32
}

#[no_mangle]
pub extern "C" fn creature_learned_ptr() -> *const f32 {
    unsafe { core::ptr::addr_of!(CREATURES.learned) as *const f32 }
}

#[no_mangle]
pub extern "C" fn creature_genome_ptr() -> *const f32 {
    unsafe { core::ptr::addr_of!(CREATURES.genome) as *const f32 }
}

/// Random generator state (for reproducible snapshots).
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

/// Number of creatures of a species (statistics for the UI).
#[no_mangle]
pub extern "C" fn stats_count(species: u32) -> u32 {
    unsafe { life::count_species(&*core::ptr::addr_of!(CREATURES), species as u8) as u32 }
}

/// Mean hidden units of a species (brain-complexity index).
#[no_mangle]
pub extern "C" fn stats_mean_hidden(species: u32) -> f32 {
    unsafe { life::mean_hidden(&*core::ptr::addr_of!(CREATURES), species as u8) }
}

/// Populates the world: `count` creatures of the given species on land cells (plain and above).
/// Returns the number actually created.
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

/// Mean behavioural competence of a species, 0..1 (0.5 = random) — see `brain::competence`.
#[no_mangle]
pub extern "C" fn stats_competence(species: u32) -> f32 {
    unsafe { life::mean_competence(&*core::ptr::addr_of!(CREATURES), species as u8) }
}

/// Rebirths triggered since the world began (the species was almost extinct).
#[no_mangle]
pub extern "C" fn world_rescues() -> u32 {
    unsafe { (*core::ptr::addr_of!(ELITES)).rescues }
}

#[no_mangle]
pub extern "C" fn elite_count() -> u32 {
    unsafe { (*core::ptr::addr_of!(ELITES)).count as u32 }
}

#[no_mangle]
pub extern "C" fn elite_scores_ptr() -> *const f32 {
    unsafe { core::ptr::addr_of!(ELITES.score) as *const f32 }
}

#[no_mangle]
pub extern "C" fn elite_genomes_ptr() -> *const f32 {
    unsafe { core::ptr::addr_of!(ELITES.genome) as *const f32 }
}

#[no_mangle]
pub extern "C" fn elite_slots() -> u32 {
    elite::ELITES as u32
}

/// Restores the elite memory after the host has copied the arrays.
#[no_mangle]
pub extern "C" fn elites_restore(count: u32, rescues: u32) -> u32 {
    if count as usize > elite::ELITES {
        return 1;
    }
    unsafe {
        let e = &mut *core::ptr::addr_of_mut!(ELITES);
        e.count = count as usize;
        e.rescues = rescues;
    }
    0
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
    // next id that will be issued (snapshot format unchanged)
    unsafe { (*core::ptr::addr_of!(CREATURES)).issued.wrapping_add(1) }
}

/// Restores the counter after the host has copied the creature arrays.
#[no_mangle]
pub extern "C" fn creatures_restore(count: u32, next_id: u32) -> u32 {
    if count as usize > creatures::MAX {
        return 1;
    }
    unsafe {
        let c = &mut *core::ptr::addr_of_mut!(CREATURES);
        c.count = count as usize;
        c.issued = next_id.wrapping_sub(1);
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

/// Pointer to the f32 grass (w*h), values 0..capacity.
#[no_mangle]
pub extern "C" fn world_grass_ptr() -> *const f32 {
    core::ptr::addr_of!(GRASS) as *const f32
}

/// Current season: 0 spring, 1 summer, 2 autumn, 3 winter.
#[no_mangle]
pub extern "C" fn world_season() -> u32 {
    unsafe { plants::season(TICKS) }
}

/// Daylight 0..1 (day/night).
#[no_mangle]
pub extern "C" fn world_daylight() -> f32 {
    unsafe { plants::daylight(TICKS) }
}

/// Rain (0..1) or drought (-1..0) — a "God" tool; fades slowly.
#[no_mangle]
pub extern "C" fn world_set_rain(v: f32) {
    unsafe { RAIN = if v < -1.0 { -1.0 } else if v > 1.0 { 1.0 } else { v } }
}

/// Meteor at (x, y) with radius r (cells): returns the number of creatures killed.
#[no_mangle]
pub extern "C" fn world_meteor(x: f32, y: f32, r: f32) -> u32 {
    unsafe {
        if WIDTH == 0 {
            return 0;
        }
        let n = (WIDTH * HEIGHT) as usize;
        let grass = &mut *core::ptr::addr_of_mut!(GRASS);
        let bio = &*core::ptr::addr_of!(BIOME);
        let mut env = life::Env { w: WIDTH as usize, h: HEIGHT as usize, biome: &bio[..n], grass: &mut grass[..n], daylight: 1.0 };
        life::meteor(&mut *core::ptr::addr_of_mut!(CREATURES), &mut env, x, y, r)
    }
}

/// Blessing at (x, y) with radius r: returns the number of creatures blessed.
#[no_mangle]
pub extern "C" fn world_bless(x: f32, y: f32, r: f32) -> u32 {
    unsafe {
        if WIDTH == 0 {
            return 0;
        }
        let n = (WIDTH * HEIGHT) as usize;
        let grass = &mut *core::ptr::addr_of_mut!(GRASS);
        let bio = &*core::ptr::addr_of!(BIOME);
        let mut env = life::Env { w: WIDTH as usize, h: HEIGHT as usize, biome: &bio[..n], grass: &mut grass[..n], daylight: 1.0 };
        life::bless(&mut *core::ptr::addr_of_mut!(CREATURES), &mut env, x, y, r)
    }
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
