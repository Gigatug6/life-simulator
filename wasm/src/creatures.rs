//! Stockage SoA des créatures (tableaux denses, suppression par échange avec le dernier).
pub const MAX: usize = 20_000;

pub const HERBIVORE: u8 = 0;
pub const CARNIVORE: u8 = 1;

pub struct Creatures {
    pub count: usize,
    pub next_id: u32,
    pub x: [f32; MAX],
    pub y: [f32; MAX],
    pub angle: [f32; MAX],
    pub energy: [f32; MAX],
    pub age: [u32; MAX],
    pub id: [u32; MAX],
    pub generation: [u16; MAX],
    pub species: [u8; MAX],
}

impl Creatures {
    pub const fn new() -> Self {
        Creatures {
            count: 0,
            next_id: 1,
            x: [0.0; MAX],
            y: [0.0; MAX],
            angle: [0.0; MAX],
            energy: [0.0; MAX],
            age: [0; MAX],
            id: [0; MAX],
            generation: [0; MAX],
            species: [0; MAX],
        }
    }

    pub fn clear(&mut self) {
        self.count = 0;
        self.next_id = 1;
    }

    /// Crée une créature ; renvoie son index, ou None si la population est pleine.
    pub fn spawn(&mut self, x: f32, y: f32, angle: f32, energy: f32, species: u8, generation: u16) -> Option<usize> {
        if self.count >= MAX {
            return None;
        }
        let i = self.count;
        self.x[i] = x;
        self.y[i] = y;
        self.angle[i] = angle;
        self.energy[i] = energy;
        self.age[i] = 0;
        self.id[i] = self.next_id;
        self.generation[i] = generation;
        self.species[i] = species;
        self.next_id = self.next_id.wrapping_add(1);
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
        }
        self.count = last;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn boxed() -> Box<Creatures> {
        // évite de passer ~500 Ko par la pile
        let mut b = Box::new(Creatures::new());
        b.clear();
        b
    }

    #[test]
    fn spawn_and_unique_ids() {
        let mut c = boxed();
        let a = c.spawn(1.0, 2.0, 0.0, 10.0, HERBIVORE, 0).unwrap();
        let b = c.spawn(3.0, 4.0, 0.0, 10.0, CARNIVORE, 0).unwrap();
        assert_eq!((a, b, c.count), (0, 1, 2));
        assert_ne!(c.id[a], c.id[b]);
        assert_eq!(c.species[b], CARNIVORE);
    }

    #[test]
    fn kill_swaps_last_keeping_id() {
        let mut c = boxed();
        for k in 0..3 {
            c.spawn(k as f32, 0.0, 0.0, 1.0, HERBIVORE, 0);
        }
        let last_id = c.id[2];
        c.kill(0);
        assert_eq!(c.count, 2);
        assert_eq!(c.id[0], last_id);
        assert_eq!(c.x[0], 2.0);
        c.kill(10); // hors bornes : ignoré
        assert_eq!(c.count, 2);
    }

    #[test]
    fn capacity_is_enforced() {
        let mut c = boxed();
        for _ in 0..MAX {
            assert!(c.spawn(0.0, 0.0, 0.0, 1.0, HERBIVORE, 0).is_some());
        }
        assert!(c.spawn(0.0, 0.0, 0.0, 1.0, HERBIVORE, 0).is_none());
    }
}
