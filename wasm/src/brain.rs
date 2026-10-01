//! Brain: multilayer perceptron (inputs -> hidden layer -> tanh outputs).
//! The genome is a flat f32 array. Evolution can change the brain's structure: the number of active
//! hidden units is a gene, and so is the *kind* of each hidden neuron (tanh, bump, step, wave).
//! Two hidden units are fed back as memory inputs, and one output drives a light signal.
use crate::rng::Rng;

pub const IN: usize = 14; // inputs (see `life::step` for what each one senses)
pub const HID_MAX: usize = 12; // maximum hidden units
pub const HID_MIN: usize = 3;
pub const OUT: usize = 5; // outputs: advance, turn, eat/attack, reproduce, light signal

pub const W1: usize = 0;
pub const B1: usize = W1 + HID_MAX * IN;
pub const W2: usize = B1 + HID_MAX;
pub const B2: usize = W2 + OUT * HID_MAX;
/// Activation kind of each hidden neuron (stored as a float, rounded when read).
pub const ACT: usize = B2 + OUT;
pub const HID_GENE: usize = ACT + HID_MAX;
pub const GENOME_LEN: usize = HID_GENE + 1;

/// First of the later-added inputs (10 danger, 11 neighbours' light, 12-13 memory) and the light output.
pub const FIRST_NEW_INPUT: usize = 10;
const LIGHT_OUT: usize = 4;

/// Kinds of hidden neuron. Founders are all `ACT_TANH`; the others appear through mutation.
pub const ACT_TANH: usize = 0; // smooth, saturating (the classic neuron)
pub const ACT_BUMP: usize = 1; // fires near zero input, goes negative for strong input (a detector)
pub const ACT_STEP: usize = 2; // nearly binary: a switch
pub const ACT_WAVE: usize = 3; // periodic: responds to input ranges in alternation
pub const ACT_KINDS: usize = 4;
const ACT_MUT_RATE: f32 = 0.03; // chance per hidden neuron and birth to change kind

/// Rational tanh (Padé), bounded to [-1, 1], no exp (no_std).
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

/// Activation function of kind `kind`. All kinds map into [-1, 1].
pub fn activate(kind: usize, x: f32) -> f32 {
    match kind {
        ACT_BUMP => 2.0 / (1.0 + 3.0 * x * x) - 1.0,
        ACT_STEP => {
            let a = if x < 0.0 { -x } else { x };
            x / (a + 0.05)
        }
        ACT_WAVE => crate::life::sin(1.5 * x),
        _ => tanh(x),
    }
}

/// Kind of hidden neuron `h` (out-of-range values fall back to tanh).
pub fn activation_of(genome: &[f32], h: usize) -> usize {
    let k = (genome[ACT + h] + 0.5) as i32;
    if k >= 0 && (k as usize) < ACT_KINDS { k as usize } else { ACT_TANH }
}

/// Number of active hidden units (bounded).
pub fn hidden_count(genome: &[f32]) -> usize {
    let h = genome[HID_GENE] as i32;
    h.clamp(HID_MIN as i32, HID_MAX as i32) as usize
}

/// Random starting genome (small structure, all neurons tanh).
pub fn random_genome(genome: &mut [f32], rng: &mut Rng) {
    for g in genome[..ACT].iter_mut() {
        *g = rng.gauss() * 0.5;
    }
    // the new senses (danger, neighbours' light, memory) start almost unwired, and the light output starts
    // nearly dark: evolution has to discover how to use them instead of drowning in their noise
    for h in 0..HID_MAX {
        for i in FIRST_NEW_INPUT..IN {
            genome[W1 + h * IN + i] *= 0.1;
        }
        for o in LIGHT_OUT..OUT {
            genome[W2 + o * HID_MAX + h] *= 0.2;
        }
    }
    genome[B2 + LIGHT_OUT] = -1.0;
    for g in genome[ACT..HID_GENE].iter_mut() {
        *g = ACT_TANH as f32;
    }
    genome[HID_GENE] = HID_MIN as f32 + 1.0;
}

/// Size of the "learned" vector: one delta per hidden -> output weight.
pub const LEARN_LEN: usize = OUT * HID_MAX;
const NO_LEARNING: [f32; LEARN_LEN] = [0.0; LEARN_LEN];
const LEARN_RATE: f32 = 0.1;
const LEARN_DECAY: f32 = 0.9995; // learning fades slowly
const LEARN_CLAMP: f32 = 2.0;
/// Share of what was learned that children inherit (genetically assimilated).
pub const INHERIT_FRACTION: f32 = 0.25;

/// Forward pass (genome only).
pub fn forward(genome: &[f32], input: &[f32; IN]) -> [f32; OUT] {
    forward_learn(genome, &NO_LEARNING, input).0
}

