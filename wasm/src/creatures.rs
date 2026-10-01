//! SoA storage for creatures (dense arrays, removal by swapping with the last one).
use crate::brain::{GENOME_LEN, LEARN_LEN};
use crate::traits::{self, TRAIT_LEN};

/// Memory cells per creature: the previous tick's activation of the first two hidden neurons.
pub const MEM_LEN: usize = 2;

pub const MAX: usize = 20_000;

pub const HERBIVORE: u8 = 0;
pub const CARNIVORE: u8 = 1;

pub struct Creatures {
    pub count: usize,
    /// Number of ids already issued (0 at start: the whole struct is zero, so it stays out of the
    /// .wasm file — a non-zero field would embed ~19 MB of zeros in the binary).
    pub issued: u32,
    pub x: [f32; MAX],
    pub y: [f32; MAX],
    pub angle: [f32; MAX],
    pub energy: [f32; MAX],
    pub age: [u32; MAX],
    pub id: [u32; MAX],
    pub generation: [u16; MAX],
    pub species: [u8; MAX],
    /// Flat genomes: GENOME_LEN f32 per creature.
    pub genome: [f32; MAX * GENOME_LEN],
    /// Deltas learned during life (output layer), LEARN_LEN f32 per creature.
    pub learned: [f32; MAX * LEARN_LEN],
    /// Physical traits (size, speed, vision, hue), TRAIT_LEN f32 per creature.
    pub traits: [f32; MAX * TRAIT_LEN],
    /// Recurrent memory (fed back as brain inputs), MEM_LEN f32 per creature.
    pub memory: [f32; MAX * MEM_LEN],
    /// Light signal 0..1 emitted this tick (bioluminescence), sensed by neighbours.
    pub signal: [f32; MAX],
}

impl Creatures {
    pub const fn new() -> Self {
        Creatures {
            count: 0,
            issued: 0,
            x: [0.0; MAX],
            y: [0.0; MAX],
            angle: [0.0; MAX],
            energy: [0.0; MAX],
            age: [0; MAX],
            id: [0; MAX],
            generation: [0; MAX],
            species: [0; MAX],
            genome: [0.0; MAX * GENOME_LEN],
            learned: [0.0; MAX * LEARN_LEN],
            traits: [0.0; MAX * TRAIT_LEN],
            memory: [0.0; MAX * MEM_LEN],
            signal: [0.0; MAX],
        }
    }

    pub fn clear(&mut self) {
        self.count = 0;
        self.issued = 0;
    }

    /// Creates a creature; returns its index, or None if the population is full.
    pub fn spawn(&mut self, x: f32, y: f32, angle: f32, energy: f32, species: u8, generation: u16, genome: &[f32]) -> Option<usize> {
        if self.count >= MAX {
            return None;
        }
        let i = self.count;
        self.x[i] = x;
        self.y[i] = y;
        self.angle[i] = angle;
        self.energy[i] = energy;
        self.age[i] = 0;
        self.issued = self.issued.wrapping_add(1);
        self.id[i] = self.issued;
        self.generation[i] = generation;
        self.species[i] = species;
        self.genome[i * GENOME_LEN..(i + 1) * GENOME_LEN].copy_from_slice(&genome[..GENOME_LEN]);
        self.learned[i * LEARN_LEN..(i + 1) * LEARN_LEN].fill(0.0);
        self.traits[i * TRAIT_LEN..(i + 1) * TRAIT_LEN].copy_from_slice(&traits::DEFAULT);
        self.memory[i * MEM_LEN..(i + 1) * MEM_LEN].fill(0.0);
        self.signal[i] = 0.0;
        self.count += 1;
        Some(i)
    }

    /// Overwrites the physical traits of creature `i`.
    pub fn set_traits(&mut self, i: usize, t: &[f32]) {
        self.traits[i * TRAIT_LEN..(i + 1) * TRAIT_LEN].copy_from_slice(&t[..TRAIT_LEN]);
    }

