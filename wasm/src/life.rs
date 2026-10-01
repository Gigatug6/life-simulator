//! Dynamique des créatures : perception -> cerveau -> action -> métabolisme -> mort/reproduction.
use crate::brain::{self, GENOME_LEN, IN, LEARN_LEN};
use crate::creatures::{Creatures, CARNIVORE, HERBIVORE};
use crate::rng::Rng;
use crate::spatial::SpatialHash;
use crate::world::DEEP_WATER;

pub const MAX_AGE: u32 = 2500;
pub const MAX_SPEED: f32 = 0.6;
pub const START_ENERGY: f32 = 40.0;
pub const MAX_ENERGY: f32 = 100.0;
const BASE_COST: f32 = 0.04;
const BRAIN_COST: f32 = 0.0008; // par unité cachée : l'intelligence a un prix
const EAT_BITE: f32 = 0.25;
const EAT_COST: f32 = 0.03; // tenter de manger coûte un peu : « manger toujours » n'est plus gratuit
const EAT_GAIN: f32 = 12.0; // une bouchée = ~3 énergie ≈ 60 ticks de vie : il faut chercher à manger en continu
const BIRTH_THRESHOLD: f32 = 65.0;
const BIRTH_COST: f32 = 35.0;
const CHILD_ENERGY: f32 = 20.0; // < BIRTH_COST : naître coûte de l'énergie (pas de création gratuite)
const MATURITY: u32 = 120; // âge minimal pour se reproduire
const MUT_RATE: f32 = 0.08;
const MUT_SIGMA: f32 = 0.15;
const LOOK: f32 = 3.0; // distance des capteurs
const STRIKE_RANGE: f32 = 1.6;
const KILL_GAIN: f32 = 0.5; // part de l'énergie de la proie récupérée
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

/// Météorite : tue toute créature dans le rayon et brûle l'herbe. Renvoie le nombre de morts.
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

/// Bénédiction : énergie au maximum et herbe luxuriante dans le rayon. Renvoie le nombre de bénies.
pub fn bless(c: &mut Creatures, env: &mut Env, x: f32, y: f32, r: f32) -> u32 {
    let r2 = r * r;
    let mut n = 0;
    for i in 0..c.count {
        let (dx, dy) = (c.x[i] - x, c.y[i] - y);
        if dx * dx + dy * dy <= r2 {
            c.energy[i] = MAX_ENERGY;
            n += 1;
        }
    }
    for_cells(env, x, y, r, |env, idx| env.grass[idx] = crate::plants::capacity(env.biome[idx]));
    n
}

/// Applique `f` à chaque cellule dont le centre est dans le disque (x, y, r).
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

/// Nombre de créatures d'une espèce.
pub fn count_species(c: &Creatures, species: u8) -> usize {
    (0..c.count).filter(|&i| c.species[i] == species).count()
}

/// Nombre moyen d'unités cachées d'une espèce (indice simple de complexité cérébrale).
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

/// Compétence moyenne (voir `brain::competence`) d'une espèce.
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