/// Forward pass with the deltas learned on the output layer; also returns the hidden activations.
/// Hidden units beyond `hidden_count` are ignored.
pub fn forward_learn(genome: &[f32], learned: &[f32], input: &[f32; IN]) -> ([f32; OUT], [f32; HID_MAX]) {
    let nh = hidden_count(genome);
    let mut hid = [0.0f32; HID_MAX];
    for h in 0..nh {
        let mut s = genome[B1 + h];
        for i in 0..IN {
            s += genome[W1 + h * IN + i] * input[i];
        }
        hid[h] = activate(activation_of(genome, h), s);
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

/// Three-factor rule (modulated Hebbian): reinforces the action taken (`out`) in the current
/// brain context (`hid`) when the reward is positive, weakens it when negative.
pub fn learn(learned: &mut [f32], nh: usize, hid: &[f32; HID_MAX], out: &[f32; OUT], reward: f32) {
    for o in 0..OUT {
        for h in 0..nh {
            let d = &mut learned[o * HID_MAX + h];
            *d = (*d * LEARN_DECAY + LEARN_RATE * reward * out[o] * hid[h]).clamp(-LEARN_CLAMP, LEARN_CLAMP);
        }
    }
}

/// Assimilates a fraction of the parent's learned deltas into the child's genome.
pub fn inherit(child_genome: &mut [f32], parent_learned: &[f32]) {
    for k in 0..LEARN_LEN {
        child_genome[W2 + k] += INHERIT_FRACTION * parent_learned[k];
    }
}

/// Behavioural competence of a genome, in [0, 1] (0.5 = indifferent / random).
/// The brain is put through typical situations and we measure whether it reacts "intelligently":
/// turn towards food, advance towards it, not run into an obstacle, steer away from it.
/// Outputs: [0] advance (>0 = fast), [1] turn (<0 = left, >0 = right).
pub fn competence(genome: &[f32]) -> f32 {
    competence_with(genome, &NO_LEARNING)
}

/// Competence of the phenotype (genome + learning during life).
pub fn competence_with(genome: &[f32], learned: &[f32]) -> f32 {
    let mut base = [0.0f32; IN];
    base[1] = 0.5; // half energy
    base[9] = 0.5; // dusk
    // (input activated, output observed, expected sign)
    const PROBES: [(usize, usize, f32); 8] = [
        (10, 0, 1.0), // predator close -> speed up (flee)
        (0, 2, 1.0),  // grass underfoot -> eat
        (2, 1, -1.0), // food on the left -> turn left
        (4, 1, 1.0),  // food on the right -> turn right
        (3, 0, 1.0),  // food ahead -> advance
        (6, 0, -1.0), // obstacle ahead -> slow down
        (5, 1, 1.0),  // obstacle on the left -> steer right
        (7, 1, -1.0), // obstacle on the right -> steer left
    ];
    let mut total = 0.0;
    for (input, output, sign) in PROBES {
        let mut x = base;
        x[input] = 1.0;
        let out = forward_learn(genome, learned, &x).0[output];
        total += (1.0 + sign * out) * 0.5;
    }
    total / PROBES.len() as f32
}

/// Copies `parent` into `child` then mutates: Gaussian noise on the weights (probability `rate`,
/// deviation `sigma`), rarely ±1 hidden unit (growth slightly more likely than loss), and rarely a
/// hidden neuron changing kind.
pub fn mutate(child: &mut [f32], parent: &[f32], rng: &mut Rng, rate: f32, sigma: f32) {
    child[..GENOME_LEN].copy_from_slice(&parent[..GENOME_LEN]);
    for g in child[..ACT].iter_mut() {
        if rng.next_f32() < rate {
            *g += rng.gauss() * sigma;
        }
    }
    for h in 0..HID_MAX {
        if rng.next_f32() < ACT_MUT_RATE {
            child[ACT + h] = (rng.next_u32() as usize % ACT_KINDS) as f32;
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
            // std reference (tests only)
            assert!((t - x.tanh()).abs() < 0.03, "x={} {} vs {}", x, t, x.tanh());
        }
    }

    #[test]
    fn forward_is_deterministic_and_bounded() {
        let g = genome(1);
        let inp = [0.3, -0.5, 1.0, 0.0, 0.9, -1.0, 0.2, 0.4, -0.7, 0.1, 0.5, -0.3, 0.2, 0.0];
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
        g[HID_GENE] = HID_MAX as f32; // enabling these units changes the output
        assert_ne!(forward(&g, &inp), before);
    }

    #[test]
    fn neuron_kinds_are_bounded_and_behave_differently() {
        for kind in 0..ACT_KINDS {
            for k in -60..=60 {
                let v = activate(kind, k as f32 * 0.1);
                assert!((-1.0001..=1.0001).contains(&v), "kind {} at {}: {}", kind, k, v);
            }
        }
        assert!(activate(ACT_TANH, 2.0) > 0.9 && activate(ACT_TANH, -2.0) < -0.9);
        // a bump fires at zero and goes negative for strong input (either sign)
        assert!(activate(ACT_BUMP, 0.0) > 0.99 && activate(ACT_BUMP, 3.0) < -0.8 && activate(ACT_BUMP, -3.0) < -0.8);
        // a step is nearly binary
        assert!(activate(ACT_STEP, 0.5) > 0.85 && activate(ACT_STEP, -0.5) < -0.85);
        // a wave comes back: positive, then negative, then positive again as the input grows
        let signs: Vec<bool> = [0.5f32, 2.5, 4.5].iter().map(|&x| activate(ACT_WAVE, x) > 0.0).collect();
        assert_eq!(signs, vec![true, false, true]);
        // unknown kinds fall back to tanh
        let mut g = vec![0.0; GENOME_LEN];
        g[ACT] = 17.0;
        assert_eq!(activation_of(&g, 0), ACT_TANH);
        g[ACT] = 2.0;
        assert_eq!(activation_of(&g, 0), ACT_STEP);
    }

    #[test]
    fn neuron_kind_changes_the_output_and_mutates() {
        let mut g = genome(8);
        let inp = [0.5; IN];
        let tanh_out = forward(&g, &inp);
        for h in 0..HID_MAX {
            g[ACT + h] = ACT_WAVE as f32;
        }
        assert_ne!(forward(&g, &inp), tanh_out, "the kind of the hidden neurons matters");
        // founders are all tanh; mutation introduces other kinds, always valid
        let parent = genome(9);
        assert!((0..HID_MAX).all(|h| activation_of(&parent, h) == ACT_TANH));
        let mut rng = Rng::new(10);
        let mut child = vec![0.0; GENOME_LEN];
        let mut seen = [false; ACT_KINDS];
        let mut cur = parent.clone();
        for _ in 0..800 {
            mutate(&mut child, &cur, &mut rng, 0.0, 0.0);
            cur.copy_from_slice(&child);
            for h in 0..HID_MAX {
                seen[activation_of(&cur, h)] = true;
            }
        }
        assert!(seen.iter().all(|&s| s), "every kind should eventually appear: {:?}", seen);
    }

    #[test]
    fn competence_is_neutral_for_blank_brain_and_high_for_a_wired_one() {
        let mut g = vec![0.0; GENOME_LEN];
        g[HID_GENE] = 4.0;
        assert!((competence(&g) - 0.5).abs() < 1e-6);
        // neuron 0 reads "food on the left", neuron 1 reads "food on the right"
        g[W1 + 2] = 4.0;
        g[W1 + IN + 4] = 4.0;
        g[W2 + HID_MAX] = -4.0; // "turn" output: −h0
        g[W2 + HID_MAX + 1] = 4.0; // + h1
        // 2 of 8 situations handled perfectly + 6 neutral: (2×1 + 6×0.5) / 8 = 0.625
        let c = competence(&g);
        assert!((c - 0.625).abs() < 0.02, "{}", c);
        // random: close to 0.5 on average
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
        // the reward reinforces whatever was done, so start from an output that is clearly positive
        // (no incoming weights: only the bias drives it, tanh(1.0) ≈ 0.76)
        for h in 0..HID_MAX {
            g[W2 + 2 * HID_MAX + h] = 0.0;
        }
        g[B2 + 2] = 1.0;
        let nh = hidden_count(&g);
        let input = [0.9, 0.5, 0.2, 0.0, 0.1, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.0];
        let mut learned = [0.0f32; LEARN_LEN];
        let (out0, _) = forward_learn(&g, &learned, &input);
        // the "eat" output (2) is rewarded every time it is active
        for _ in 0..200 {
            let (out, hid) = forward_learn(&g, &learned, &input);
            let reward = if out[2] > 0.0 { 1.0 } else { 0.0 };
            learn(&mut learned, nh, &hid, &out, reward);
        }
        let (out1, _) = forward_learn(&g, &learned, &input);
        assert!(out1[2] > out0[2] || out0[2] > 0.99, "{} -> {}", out0[2], out1[2]);
        assert!(learned.iter().all(|d| d.abs() <= LEARN_CLAMP + 1e-6));
        // negative reward: the action is unlearned
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
        assert!(grew, "complexity must be able to increase");
        assert_ne!(&cur[..HID_GENE], &parent[..HID_GENE]);
        // zero rate: the weights are copied exactly (neuron kinds and hidden count may still mutate)
        mutate(&mut child, &parent, &mut rng, 0.0, 0.2);
        assert_eq!(&child[..ACT], &parent[..ACT]);
    }
}
