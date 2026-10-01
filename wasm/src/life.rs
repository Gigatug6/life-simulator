//! Creature dynamics: perception -> brain -> action -> metabolism -> death/reproduction.
use crate::brain::{self, GENOME_LEN, IN, LEARN_LEN};
use crate::creatures::{Creatures, CARNIVORE, HERBIVORE};
use crate::elite::Elites;
use crate::rng::Rng;
use crate::spatial::SpatialHash;
use crate::traits::{self, TRAIT_LEN};
use crate::world::DEEP_WATER;

pub const MAX_AGE: u32 = 2500;
pub const MAX_SPEED: f32 = 0.6;
pub const START_ENERGY: f32 = 40.0;
pub const MAX_ENERGY: f32 = 100.0;
const BASE_COST: f32 = 0.04;
const BRAIN_COST: f32 = 0.0008; // per hidden unit: intelligence has a price
const EAT_BITE: f32 = 0.25;
const EAT_COST: f32 = 0.03; // trying to eat costs a little: "always eat" is no longer free
const EAT_GAIN: f32 = 12.0; // one bite = ~3 energy ≈ 60 ticks of life: creatures must keep looking for food
const BIRTH_THRESHOLD: f32 = 65.0;
const BIRTH_COST: f32 = 35.0;
const CHILD_ENERGY: f32 = 20.0; // < BIRTH_COST: being born costs energy (no free creation)
const MATURITY: u32 = 120; // minimum age to reproduce
const MUT_RATE: f32 = 0.08;
const MUT_SIGMA: f32 = 0.15;
const LOOK: f32 = 3.0; // sensor distance
const STRIKE_RANGE: f32 = 1.8;
const KILL_GAIN: f32 = 0.6; // share of the prey's energy recovered
const BIG_PREY_RATIO: f32 = 1.3; // hunters cannot take down prey larger than this multiple of their own size
const PI: f32 = 3.1415927;

/// Approximate sin (no libm in no_std), accuracy ~1e-3.
pub fn sin(x: f32) -> f32 {
    let two_pi = 2.0 * PI;
    let mut x = x - (x / two_pi) as i32 as f32 * two_pi;
    if x > PI {
        x -= two_pi;
    } else if x < -PI {
        x += two_pi;
    }
    let ax = if x < 0.0 { -x } else { x };
    let y = 1.273_239_5 * x - 0.405_284_73 * x * ax;
    let ay = if y < 0.0 { -y } else { y };
    0.225 * (y * ay - y) + y
}

pub fn cos(x: f32) -> f32 {
    sin(x + PI / 2.0)
}

pub struct Env<'a> {
    pub w: usize,
    pub h: usize,
    pub biome: &'a [u8],
    pub grass: &'a mut [f32],
    pub daylight: f32,
}

impl Env<'_> {
    fn cell(&self, x: f32, y: f32) -> Option<usize> {
        if x < 0.0 || y < 0.0 {
            return None;
        }
        let (cx, cy) = (x as usize, y as usize);
        if cx >= self.w || cy >= self.h {
            None
        } else {
            Some(cy * self.w + cx)
        }
    }
    /// Impassable cell: off the map or deep water.
    fn blocked(&self, x: f32, y: f32) -> bool {
        match self.cell(x, y) {
            None => true,
            Some(i) => self.biome[i] == DEEP_WATER,
        }
    }
}

/// Meteor: kills every creature in the radius and burns the grass. Returns the number of deaths.
pub fn meteor(c: &mut Creatures, env: &mut Env, x: f32, y: f32, r: f32) -> u32 {
    let r2 = r * r;
    let mut killed = 0;
    for i in (0..c.count).rev() {
        let (dx, dy) = (c.x[i] - x, c.y[i] - y);
        if dx * dx + dy * dy <= r2 {
            c.kill(i);
            killed += 1;
        }
    }
    for_cells(env, x, y, r, |env, idx| env.grass[idx] = 0.0);
    killed
}

/// Blessing: maximum energy and lush grass in the radius. Returns the number of blessed creatures.
pub fn bless(c: &mut Creatures, env: &mut Env, x: f32, y: f32, r: f32) -> u32 {
    let r2 = r * r;
    let mut n = 0;
    for i in 0..c.count {
        let (dx, dy) = (c.x[i] - x, c.y[i] - y);
        if dx * dx + dy * dy <= r2 {
            c.energy[i] = MAX_ENERGY * c.traits[i * TRAIT_LEN + traits::SIZE];
            n += 1;
        }
    }
    for_cells(env, x, y, r, |env, idx| env.grass[idx] = crate::plants::capacity(env.biome[idx]));
    n
}

