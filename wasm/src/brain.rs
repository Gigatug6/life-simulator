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

/// Taille du vecteur « appris » : un delta par poids caché -> sortie.
pub const LEARN_LEN: usize = OUT * HID_MAX;
const NO_LEARNING: [f32; LEARN_LEN] = [0.0; LEARN_LEN];
const LEARN_RATE: f32 = 0.1;
const LEARN_DECAY: f32 = 0.9995; // l'apprentissage s'estompe lentement
const LEARN_CLAMP: f32 = 2.0;
/// Part de ce qui a été appris que les enfants héritent (génétiquement assimilé).
pub const INHERIT_FRACTION: f32 = 0.25;

/// Propagation avant (génome seul).
pub fn forward(genome: &[f32], input: &[f32; IN]) -> [f32; OUT] {
    forward_learn(genome, &NO_LEARNING, input).0
}

/// Propagation avant avec les deltas appris sur la couche de sortie ; renvoie aussi les activations cachées.
/// Les unités cachées au-delà de `hidden_count` sont ignorées.
pub fn forward_learn(genome: &[f32], learned: &[f32], input: &[f32; IN]) -> ([f32; OUT], [f32; HID_MAX]) {
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
            s += (genome[W2 + o * HID_MAX + h] + learned[o * HID_MAX + h]) * hid[h];
        }
        out[o] = tanh(s);
    }
    (out, hid)
}

/// Règle à trois facteurs (hebbienne modulée) : renforce l'action effectuée (`out`) dans le contexte
/// cérébral courant (`hid`) quand la récompense est positive, l'affaiblit quand elle est négative.
pub fn learn(learned: &mut [f32], nh: usize, hid: &[f32; HID_MAX], out: &[f32; OUT], reward: f32) {
    for o in 0..OUT {
        for h in 0..nh {
            let d = &mut learned[o * HID_MAX + h];
            *d = (*d * LEARN_DECAY + LEARN_RATE * reward * out[o] * hid[h]).clamp(-LEARN_CLAMP, LEARN_CLAMP);
        }
    }
}

/// Assimile une fraction des deltas appris par le parent dans le génome de l'enfant.
pub fn inherit(child_genome: &mut [f32], parent_learned: &[f32]) {
    for k in 0..LEARN_LEN {
        child_genome[W2 + k] += INHERIT_FRACTION * parent_learned[k];
    }
}

/// Compétence comportementale d'un génome, dans [0, 1] (0,5 = indifférent / aléatoire).
/// On soumet le cerveau à des situations types et on mesure s'il réagit « intelligemment » :
/// tourner vers la nourriture, avancer vers elle, ne pas foncer dans un obstacle, s'en détourner.
/// Sorties : [0] avancer (>0 = rapide), [1] tourner (<0 = vers la gauche, >0 = vers la droite).
pub fn competence(genome: &[f32]) -> f32 {
    competence_with(genome, &NO_LEARNING)
}

/// Compétence du phénotype (génome + apprentissage de la vie).
pub fn competence_with(genome: &[f32], learned: &[f32]) -> f32 {
    const BASE: [f32; IN] = [0.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.5];
    // (entrée activée, sortie observée, signe attendu)
    const PROBES: [(usize, usize, f32); 7] = [
        (0, 2, 1.0),  // herbe sous les pieds -> manger
        (2, 1, -1.0), // nourriture à gauche -> tourner à gauche
        (4, 1, 1.0),  // nourriture à droite -> tourner à droite
        (3, 0, 1.0),  // nourriture devant -> avancer
        (6, 0, -1.0), // obstacle devant -> ralentir
        (5, 1, 1.0),  // obstacle à gauche -> s'écarter vers la droite
        (7, 1, -1.0), // obstacle à droite -> s'écarter vers la gauche
    ];
    let mut total = 0.0;
    for (input, output, sign) in PROBES {
        let mut x = BASE;
        x[input] = 1.0;
        let out = forward_learn(genome, learned, &x).0[output];
        total += (1.0 + sign * out) * 0.5;
    }
    total / PROBES.len() as f32
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
    fn competence_is_neutral_for_blank_brain_and_high_for_a_wired_one() {
        let mut g = vec![0.0; GENOME_LEN];
        g[HID_GENE] = 4.0;
        assert!((competence(&g) - 0.5).abs() < 1e-6);
        // neurone 0 lit « nourriture à gauche », neurone 1 « nourriture à droite »
        g[W1 + 2] = 4.0;
        g[W1 + IN + 4] = 4.0;
        g[W2 + HID_MAX] = -4.0; // sortie « tourner » : −h0
        g[W2 + HID_MAX + 1] = 4.0; // + h1
        // 2 situations sur 7 parfaitement gérées + 5 neutres : (2×1 + 5×0,5) / 7 ≈ 0,643
        let c = competence(&g);
        assert!((c - 4.5 / 7.0).abs() < 0.02, "{}", c);
        // aléatoire : proche de 0,5 en moyenne
        let mut rng = Rng::new(5);
        let mean: f32 = (0..400)
            .map(|_| {
                let mut r = vec![0.0; GENOME_LEN];
                random_genome(&mut r, &mut rng);
                competence(&r)
            })
            .sum::<f32>()
            / 400.0;
        assert!((mean - 0.5).abs() < 0.05, "{}", mean);
    }

    #[test]
    fn learning_reinforces_rewarded_actions_and_stays_bounded() {
        let mut g = vec![0.0; GENOME_LEN];
        random_genome(&mut g, &mut Rng::new(11));
        let nh = hidden_count(&g);
        let input = [0.9, 0.5, 0.2, 0.0, 0.1, 0.0, 0.0, 0.0, 0.0, 0.5];
        let mut learned = [0.0f32; LEARN_LEN];
        let (out0, _) = forward_learn(&g, &learned, &input);
        // la sortie « manger » (2) est récompensée à chaque fois qu'elle est active
        for _ in 0..200 {
            let (out, hid) = forward_learn(&g, &learned, &input);
            let reward = if out[2] > -0.9 { 1.0 } else { 0.0 };
            learn(&mut learned, nh, &hid, &out, reward);
        }
        let (out1, _) = forward_learn(&g, &learned, &input);
        assert!(out1[2] > out0[2] || out0[2] > 0.99, "{} -> {}", out0[2], out1[2]);
        assert!(learned.iter().all(|d| d.abs() <= LEARN_CLAMP + 1e-6));
        // récompense négative : on désapprend l'action
        for _ in 0..400 {
            let (out, hid) = forward_learn(&g, &learned, &input);
            learn(&mut learned, nh, &hid, &out, -1.0);
        }
        let (out2, _) = forward_learn(&g, &learned, &input);
        assert!(out2[2] < out1[2] || out1[2] < -0.99, "{} -> {}", out1[2], out2[2]);
    }

    #[test]
    fn inheritance_assimilates_a_fraction_of_learning() {
        let mut child = vec![0.0; GENOME_LEN];
        let mut learned = [0.0f32; LEARN_LEN];
        learned[5] = 1.0;
        inherit(&mut child, &learned);
        assert!((child[W2 + 5] - INHERIT_FRACTION).abs() < 1e-6);
        assert_eq!(child[W2 + 6], 0.0);
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