    /// Removes creature `i`: the last one takes its place (indices are not stable, ids are).
    pub fn kill(&mut self, i: usize) {
        if i >= self.count {
            return;
        }
        let last = self.count - 1;
        if i != last {
            self.x[i] = self.x[last];
            self.y[i] = self.y[last];
            self.angle[i] = self.angle[last];
            self.energy[i] = self.energy[last];
            self.age[i] = self.age[last];
            self.id[i] = self.id[last];
            self.generation[i] = self.generation[last];
            self.species[i] = self.species[last];
            self.genome.copy_within(last * GENOME_LEN..(last + 1) * GENOME_LEN, i * GENOME_LEN);
            self.learned.copy_within(last * LEARN_LEN..(last + 1) * LEARN_LEN, i * LEARN_LEN);
            self.traits.copy_within(last * TRAIT_LEN..(last + 1) * TRAIT_LEN, i * TRAIT_LEN);
            self.memory.copy_within(last * MEM_LEN..(last + 1) * MEM_LEN, i * MEM_LEN);
            self.signal[i] = self.signal[last];
        }
        self.count = last;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const G: [f32; GENOME_LEN] = [0.5; GENOME_LEN];

    fn boxed() -> Box<Creatures> {
        // ~15 MB: allocated directly on the heap, never on the stack
        let mut b = unsafe { Box::<Creatures>::new_zeroed().assume_init() };
        b.clear();
        b
    }

    #[test]
    fn spawn_and_unique_ids() {
        let mut c = boxed();
        let a = c.spawn(1.0, 2.0, 0.0, 10.0, HERBIVORE, 0, &G).unwrap();
        let b = c.spawn(3.0, 4.0, 0.0, 10.0, CARNIVORE, 0, &G).unwrap();
        assert_eq!((a, b, c.count), (0, 1, 2));
        assert_ne!(c.id[a], c.id[b]);
        assert_eq!(c.species[b], CARNIVORE);
    }

    #[test]
    fn kill_swaps_last_keeping_id() {
        let mut c = boxed();
        for k in 0..3 {
            c.spawn(k as f32, 0.0, 0.0, 1.0, HERBIVORE, 0, &G);
        }
        let last_id = c.id[2];
        c.kill(0);
        assert_eq!(c.count, 2);
        assert_eq!(c.id[0], last_id);
        assert_eq!(c.x[0], 2.0);
        assert_eq!(c.genome[0], 0.5);
        // learning follows the swapped creature
        let mut d = boxed();
        d.spawn(0.0, 0.0, 0.0, 1.0, HERBIVORE, 0, &G);
        d.spawn(1.0, 0.0, 0.0, 1.0, HERBIVORE, 0, &G);
        d.learned[LEARN_LEN] = 0.75; // creature 1
        d.kill(0);
        assert_eq!(d.learned[0], 0.75);
        // traits follow the swapped creature too, and new creatures start with the default body plan
        assert_eq!(d.traits[0], traits::DEFAULT[0]);
        let mut e = boxed();
        e.spawn(0.0, 0.0, 0.0, 1.0, HERBIVORE, 0, &G);
        e.spawn(1.0, 0.0, 0.0, 1.0, HERBIVORE, 0, &G);
        e.set_traits(1, &[1.4, 0.7, 1.2, 0.25]);
        e.kill(0);
        assert_eq!(&e.traits[..TRAIT_LEN], &[1.4, 0.7, 1.2, 0.25]);
        // memory and light signal follow too
        let mut f = boxed();
        f.spawn(0.0, 0.0, 0.0, 1.0, HERBIVORE, 0, &G);
        f.spawn(1.0, 0.0, 0.0, 1.0, HERBIVORE, 0, &G);
        f.memory[MEM_LEN] = 0.5;
        f.memory[MEM_LEN + 1] = -0.25;
        f.signal[1] = 0.9;
        f.kill(0);
        assert_eq!((f.memory[0], f.memory[1], f.signal[0]), (0.5, -0.25, 0.9));
        // a fresh creature has no memory and emits no light
        f.spawn(2.0, 0.0, 0.0, 1.0, HERBIVORE, 0, &G);
        assert_eq!((f.memory[MEM_LEN], f.signal[1]), (0.0, 0.0));
        c.kill(10); // out of bounds: ignored
        assert_eq!(c.count, 2);
    }

    #[test]
    fn capacity_is_enforced() {
        let mut c = boxed();
        for _ in 0..MAX {
            assert!(c.spawn(0.0, 0.0, 0.0, 1.0, HERBIVORE, 0, &G).is_some());
        }
        assert!(c.spawn(0.0, 0.0, 0.0, 1.0, HERBIVORE, 0, &G).is_none());
    }
}
