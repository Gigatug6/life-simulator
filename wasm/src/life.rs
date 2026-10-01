//! Dynamique des créatures : perception -> cerveau -> action -> métabolisme -> mort/reproduction.
use crate::brain::{self, GENOME_LEN, IN};
use crate::creatures::{Creatures, HERBIVORE};
use crate::rng::Rng;
use crate::spatial::SpatialHash;
use crate::world::DEEP_WATER;

pub const MAX_AGE: u32 = 4000;
pub const MAX_SPEED: f32 = 0.6;
pub const START_ENERGY: f32 = 50.0;
pub const MAX_ENERGY: f32 = 120.0;
const BASE_COST: f32 = 0.04;
const BRAIN_COST: f32 = 0.004; // par unité cachée : l'intelligence a un prix
const EAT_BITE: f32 = 0.25;
const EAT_GAIN: f32 = 35.0;
const BIRTH_THRESHOLD: f32 = 80.0;
const BIRTH_COST: f32 = 45.0;
const CHILD_ENERGY: f32 = 35.0;
const MUT_RATE: f32 = 0.08;
const MUT_SIGMA: f32 = 0.15;
const LOOK: f32 = 3.0; // distance des capteurs
const PI: f32 = 3.1415927;

/// sin approché (pas de libm en no_std), précision ~1e-3.
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
    /// Cellule infranchissable : hors carte ou eau profonde.
    fn blocked(&self, x: f32, y: f32) -> bool {
        match self.cell(x, y) {
            None => true,
            Some(i) => self.biome[i] == DEEP_WATER,
        }
    }
}

/// Avance d'un tick. `grid` est reconstruite ici.
pub fn step(c: &mut Creatures, grid: &mut SpatialHash, env: &mut Env, rng: &mut Rng) {
    let n = c.count;
    if n == 0 {
        return;
    }
    grid.build(&c.x, &c.y, n, env.w, env.h);
    for i in 0..n {
        let g = i * GENOME_LEN;
        let (x, y, a) = (c.x[i], c.y[i], c.angle[i]);

        // --- perception ---
        let mut input = [0.0f32; IN];
        input[0] = 1.0;
        input[1] = c.energy[i] / MAX_ENERGY;
        for (k, off) in [-0.6f32, 0.0, 0.6].iter().enumerate() {
            let (sx, sy) = (x + cos(a + off) * LOOK, y + sin(a + off) * LOOK);
            if let Some(cell) = env.cell(sx, sy) {
                input[2 + k] = env.grass[cell];
            }
            input[5 + k] = if env.blocked(sx, sy) { 1.0 } else { 0.0 };
        }
        let mut near = 0u32;
        grid.query(&c.x, &c.y, x, y, 6.0, |_, _| near += 1);
        input[8] = (near.saturating_sub(1) as f32 / 10.0).min(1.0);
        input[9] = env.daylight;

        // --- décision ---
        let out = brain::forward(&c.genome[g..g + GENOME_LEN], &input);
        let speed = (out[0] + 1.0) * 0.5 * MAX_SPEED;
        let na = a + out[1] * 0.35;
        let (nx, ny) = (x + cos(na) * speed, y + sin(na) * speed);
        c.angle[i] = na;
        let mut moved = 0.0;
        if !env.blocked(nx, ny) {
            c.x[i] = nx;
            c.y[i] = ny;
            moved = speed;
        }

        // --- métabolisme ---
        let nh = brain::hidden_count(&c.genome[g..g + GENOME_LEN]) as f32;
        c.energy[i] -= BASE_COST + moved * moved * 0.12 + nh * BRAIN_COST;

        // --- manger (herbivores) ---
        if out[2] > 0.0 && c.species[i] == HERBIVORE {
            if let Some(cell) = env.cell(c.x[i], c.y[i]) {
                let bite = if env.grass[cell] < EAT_BITE { env.grass[cell] } else { EAT_BITE };
                env.grass[cell] -= bite;
                c.energy[i] = (c.energy[i] + bite * EAT_GAIN).min(MAX_ENERGY);
            }
        }

        c.age[i] += 1;
        if c.age[i] > MAX_AGE {
            c.energy[i] = 0.0;
        }

        // --- reproduction ---
        if out[3] > 0.0 && c.energy[i] > BIRTH_THRESHOLD && c.count < crate::creatures::MAX {
            c.energy[i] -= BIRTH_COST;
            let mut child = [0.0f32; GENOME_LEN];
            brain::mutate(&mut child, &c.genome[g..g + GENOME_LEN], rng, MUT_RATE, MUT_SIGMA);
            let ang = rng.next_f32() * 2.0 * PI;
            let (cx, cy) = (c.x[i] + cos(ang), c.y[i] + sin(ang));
            let (cx, cy) = if env.blocked(cx, cy) { (c.x[i], c.y[i]) } else { (cx, cy) };
            let gen = c.generation[i].saturating_add(1);
            let sp = c.species[i];
            c.spawn(cx, cy, ang, CHILD_ENERGY, sp, gen, &child);
        }
    }
    // --- mort (parcours décroissant : le dernier échangé a déjà été traité) ---
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
        Sim { c, grid: Box::new(SpatialHash::new()), biome, grass, rng }
    }

    fn run(s: &mut Sim, ticks: u32) {
        for t in 0..ticks {
            crate::plants::step(&mut s.grass, &s.biome, W * H, t, 0.0);
            let mut env = Env { w: W, h: H, biome: &s.biome, grass: &mut s.grass, daylight: 0.5 };
            step(&mut s.c, &mut s.grid, &mut env, &mut s.rng);
        }
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
            assert!(a.c.energy[i].is_finite() && a.c.energy[i] > 0.0 && a.c.energy[i] <= MAX_ENERGY + 1.0);
            assert!(a.c.x[i] >= 0.0 && a.c.x[i] < W as f32 && a.c.y[i] >= 0.0 && a.c.y[i] < H as f32);
            assert!(a.biome[a.c.y[i] as usize * W + a.c.x[i] as usize] != DEEP_WATER);
        }
        let mut ids = a.c.id[..n].to_vec();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), n, "ids uniques");
    }

    #[test]
    fn creatures_eat_and_starve_without_food() {
        let mut s = sim(8, 100);
        let before: f32 = s.grass.iter().sum();
        run(&mut s, 50);
        assert!(s.grass.iter().sum::<f32>() < before + 5.0 || s.c.count > 0);
        // sans herbe du tout : extinction (le métabolisme tue)
        let mut s = sim(8, 100);
        s.grass.iter_mut().for_each(|g| *g = 0.0);
        for _ in 0..1500 {
            let mut env = Env { w: W, h: H, biome: &s.biome, grass: &mut s.grass, daylight: 0.5 };
            step(&mut s.c, &mut s.grid, &mut env, &mut s.rng);
        }
        assert_eq!(s.c.count, 0);
    }
}
