//! Stockage SoA des créatures (tableaux denses, suppression par échange avec le dernier).
use crate::brain::{GENOME_LEN, LEARN_LEN};

pub const MAX: usize = 20_000;

pub const HERBIVORE: u8 = 0;
pub const CARNIVORE: u8 = 1;

pub struct Creatures {
    pub count: usize,
    /// Nombre d'identifiants déjà attribués (0 au départ : toute la structure est nulle, donc hors du
    /// fichier .wasm — un champ non nul ferait embarquer ~19 Mo de zéros dans l'exécutable).
    pub issued: u32,
    pub x: [f32; MAX],
    pub y: [f32; MAX],
    pub angle: [f32; MAX],
    pub energy: [f32; MAX],
    pub age: [u32; MAX],
    pub id: [u32; MAX],
    pub generation: [u16; MAX],
    pub species: [u8; MAX],
    /// Génomes à plat : GENOME_LEN f32 par créature.
    pub genome: [f32; MAX * GENOME_LEN],
    /// Deltas appris pendant la vie (couche de sortie), LEARN_LEN f32 par créature.
    pub learned: [f32; MAX * LEARN_LEN],
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
        }
    }

    pub fn clear(&mut self) {
        self.count = 0;
        self.issued = 0;
    }

    /// Crée une créature ; renvoie son index, ou None si la population est pleine.
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
        self.count += 1;
        Some(i)
    }

    /// Supprime la créature `i` : la dernière prend sa place (les index ne sont pas stables, les id si).
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
        }
        self.count = last;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const G: [f32; GENOME_LEN] = [0.5; GENOME_LEN];

    fn boxed() -> Box<Creatures> {
        // ~15 Mo : alloué directement sur le tas, jamais sur la pile
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
        // l'apprentissage suit la créature échangée
        let mut d = boxed();
        d.spawn(0.0, 0.0, 0.0, 1.0, HERBIVORE, 0, &G);
        d.spawn(1.0, 0.0, 0.0, 1.0, HERBIVORE, 0, &G);
        d.learned[LEARN_LEN] = 0.75; // créature 1
        d.kill(0);
        assert_eq!(d.learned[0], 0.75);
        c.kill(10); // hors bornes : ignoré
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