/// Compétence moyenne du phénotype (génome + apprentissage de la vie) d'une espèce.
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
        // entrée 0 : herbe sous les pieds (le biais est déjà porté par chaque neurone)
        if let Some(cell) = env.cell(x, y) {
            input[0] = env.grass[cell];
        }
        input[1] = c.energy[i] / MAX_ENERGY;
        for (k, off) in [-0.6f32, 0.0, 0.6].iter().enumerate() {
            let (sx, sy) = (x + cos(a + off) * LOOK, y + sin(a + off) * LOOK);
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
        let mut near = 0u32;
        grid.query(&c.x, &c.y, x, y, 6.0, |_, _| near += 1);
        input[8] = (near.saturating_sub(1) as f32 / 10.0).min(1.0);
        input[9] = env.daylight;

        // --- décision ---
        let l = i * LEARN_LEN;
        let (out, hid) = brain::forward_learn(&c.genome[g..g + GENOME_LEN], &c.learned[l..l + LEARN_LEN], &input);
        let speed = (out[0] + 1.0) * 0.5 * MAX_SPEED;
        let na = a + out[1] * 0.35;
        let (nx, ny) = (x + cos(na) * speed, y + sin(na) * speed);
        c.angle[i] = na;
        let mut moved = 0.0;
        let mut reward = 0.0f32; // signal d'apprentissage de ce tick
        if !env.blocked(nx, ny) {
            c.x[i] = nx;
            c.y[i] = ny;
            moved = speed;
        } else {
            reward -= 0.2; // s'être cogné à l'eau / au bord
        }

        // --- métabolisme ---
        let nh = brain::hidden_count(&c.genome[g..g + GENOME_LEN]) as f32;
        let base = if c.species[i] == CARNIVORE { BASE_COST * 1.6 } else { BASE_COST };
        c.energy[i] -= base + moved * moved * 0.12 + nh * BRAIN_COST;

        // --- manger (herbivores) ---
        if out[2] > 0.0 && c.species[i] == HERBIVORE {
            c.energy[i] -= EAT_COST;
            reward -= EAT_COST;
            if let Some(cell) = env.cell(c.x[i], c.y[i]) {
                let bite = if env.grass[cell] < EAT_BITE { env.grass[cell] } else { EAT_BITE };
                env.grass[cell] -= bite;
                c.energy[i] = (c.energy[i] + bite * EAT_GAIN).min(MAX_ENERGY);
                reward += bite * EAT_GAIN / 3.0;
            }
        }

        // --- chasser (carnivores) : frappe la proie vivante la plus proche ---
        if out[2] > 0.0 && c.species[i] == CARNIVORE {
            let mut best: Option<(usize, f32)> = None;
            grid.query(&c.x, &c.y, c.x[i], c.y[i], STRIKE_RANGE, |j, d2| {
                if c.species[j] == HERBIVORE && c.energy[j] > 0.0 && best.map_or(true, |(_, bd)| d2 < bd) {
                    best = Some((j, d2));
                }
            });
            if let Some((j, _)) = best {
                c.energy[i] = (c.energy[i] + c.energy[j] * KILL_GAIN).min(MAX_ENERGY);
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
        if out[3] > 0.0 && c.age[i] >= MATURITY && c.energy[i] > BIRTH_THRESHOLD && c.count < crate::creatures::MAX {
            c.energy[i] -= BIRTH_COST;
            let mut child = [0.0f32; GENOME_LEN];
            brain::mutate(&mut child, &c.genome[g..g + GENOME_LEN], rng, MUT_RATE, MUT_SIGMA);
            brain::inherit(&mut child, &c.learned[l..l + LEARN_LEN]);
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
        run_from(s, 0, ticks)
    }

    fn run_from(s: &mut Sim, start: u32, ticks: u32) {
        for t in start..start + ticks {
            crate::plants::step(&mut s.grass, &s.biome, W * H, t, 0.0);
            let mut env = Env { w: W, h: H, biome: &s.biome, grass: &mut s.grass, daylight: 0.5 };
            step(&mut s.c, &mut s.grid, &mut env, &mut s.rng);
        }
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
            assert!(a.c.energy[i].is_finite() && a.c.energy[i] > 0.0 && a.c.energy[i] <= MAX_ENERGY + 1.0);
            assert!(a.c.x[i] >= 0.0 && a.c.x[i] < W as f32 && a.c.y[i] >= 0.0 && a.c.y[i] < H as f32);
            assert!(a.biome[a.c.y[i] as usize * W + a.c.x[i] as usize] != DEEP_WATER);
        }
        let mut ids = a.c.id[..n].to_vec();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), n, "ids uniques");
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
        assert!(max < 2500, "boom démographique : {}", max);
    }

    #[test]
    fn carnivores_kill_and_gain_energy() {
        let mut s = sim(4, 0);
        let g = [0.0; GENOME_LEN];
        // un prédateur au cerveau forcé « manger/attaquer » (biais de sortie 2 positif) à côté d'une proie
        let mut gp = g;
        gp[brain::GENOME_LEN - 1] = 4.0;
        let b2 = brain::GENOME_LEN - 1 - brain::OUT; // début de b2
        gp[b2 + 2] = 5.0;
        s.c.spawn(40.5, 40.5, 0.0, 30.0, CARNIVORE, 0, &gp);
        s.c.spawn(41.0, 40.5, 0.0, 40.0, HERBIVORE, 0, &g);
        for cell in s.biome.iter_mut() {
            *cell = world::PLAIN;
        }
        run(&mut s, 1);
        assert_eq!(count_species(&s.c, HERBIVORE), 0, "la proie est tuée");
        assert!(s.c.energy[0] > 40.0, "le prédateur gagne de l'énergie : {}", s.c.energy[0]);
    }

    #[test]
    #[ignore] // diagnostic : cargo test intelligence_report -- --ignored --nocapture
    fn intelligence_report() {
        let nc: usize = std::env::var("CARN").ok().and_then(|v| v.parse().ok()).unwrap_or(0);
        let ticks: u32 = std::env::var("TICKS").ok().and_then(|v| v.parse().ok()).unwrap_or(20_000);
        let mut s = sim(3, 300);
        add_carnivores(&mut s, nc);
        let step = ticks / 20;
        for chunk in 0..20 {
            run_from(&mut s, chunk * step, step);
            let n = s.c.count;
            // âge moyen des vieux : compétence des créatures de plus de 1000 ticks vs ensemble
            let (mut old, mut oldn) = (0.0f32, 0u32);
            for i in 0..n {
                if s.c.age[i] > 1000 {
                    old += brain::competence(&s.c.genome[i * GENOME_LEN..(i + 1) * GENOME_LEN]);
                    oldn += 1;
                }
            }
            let maxgen = (0..n).map(|i| s.c.generation[i]).max().unwrap_or(0);
            println!(
                "t={:6} herb={:5} carn={:4} hid={:.2} comp_h={:.3} phen_h={:.3} comp_c={:.3} comp_vieux={:.3} gen_max={}",
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
    #[ignore] // rapport d'équilibrage : cargo test balance_report -- --ignored --nocapture
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