/// Applies `f` to every cell whose centre lies in the disc (x, y, r).
fn for_cells<F: FnMut(&mut Env, usize)>(env: &mut Env, x: f32, y: f32, r: f32, mut f: F) {
    let x0 = (x - r).max(0.0) as usize;
    let y0 = (y - r).max(0.0) as usize;
    let x1 = ((x + r) as usize + 1).min(env.w);
    let y1 = ((y + r) as usize + 1).min(env.h);
    for cy in y0..y1 {
        for cx in x0..x1 {
            let (dx, dy) = (cx as f32 + 0.5 - x, cy as f32 + 0.5 - y);
            if dx * dx + dy * dy <= r * r {
                f(env, cy * env.w + cx);
            }
        }
    }
}

/// Number of creatures of a species.
pub fn count_species(c: &Creatures, species: u8) -> usize {
    (0..c.count).filter(|&i| c.species[i] == species).count()
}

/// Mean number of hidden units of a species (simple brain-complexity index).
pub fn mean_hidden(c: &Creatures, species: u8) -> f32 {
    let (mut sum, mut n) = (0.0f32, 0u32);
    for i in 0..c.count {
        if c.species[i] == species {
            sum += brain::hidden_count(&c.genome[i * GENOME_LEN..(i + 1) * GENOME_LEN]) as f32;
            n += 1;
        }
    }
    if n == 0 { 0.0 } else { sum / n as f32 }
}

/// Mean value of physical trait `k` (see `traits.rs`) over a species; 0 if the species is absent.
pub fn mean_trait(c: &Creatures, species: u8, k: usize) -> f32 {
    let (mut sum, mut n) = (0.0f32, 0u32);
    for i in 0..c.count {
        if c.species[i] == species {
            sum += c.traits[i * TRAIT_LEN + k];
            n += 1;
        }
    }
    if n == 0 { 0.0 } else { sum / n as f32 }
}

/// Mean competence (see `brain::competence`) of a species.
pub fn mean_competence(c: &Creatures, species: u8) -> f32 {
    let (mut sum, mut n) = (0.0f32, 0u32);
    for i in 0..c.count {
        if c.species[i] == species {
            sum += brain::competence(&c.genome[i * GENOME_LEN..(i + 1) * GENOME_LEN]);
            n += 1;
        }
    }
    if n == 0 { 0.0 } else { sum / n as f32 }
}

/// Mean phenotype competence (genome + learning during life) of a species.
pub fn mean_phenotype_competence(c: &Creatures, species: u8) -> f32 {
    let (mut sum, mut n) = (0.0f32, 0u32);
    for i in 0..c.count {
        if c.species[i] == species {
            sum += brain::competence_with(&c.genome[i * GENOME_LEN..(i + 1) * GENOME_LEN], &c.learned[i * LEARN_LEN..(i + 1) * LEARN_LEN]);
            n += 1;
        }
    }
    if n == 0 { 0.0 } else { sum / n as f32 }
}

const MIN_HERBIVORES: usize = 12; // below this, the species is reborn from its best ancestors
const RESCUE_CHECK: u32 = 500; // at most one rebirth every 500 ticks (otherwise it becomes an endless supply of prey)
const ELITE_CHECK: u32 = 250; // how often the elite memory is updated (ticks)
const ELITE_MIN_AGE: u32 = 300;

/// Periodic upkeep: remembers the best adult herbivore, and repopulates if the species dies out.
/// Returns the number of "rebirth" births.
pub fn maintain(c: &mut Creatures, elites: &mut Elites, env: &Env, rng: &mut Rng, tick: u32) -> u32 {
    if tick % ELITE_CHECK == 0 {
        let mut best: Option<(usize, f32)> = None;
        for i in 0..c.count {
            if c.species[i] == HERBIVORE && c.age[i] >= ELITE_MIN_AGE {
                let comp = brain::competence(&c.genome[i * GENOME_LEN..(i + 1) * GENOME_LEN]);
                if best.map_or(true, |(_, b)| comp > b) {
                    best = Some((i, comp));
                }
            }
        }
        if let Some((i, comp)) = best {
            elites.consider(&c.genome[i * GENOME_LEN..(i + 1) * GENOME_LEN], comp);
        }
    }
    if tick % RESCUE_CHECK != 0 {
        return 0;
    }
    let herb = count_species(c, HERBIVORE);
    if herb >= MIN_HERBIVORES {
        return 0;
    }
    let mut born = 0;
    let mut tries = 0;
    while herb + (born as usize) < MIN_HERBIVORES && tries < 2000 {
        tries += 1;
        let (x, y) = (rng.next_f32() * env.w as f32, rng.next_f32() * env.h as f32);
        if env.blocked(x, y) || env.biome[y as usize * env.w + x as usize] < crate::world::PLAIN {
            continue;
        }
        let mut genome = [0.0f32; GENOME_LEN];
        match elites.pick(rng) {
            Some(parent) => brain::mutate(&mut genome, parent, rng, 0.1, MUT_SIGMA),
            None => brain::random_genome(&mut genome, rng),
        }
        let ang = rng.next_f32() * 2.0 * PI;
        let Some(k) = c.spawn(x, y, ang, START_ENERGY, HERBIVORE, 0, &genome) else {
            break;
        };
        let mut founder = [0.0f32; TRAIT_LEN];
        traits::random_founder(&mut founder, rng);
        c.set_traits(k, &founder);
        born += 1;
    }
    if born > 0 {
        elites.rescues += 1;
    }
    born
}

