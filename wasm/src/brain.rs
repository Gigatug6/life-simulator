//! Cerveau : perceptron multicouche (entrées -> couche cachée tanh -> sorties tanh).
//! Le génome est un tableau plat de f32 ; le nombre d'unités cachées actives est lui-même un gène,
//! ce qui permet à l'évolution d'augmenter la complexité cérébrale.
use crate::rng::Rng;

pub const IN: usize = 10; // entrées
pub const HID_MAX: usize = 12; // unités cachées maximales
pub const HID_MIN: usize = 3;
pub const OUT: usize = 4; // sorties : avance, rotation, manger/attaquer, reproduire

const W1: usize = 0;
const B1: usize = W1 + HID_MAX * IN;
const W2: usize = B1 + HID_MAX;
const B2: usize = W2 + OUT * HID_MAX;
const HID_GENE: usize = B2 + OUT;
pub const GENOME_LEN: usize = HID_GENE + 1;

/// tanh rationnelle (Padé), bornée à [-1, 1], sans exp (no_std).
pub fn tanh(x: f32) -> f32 {
    if x > 3.0 {
        return 1.0;
    }
    if x < -3.0 {
        return -1.0;
    }
    let x2 = x * x;
    x * (27.0 + x2) / (27.0 + 9.0 * x2)
}

/// Nombre d'unités cachées actives (borné).
pub fn hidden_count(genome: &[f32]) -> usize {
    let h = genome[HID_GENE] as i32;
    h.clamp(HID_MIN as i32, HID_MAX as i32) as usize
}

/// Gaussienne approchée (Irwin-Hall, 4 tirages), écart-type ~1.
fn gauss(rng: &mut Rng) -> f32 {
    let s = rng.next_f32() + rng.next_f32() + rng.next_f32() + rng.next_f32();
    (s - 2.0) * 1.732
}

/// Génome aléatoire de départ (petite structure).
pub fn random_genome(genome: &mut [f32], rng: &mut Rng) {
    for g in genome[..HID_GENE].iter_mut() {
        *g = gauss(rng) * 0.5;
    }
    genome[HID_GENE] = HID_MIN as f32 + 1.0;
}

/// Propagation avant. Les unités cachées au-delà de `hidden_count` sont ignorées.
pub fn forward(genome: &[f32], input: &[f32; IN]) -> [f32; OUT] {
    let nh = hidden_count(genome);
    let mut hid = [0.0f32; HID_MAX];
    for h in 0..nh {
        let mut s = genome[B1 + h];
        for i in 0..IN {
            s += genome[W1 + h * IN + i] * input[i];
        }
        hid[h] = tanh(s);
    }
    let mut out = [0.0f32; OUT];
    for o in 0..OUT {
        let mut s = genome[B2 + o];
        for h in 0..nh {
            s += genome[W2 + o * HID_MAX + h] * hid[h];
        }
        out[o] = tanh(s);
    }
    out
}

/// Copie `parent` dans `child` puis mute : bruit gaussien sur les poids (probabilité `rate`,
/// écart `sigma`) et, rarement, ±1 unité cachée (croissance un peu plus probable que la perte).
pub fn mutate(child: &mut [f32], parent: &[f32], rng: &mut Rng, rate: f32, sigma: f32) {
    child[..GENOME_LEN].copy_from_slice(&parent[..GENOME_LEN]);
    for g in child[..HID_GENE].iter_mut() {
        if rng.next_f32() < rate {
            *g += gauss(rng) * sigma;
        }
    }
    let r = rng.next_f32();
    let mut nh = hidden_count(parent) as i32;
    if r < 0.03 {
        nh += 1;
    } else if r < 0.05 {
        nh -= 1;
    }
    child[HID_GENE] = nh.clamp(HID_MIN as i32, HID_MAX as i32) as f32;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn genome(seed: u64) -> Vec<f32> {
        let mut g = vec![0.0; GENOME_LEN];
        random_genome(&mut g, &mut Rng::new(seed));
        g
    }

    #[test]
    fn tanh_is_bounded_and_close() {
        for k in -40..=40 {
            let x = k as f32 * 0.25;
            let t = tanh(x);
            assert!((-1.0..=1.0).contains(&t));
            // référence std (tests uniquement)
            assert!((t - x.tanh()).abs() < 0.03, "x={} {} vs {}", x, t, x.tanh());
        }
    }

    #[test]
    fn forward_is_deterministic_and_bounded() {
        let g = genome(1);
        let inp = [0.3, -0.5, 1.0, 0.0, 0.9, -1.0, 0.2, 0.4, -0.7, 0.1];
        let a = forward(&g, &inp);
        assert_eq!(a, forward(&g, &inp));
        assert!(a.iter().all(|v| (-1.0..=1.0).contains(v)));
        assert_ne!(forward(&genome(2), &inp), a);
    }

    #[test]
    fn inactive_hidden_units_are_ignored() {
        let mut g = genome(3);
        let inp = [0.5; IN];
        let before = forward(&g, &inp);
        let nh = hidden_count(&g);
        for h in nh..HID_MAX {
            g[B1 + h] = 5.0;
            for i in 0..IN {
                g[W1 + h * IN + i] = 5.0;
            }
            for o in 0..OUT {
                g[W2 + o * HID_MAX + h] = 5.0;
            }
        }
        assert_eq!(forward(&g, &inp), before);
        g[HID_GENE] = HID_MAX as f32; // activer ces unités change la sortie
        assert_ne!(forward(&g, &inp), before);
    }

    #[test]
    fn mutation_changes_weights_and_keeps_structure_in_bounds() {
        let parent = genome(4);
        let mut rng = Rng::new(99);
        let mut grew = false;
        let mut child = vec![0.0; GENOME_LEN];
        let mut cur = parent.clone();
        for _ in 0..2000 {
            mutate(&mut child, &cur, &mut rng, 0.1, 0.2);
            let nh = hidden_count(&child);
            assert!((HID_MIN..=HID_MAX).contains(&nh));
            grew |= nh > hidden_count(&cur);
            cur.copy_from_slice(&child);
        }
        assert!(grew, "la complexité doit pouvoir augmenter");
        assert_ne!(&cur[..HID_GENE], &parent[..HID_GENE]);
        // taux nul : copie exacte des poids
        mutate(&mut child, &parent, &mut rng, 0.0, 0.2);
        assert_eq!(&child[..HID_GENE], &parent[..HID_GENE]);
    }
}