/// Advances one tick. `grid` is rebuilt here.
pub fn step(c: &mut Creatures, grid: &mut SpatialHash, env: &mut Env, rng: &mut Rng) {
    let n = c.count;
    if n == 0 {
        return;
    }
    grid.build(&c.x, &c.y, n, env.w, env.h);
    for i in 0..n {
        let g = i * GENOME_LEN;
        let (x, y, a) = (c.x[i], c.y[i], c.angle[i]);
        // physical traits of this creature (see traits.rs for the trade-offs)
        let tr = i * TRAIT_LEN;
        let (size, speed_gene, vision) = (c.traits[tr + traits::SIZE], c.traits[tr + traits::SPEED], c.traits[tr + traits::VISION]);
        let look = LOOK * vision;
        let max_energy = MAX_ENERGY * size; // a bigger body stores more

        // --- perception ---
        let mut input = [0.0f32; IN];
        // input 0: grass underfoot (the bias is already carried by each neuron)
        if let Some(cell) = env.cell(x, y) {
            input[0] = env.grass[cell];
        }
        input[1] = c.energy[i] / max_energy;
        for (k, off) in [-0.6f32, 0.0, 0.6].iter().enumerate() {
            let (sx, sy) = (x + cos(a + off) * look, y + sin(a + off) * look);
            if c.species[i] == CARNIVORE {
                let mut prey = 0u32;
                grid.query(&c.x, &c.y, sx, sy, 4.0, |j, _| {
                    if c.species[j] == HERBIVORE && c.energy[j] > 0.0 {
                        prey += 1;
                    }
                });
                input[2 + k] = (prey as f32 / 3.0).min(1.0);
            } else if let Some(cell) = env.cell(sx, sy) {
                input[2 + k] = env.grass[cell];
            }
            input[5 + k] = if env.blocked(sx, sy) { 1.0 } else { 0.0 };
        }
        // neighbours: stop counting at 11 (self + 10), the input is capped at 1 anyway
        let near = grid.count_up_to(&c.x, &c.y, x, y, 6.0, 11);
        input[8] = (near.saturating_sub(1) as f32 / 10.0).min(1.0);
        input[9] = env.daylight;

        // --- decision ---
        let l = i * LEARN_LEN;
        let (out, hid) = brain::forward_learn(&c.genome[g..g + GENOME_LEN], &c.learned[l..l + LEARN_LEN], &input);
        let speed = (out[0] + 1.0) * 0.5 * MAX_SPEED * speed_gene;
        let na = a + out[1] * 0.35;
        let (nx, ny) = (x + cos(na) * speed, y + sin(na) * speed);
        c.angle[i] = na;
        let mut moved = 0.0;
        let mut reward = 0.0f32; // learning signal for this tick
        if !env.blocked(nx, ny) {
            c.x[i] = nx;
            c.y[i] = ny;
            moved = speed;
        } else {
            reward -= 0.2; // bumped into water / the edge
        }

        // --- metabolism ---
        let nh = brain::hidden_count(&c.genome[g..g + GENOME_LEN]) as f32;
        let base = if c.species[i] == CARNIVORE { BASE_COST * 1.3 } else { BASE_COST };
        // upkeep grows with body size, long sight costs extra, and moving costs more for bigger / faster bodies
        c.energy[i] -= base * traits::upkeep(size) + base * 0.1 * (vision - 1.0) + moved * moved * 0.12 * size + nh * BRAIN_COST;

        // --- eating (herbivores) ---
        if out[2] > 0.0 && c.species[i] == HERBIVORE {
            c.energy[i] -= EAT_COST;
            reward -= EAT_COST;
            if let Some(cell) = env.cell(c.x[i], c.y[i]) {
                let max_bite = EAT_BITE * size * size; // bigger mouths take much bigger bites (feast vs famine trade-off)
                let bite = if env.grass[cell] < max_bite { env.grass[cell] } else { max_bite };
                env.grass[cell] -= bite;
                c.energy[i] = (c.energy[i] + bite * EAT_GAIN).min(max_energy);
                reward += bite * EAT_GAIN / 3.0;
            }
        }

        // --- hunting (carnivores): strikes the nearest living prey ---
        if out[2] > 0.0 && c.species[i] == CARNIVORE {
            let mut best: Option<(usize, f32)> = None;
            grid.query(&c.x, &c.y, c.x[i], c.y[i], STRIKE_RANGE + 0.5 * (size - 1.0), |j, d2| {
                // a prey much bigger than the hunter cannot be taken down (size is a defence)
                let too_big = c.traits[j * TRAIT_LEN + traits::SIZE] > size * BIG_PREY_RATIO;
                if c.species[j] == HERBIVORE && c.energy[j] > 0.0 && !too_big && best.map_or(true, |(_, bd)| d2 < bd) {
                    best = Some((j, d2));
                }
            });
            if let Some((j, _)) = best {
                c.energy[i] = (c.energy[i] + c.energy[j] * KILL_GAIN).min(max_energy);
                reward += (c.energy[j] * KILL_GAIN / 10.0).min(2.0);
                c.energy[j] = 0.0;
            }
        }

        brain::learn(&mut c.learned[l..l + LEARN_LEN], nh as usize, &hid, &out, reward.clamp(-1.0, 2.0));

        c.age[i] += 1;
        if c.age[i] > MAX_AGE {
            c.energy[i] = 0.0;
        }

        // --- reproduction ---
        if out[3] > 0.0 && c.age[i] >= MATURITY && c.energy[i] > BIRTH_THRESHOLD * size && c.count < crate::creatures::MAX {
            c.energy[i] -= BIRTH_COST * size;
            let mut child = [0.0f32; GENOME_LEN];
            brain::mutate(&mut child, &c.genome[g..g + GENOME_LEN], rng, MUT_RATE, MUT_SIGMA);
            brain::inherit(&mut child, &c.learned[l..l + LEARN_LEN]);
            let ang = rng.next_f32() * 2.0 * PI;
            let (cx, cy) = (c.x[i] + cos(ang), c.y[i] + sin(ang));
            let (cx, cy) = if env.blocked(cx, cy) { (c.x[i], c.y[i]) } else { (cx, cy) };
            let gen = c.generation[i].saturating_add(1);
            let sp = c.species[i];
            let mut child_traits = [0.0f32; TRAIT_LEN];
            traits::mutate(&mut child_traits, &c.traits[tr..tr + TRAIT_LEN], rng);
            if let Some(k) = c.spawn(cx, cy, ang, CHILD_ENERGY * size, sp, gen, &child) {
                c.set_traits(k, &child_traits);
            }
        }
    }
    // --- death (descending pass: the swapped-in last creature was already processed) ---
    for i in (0..n).rev() {
        if c.energy[i] <= 0.0 {
            c.kill(i);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world;

    #[test]
    fn sin_cos_are_accurate() {
        for k in -200..200 {
            let x = k as f32 * 0.1;
            assert!((sin(x) - x.sin()).abs() < 0.002, "sin {}", x);
            assert!((cos(x) - x.cos()).abs() < 0.002, "cos {}", x);
        }
    }

    struct Sim {
        c: Box<Creatures>,
        grid: Box<SpatialHash>,
        biome: Vec<u8>,
        grass: Vec<f32>,
        rng: Rng,
        elites: Box<Elites>,
    }

    const W: usize = 128;
    const H: usize = 128;

    fn sim(seed: u64, creatures: usize) -> Sim {
        let mut c = unsafe { Box::<Creatures>::new_zeroed().assume_init() };
        c.clear();
        let (mut alt, mut biome) = (vec![0.0; W * H], vec![0u8; W * H]);
        world::generate(&mut alt, &mut biome, W, H, seed as u32);
        let grass: Vec<f32> = biome.iter().map(|&b| crate::plants::capacity(b) * 0.5).collect();
        let mut rng = Rng::new(seed);
        let mut placed = 0;
        while placed < creatures {
            let (x, y) = (rng.next_f32() * W as f32, rng.next_f32() * H as f32);
            if biome[y as usize * W + x as usize] >= world::PLAIN {
                let mut g = [0.0; GENOME_LEN];
                brain::random_genome(&mut g, &mut rng);
                c.spawn(x, y, 0.0, START_ENERGY, HERBIVORE, 0, &g);
                placed += 1;
            }
        }
        let mut elites = unsafe { Box::<Elites>::new_zeroed().assume_init() };
        elites.clear();
        Sim { c, grid: Box::new(SpatialHash::new()), biome, grass, rng, elites }
    }

    fn run(s: &mut Sim, ticks: u32) {
        run_from(s, 0, ticks)
    }

    fn run_from(s: &mut Sim, start: u32, ticks: u32) {
        for t in start..start + ticks {
            crate::plants::step(&mut s.grass, &s.biome, W * H, t, 0.0);
            let mut env = Env { w: W, h: H, biome: &s.biome, grass: &mut s.grass, daylight: 0.5 };
            step(&mut s.c, &mut s.grid, &mut env, &mut s.rng);
            maintain(&mut s.c, &mut s.elites, &env, &mut s.rng, t + 1);
        }
    }

    #[test]
    fn bigger_bodies_burn_more_and_far_sight_costs_extra() {
        // identical blank brains, no food at all: only the body plan differs
        let mut s = sim(6, 0);
        s.grass.iter_mut().for_each(|g| *g = 0.0);
        // uniform land, so that every creature moves exactly the same way (no path-dependent noise)
        s.biome.iter_mut().for_each(|b| *b = world::PLAIN);
        let blank = [0.0f32; GENOME_LEN];
        let plans: [[f32; TRAIT_LEN]; 4] = [
            [1.0, 1.0, 1.0, 0.5], // reference
            [1.6, 1.0, 1.0, 0.5], // big
            [0.6, 1.0, 1.0, 0.5], // small
            [1.0, 1.0, 1.8, 0.5], // far sight
        ];
        for (k, p) in plans.iter().enumerate() {
            let i = s.c.spawn(20.0 + 15.0 * k as f32, 60.0, 0.0, 40.0, HERBIVORE, 0, &blank).unwrap();
            s.c.set_traits(i, p);
        }
        let ids: Vec<u32> = (0..4).map(|i| s.c.id[i]).collect();
        let mut env = Env { w: W, h: H, biome: &s.biome, grass: &mut s.grass, daylight: 0.5 };
        for _ in 0..100 {
            step(&mut s.c, &mut s.grid, &mut env, &mut s.rng);
        }
        let energy = |id: u32| (0..s.c.count).find(|&i| s.c.id[i] == id).map(|i| s.c.energy[i]).unwrap();
        let (reference, big, small, sighted) = (energy(ids[0]), energy(ids[1]), energy(ids[2]), energy(ids[3]));
        assert!(big < reference, "a bigger body must burn more: {} vs {}", big, reference);
        assert!(small > reference, "a smaller body must burn less: {} vs {}", small, reference);
        assert!(sighted < reference, "far sight must cost extra: {} vs {}", sighted, reference);
    }

    #[test]
    fn a_much_bigger_prey_cannot_be_taken_down() {
        let mut s = sim(4, 0);
        for cell in s.biome.iter_mut() {
            *cell = world::PLAIN;
        }
        let blank = [0.0f32; GENOME_LEN];
        let mut hunter = blank;
        hunter[GENOME_LEN - 1] = 4.0; // hidden units
        hunter[GENOME_LEN - 1 - brain::OUT + 2] = 5.0; // always attack
        let h = s.c.spawn(40.5, 40.5, 0.0, 30.0, CARNIVORE, 0, &hunter).unwrap();
        s.c.set_traits(h, &[1.0, 1.0, 1.0, 0.5]);
        let giant = s.c.spawn(41.0, 40.5, 0.0, 40.0, HERBIVORE, 0, &blank).unwrap();
        s.c.set_traits(giant, &[1.6, 1.0, 1.0, 0.5]); // 1.6 > 1.3 × 1.0
        let mut env = Env { w: W, h: H, biome: &s.biome, grass: &mut s.grass, daylight: 0.5 };
        step(&mut s.c, &mut s.grid, &mut env, &mut s.rng);
        assert_eq!(count_species(&s.c, HERBIVORE), 1, "the giant survives the strike");
        // a normal-sized prey in the same spot is taken down
        let normal = s.c.spawn(41.0, 40.5, 0.0, 40.0, HERBIVORE, 0, &blank).unwrap();
        s.c.set_traits(normal, &[1.2, 1.0, 1.0, 0.5]); // 1.2 <= 1.3
        let mut env = Env { w: W, h: H, biome: &s.biome, grass: &mut s.grass, daylight: 0.5 };
        step(&mut s.c, &mut s.grid, &mut env, &mut s.rng);
        assert_eq!(count_species(&s.c, HERBIVORE), 1, "one of the two prey is gone (the normal one)");
        assert!((0..s.c.count).any(|i| s.c.species[i] == HERBIVORE && s.c.traits[i * TRAIT_LEN + traits::SIZE] > 1.5));
    }

    #[test]
    fn newborns_inherit_the_parents_body_plan_with_small_mutations() {
        let mut s = sim(7, 0);
        // a parent whose brain always wants to reproduce (output 3 bias strongly positive) and is rich
        let mut g = [0.0f32; GENOME_LEN];
        g[GENOME_LEN - 1] = 4.0; // hidden units
        let b2 = GENOME_LEN - 1 - brain::OUT; // start of b2
        g[b2 + 3] = 6.0;
        let p = s.c.spawn(60.0, 60.0, 0.0, 95.0, HERBIVORE, 0, &g).unwrap();
        s.c.set_traits(p, &[1.3, 0.8, 1.5, 0.2]);
        s.c.age[p] = 500;
        for cell in s.biome.iter_mut() {
            *cell = world::PLAIN;
        }
        let mut env = Env { w: W, h: H, biome: &s.biome, grass: &mut s.grass, daylight: 0.5 };
        step(&mut s.c, &mut s.grid, &mut env, &mut s.rng);
        assert_eq!(s.c.count, 2, "the parent must have given birth");
        let c = 1;
        assert_eq!(s.c.generation[c], 1);
        let t = &s.c.traits[c * TRAIT_LEN..(c + 1) * TRAIT_LEN];
        assert!((t[traits::SIZE] - 1.3).abs() < 0.3 && (t[traits::SPEED] - 0.8).abs() < 0.3 && (t[traits::VISION] - 1.5).abs() < 0.4);
        assert!((t[traits::HUE] - 0.2).abs() < 0.2, "lineage hue stays close: {}", t[traits::HUE]);
        // the child's starting energy scales with the parent's size
        assert!((s.c.energy[c] - CHILD_ENERGY * 1.3).abs() < 1e-3, "{}", s.c.energy[c]);
    }

    #[test]
    fn extinct_species_is_reborn_from_its_best_ancestors() {
        let mut s = sim(3, 300);
        run(&mut s, 1500); // the elite memory fills up
        assert!(s.elites.count > 0);
        let best = (0..s.elites.count).map(|k| s.elites.score[k]).fold(0.0f32, f32::max);
        // cataclysm: no creature left
        for i in (0..s.c.count).rev() {
            s.c.kill(i);
        }
        assert_eq!(s.c.count, 0);
        let env = Env { w: W, h: H, biome: &s.biome, grass: &mut s.grass, daylight: 0.5 };
        let born = maintain(&mut s.c, &mut s.elites, &env, &mut s.rng, 500);
        assert_eq!(born as usize, MIN_HERBIVORES);
        assert_eq!(s.c.count, MIN_HERBIVORES);
        assert_eq!(s.elites.rescues, 1);
        // the reborn descend from the elites: far better than random
        let comp = mean_competence(&s.c, HERBIVORE);
        assert!(comp > best - 0.15, "rebirth {} vs best elite {}", comp, best);
        // no rebirth if the population is large enough
        let env = Env { w: W, h: H, biome: &s.biome, grass: &mut s.grass, daylight: 0.5 };
        assert_eq!(maintain(&mut s.c, &mut s.elites, &env, &mut s.rng, 1000), 0);
    }

    #[test]
    fn meteor_kills_inside_only_and_burns_grass() {
        let mut s = sim(6, 0);
        let g = [0.0; GENOME_LEN];
        s.c.spawn(50.0, 50.0, 0.0, 50.0, HERBIVORE, 0, &g);
        s.c.spawn(53.0, 50.0, 0.0, 50.0, HERBIVORE, 0, &g);
        s.c.spawn(90.0, 90.0, 0.0, 50.0, HERBIVORE, 0, &g);
        s.grass.iter_mut().for_each(|v| *v = 0.7);
        let mut env = Env { w: W, h: H, biome: &s.biome, grass: &mut s.grass, daylight: 0.5 };
        assert_eq!(meteor(&mut s.c, &mut env, 50.0, 50.0, 5.0), 2);
        assert_eq!(s.c.count, 1);
        assert_eq!(s.c.x[0], 90.0);
        assert_eq!(s.grass[50 * W + 50], 0.0);
        assert_eq!(s.grass[90 * W + 90], 0.7);
    }

    #[test]
    fn bless_fills_energy_and_grass() {
        let mut s = sim(6, 0);
        let g = [0.0; GENOME_LEN];
        s.c.spawn(50.0, 50.0, 0.0, 5.0, HERBIVORE, 0, &g);
        s.c.spawn(100.0, 100.0, 0.0, 5.0, HERBIVORE, 0, &g);
        s.grass.iter_mut().for_each(|v| *v = 0.0);
        s.biome[50 * W + 50] = world::PLAIN;
        let mut env = Env { w: W, h: H, biome: &s.biome, grass: &mut s.grass, daylight: 0.5 };
        assert_eq!(bless(&mut s.c, &mut env, 50.0, 50.0, 4.0), 1);
        assert_eq!(s.c.energy[0], MAX_ENERGY);
        assert_eq!(s.c.energy[1], 5.0);
        assert_eq!(s.grass[50 * W + 50], 1.0);
    }

    #[test]
    fn deterministic_and_sane() {
        let (mut a, mut b) = (sim(5, 300), sim(5, 300));
        run(&mut a, 400);
        run(&mut b, 400);
        assert_eq!(a.c.count, b.c.count);
        assert_eq!(&a.c.x[..a.c.count], &b.c.x[..b.c.count]);
        assert_eq!(&a.c.energy[..a.c.count], &b.c.energy[..b.c.count]);
        let n = a.c.count;
        assert!(n <= crate::creatures::MAX);
        for i in 0..n {
            assert!(a.c.energy[i].is_finite() && a.c.energy[i] > 0.0 && a.c.energy[i] <= MAX_ENERGY * traits::RANGE[traits::SIZE].1 + 1.0);
            assert!(a.c.x[i] >= 0.0 && a.c.x[i] < W as f32 && a.c.y[i] >= 0.0 && a.c.y[i] < H as f32);
            assert!(a.biome[a.c.y[i] as usize * W + a.c.x[i] as usize] != DEEP_WATER);
        }
        let mut ids = a.c.id[..n].to_vec();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), n, "unique ids");
    }

    fn add_carnivores(s: &mut Sim, n: usize) {
        let mut placed = 0;
        while placed < n {
            let (x, y) = (s.rng.next_f32() * W as f32, s.rng.next_f32() * H as f32);
            if s.biome[y as usize * W + x as usize] >= world::PLAIN {
                let mut g = [0.0; GENOME_LEN];
                brain::random_genome(&mut g, &mut s.rng);
                s.c.spawn(x, y, 0.0, START_ENERGY, CARNIVORE, 0, &g);
                placed += 1;
            }
        }
    }

    #[test]
    fn herbivore_population_neither_explodes_nor_dies_out() {
        let mut s = sim(3, 300);
        let mut min = usize::MAX;
        let mut max = 0;
        for chunk in 0..6 {
            run_from(&mut s, chunk * 500, 500);
            if chunk >= 3 {
                min = min.min(s.c.count);
            }
            max = max.max(s.c.count);
        }
        assert!(min > 0, "extinction");
        assert!(max < 2500, "population boom: {}", max);
    }

    #[test]
    fn carnivores_kill_and_gain_energy() {
        let mut s = sim(4, 0);
        let g = [0.0; GENOME_LEN];
        // a predator with a forced "eat/attack" brain (positive output-2 bias) next to a prey
        let mut gp = g;
        gp[brain::GENOME_LEN - 1] = 4.0;
        let b2 = brain::GENOME_LEN - 1 - brain::OUT; // start of b2
        gp[b2 + 2] = 5.0;
        s.c.spawn(40.5, 40.5, 0.0, 30.0, CARNIVORE, 0, &gp);
        s.c.spawn(41.0, 40.5, 0.0, 40.0, HERBIVORE, 0, &g);
        for cell in s.biome.iter_mut() {
            *cell = world::PLAIN;
        }
        run(&mut s, 1);
        assert_eq!(count_species(&s.c, HERBIVORE), 0, "the prey is killed");
        assert!(s.c.energy[0] > 40.0, "the predator gains energy: {}", s.c.energy[0]);
    }

    #[test]
    fn long_run_with_predators_herbivores_survive_and_get_smarter() {
        let mut s = sim(3, 300);
        add_carnivores(&mut s, 8);
        let start = mean_competence(&s.c, HERBIVORE);
        run(&mut s, 8000);
        assert!(count_species(&s.c, HERBIVORE) > 0, "the herbivores disappeared");
        let end = mean_competence(&s.c, HERBIVORE);
        assert!((start - 0.5).abs() < 0.1, "random start: {}", start);
        assert!(end > 0.58, "intelligence must have progressed: {} -> {}", start, end);
        assert!(s.c.count < crate::creatures::MAX / 4);
    }

    #[test]
    #[ignore] // performance: cargo test perf_report -- --ignored --nocapture
    fn perf_report() {
        for n in [2_000usize, 5_000, 10_000, 20_000] {
            let mut s = sim(9, n);
            // the population evolves: measured over 200 ticks right after populating
            let t0 = std::time::Instant::now();
            run_from(&mut s, 0, 200);
            let dt = t0.elapsed().as_secs_f64();
            println!(
                "perf n0={:6} n_end={:6} -> {:7.0} ticks/s ({:.2} ms/tick, {:.2} us/creature/tick) [native, opt 3]",
                n, s.c.count, 200.0 / dt, dt * 1000.0 / 200.0, dt * 1e6 / 200.0 / s.c.count as f64
            );
        }
    }

    #[test]
    #[ignore] // diagnostic: cargo test traits_report -- --ignored --nocapture   (env: CARN, TICKS, SEED)
    fn traits_report() {
        let nc: usize = std::env::var("CARN").ok().and_then(|v| v.parse().ok()).unwrap_or(0);
        let ticks: u32 = std::env::var("TICKS").ok().and_then(|v| v.parse().ok()).unwrap_or(40_000);
        let seed: u64 = std::env::var("SEED").ok().and_then(|v| v.parse().ok()).unwrap_or(3);
        let mut s = sim(seed, 300);
        add_carnivores(&mut s, nc);
        let step_len = ticks / 20;
        for chunk in 0..20 {
            run_from(&mut s, chunk * step_len, step_len);
            let n = s.c.count;
            // spread (standard deviation) of the size trait among herbivores: is there still variety?
            let mean = mean_trait(&s.c, HERBIVORE, traits::SIZE);
            let mut var = 0.0f32;
            let mut k = 0u32;
            for i in 0..n {
                if s.c.species[i] == HERBIVORE {
                    var += (s.c.traits[i * TRAIT_LEN + traits::SIZE] - mean).powi(2);
                    k += 1;
                }
            }
            println!(
                "t={:6} herb={:5} carn={:3} size={:.3}±{:.3} speed={:.3} vision={:.3} comp={:.3}",
                (chunk + 1) * step_len,
                count_species(&s.c, HERBIVORE),
                count_species(&s.c, CARNIVORE),
                mean,
                if k > 0 { (var / k as f32).sqrt() } else { 0.0 },
                mean_trait(&s.c, HERBIVORE, traits::SPEED),
                mean_trait(&s.c, HERBIVORE, traits::VISION),
                mean_competence(&s.c, HERBIVORE)
            );
        }
    }

    #[test]
    #[ignore] // diagnostic: cargo test intelligence_report -- --ignored --nocapture
    fn intelligence_report() {
        let nc: usize = std::env::var("CARN").ok().and_then(|v| v.parse().ok()).unwrap_or(0);
        let ticks: u32 = std::env::var("TICKS").ok().and_then(|v| v.parse().ok()).unwrap_or(20_000);
        let mut s = sim(3, 300);
        add_carnivores(&mut s, nc);
        let step = ticks / 20;
        for chunk in 0..20 {
            run_from(&mut s, chunk * step, step);
            let n = s.c.count;
            // old creatures: competence of creatures older than 1000 ticks vs everyone
            let (mut old, mut oldn) = (0.0f32, 0u32);
            for i in 0..n {
                if s.c.age[i] > 1000 {
                    old += brain::competence(&s.c.genome[i * GENOME_LEN..(i + 1) * GENOME_LEN]);
                    oldn += 1;
                }
            }
            let maxgen = (0..n).map(|i| s.c.generation[i]).max().unwrap_or(0);
            println!(
                "t={:6} herb={:5} carn={:4} hid={:.2} comp_h={:.3} phen_h={:.3} comp_c={:.3} comp_old={:.3} gen_max={}",
                (chunk + 1) * step,
                count_species(&s.c, HERBIVORE),
                count_species(&s.c, CARNIVORE),
                mean_hidden(&s.c, HERBIVORE),
                mean_competence(&s.c, HERBIVORE),
                mean_phenotype_competence(&s.c, HERBIVORE),
                mean_competence(&s.c, CARNIVORE),
                if oldn > 0 { old / oldn as f32 } else { 0.0 },
                maxgen
            );
        }
    }

    #[test]
    #[ignore] // balance report: cargo test balance_report -- --ignored --nocapture
    fn balance_report() {
        let mut s = sim(3, 300);
        let nc: usize = std::env::var("CARN").ok().and_then(|v| v.parse().ok()).unwrap_or(30);
        add_carnivores(&mut s, nc);
        for chunk in 0..12 {
            run_from(&mut s, chunk * 500, 500);
            println!(
                "t={:5} herb={:5} carn={:4} hid_h={:.2} hid_c={:.2}",
                (chunk + 1) * 500,
                count_species(&s.c, HERBIVORE),
                count_species(&s.c, CARNIVORE),
                mean_hidden(&s.c, HERBIVORE),
                mean_hidden(&s.c, CARNIVORE)
            );
        }
    }

    #[test]
    fn creatures_eat_and_starve_without_food() {
        let mut s = sim(8, 100);
        let before: f32 = s.grass.iter().sum();
        run(&mut s, 50);
        assert!(s.grass.iter().sum::<f32>() < before + 5.0 || s.c.count > 0);
        // no grass at all: extinction (metabolism kills)
        let mut s = sim(8, 100);
        s.grass.iter_mut().for_each(|g| *g = 0.0);
        for _ in 0..1500 {
            let mut env = Env { w: W, h: H, biome: &s.biome, grass: &mut s.grass, daylight: 0.5 };
            step(&mut s.c, &mut s.grid, &mut env, &mut s.rng);
        }
        assert_eq!(s.c.count, 0);
    }
}
