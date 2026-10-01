//! Grille de hachage spatial (tri par comptage) : voisinage en O(n) au lieu de O(n²).
use crate::creatures::MAX;

pub const CELL: f32 = 8.0; // taille d'une case en unités du monde
const MAX_COLS: usize = 64; // 512 / 8
const MAX_CELLS: usize = MAX_COLS * MAX_COLS;

pub struct SpatialHash {
    cols: usize,
    rows: usize,
    start: [u32; MAX_CELLS + 1],
    items: [u32; MAX],
    cell_of: [u16; MAX],
}

impl SpatialHash {
    pub const fn new() -> Self {
        SpatialHash { cols: 0, rows: 0, start: [0; MAX_CELLS + 1], items: [0; MAX], cell_of: [0; MAX] }
    }

    fn cell_xy(&self, x: f32, y: f32) -> (usize, usize) {
        let cx = (x / CELL) as i32;
        let cy = (y / CELL) as i32;
        (cx.clamp(0, self.cols as i32 - 1) as usize, cy.clamp(0, self.rows as i32 - 1) as usize)
    }

    /// Reconstruit la grille pour `n` points dans un monde `w` × `h` (<= 512).
    pub fn build(&mut self, xs: &[f32], ys: &[f32], n: usize, w: usize, h: usize) {
        self.cols = ((w as f32 / CELL) as usize + 1).min(MAX_COLS);
        self.rows = ((h as f32 / CELL) as usize + 1).min(MAX_COLS);
        let cells = self.cols * self.rows;
        for c in self.start[..=cells].iter_mut() {
            *c = 0;
        }
        for i in 0..n {
            let (cx, cy) = self.cell_xy(xs[i], ys[i]);
            let c = cy * self.cols + cx;
            self.cell_of[i] = c as u16;
            self.start[c + 1] += 1;
        }
        for c in 0..cells {
            self.start[c + 1] += self.start[c];
        }
        // remplissage : on utilise un curseur par case réutilisant `start` puis on le restaure
        for i in 0..n {
            let c = self.cell_of[i] as usize;
            self.items[self.start[c] as usize] = i as u32;
            self.start[c] += 1;
        }
        for c in (1..=cells).rev() {
            self.start[c] = self.start[c - 1];
        }
        self.start[0] = 0;
    }

    /// Compte les points à moins de `r` de (x, y), en s'arrêtant dès que `cap` est atteint
    /// (coût borné même en forte densité).
    pub fn count_up_to(&self, xs: &[f32], ys: &[f32], x: f32, y: f32, r: f32, cap: u32) -> u32 {
        if self.cols == 0 {
            return 0;
        }
        let (x0, y0) = self.cell_xy(x - r, y - r);
        let (x1, y1) = self.cell_xy(x + r, y + r);
        let r2 = r * r;
        let mut n = 0;
        for cy in y0..=y1 {
            for cx in x0..=x1 {
                let c = cy * self.cols + cx;
                for k in self.start[c]..self.start[c + 1] {
                    let i = self.items[k as usize] as usize;
                    let (dx, dy) = (xs[i] - x, ys[i] - y);
                    if dx * dx + dy * dy <= r2 {
                        n += 1;
                        if n >= cap {
                            return n;
                        }
                    }
                }
            }
        }
        n
    }

    /// Appelle `f(index, distance²)` pour chaque point à moins de `r` de (x, y).
    pub fn query<F: FnMut(usize, f32)>(&self, xs: &[f32], ys: &[f32], x: f32, y: f32, r: f32, mut f: F) {
        if self.cols == 0 {
            return;
        }
        let (x0, y0) = self.cell_xy(x - r, y - r);
        let (x1, y1) = self.cell_xy(x + r, y + r);
        let r2 = r * r;
        for cy in y0..=y1 {
            for cx in x0..=x1 {
                let c = cy * self.cols + cx;
                for k in self.start[c]..self.start[c + 1] {
                    let i = self.items[k as usize] as usize;
                    let (dx, dy) = (xs[i] - x, ys[i] - y);
                    let d2 = dx * dx + dy * dy;
                    if d2 <= r2 {
                        f(i, d2);
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rng::Rng;

    #[test]
    fn matches_brute_force() {
        let (w, h, n) = (200usize, 150usize, 3000usize);
        let mut rng = Rng::new(9);
        let xs: Vec<f32> = (0..n).map(|_| rng.next_f32() * w as f32).collect();
        let ys: Vec<f32> = (0..n).map(|_| rng.next_f32() * h as f32).collect();
        let mut grid = Box::new(SpatialHash::new());
        grid.build(&xs, &ys, n, w, h);
        for _ in 0..50 {
            let (qx, qy, r) = (rng.next_f32() * w as f32, rng.next_f32() * h as f32, 3.0 + rng.next_f32() * 20.0);
            let mut got = Vec::new();
            grid.query(&xs, &ys, qx, qy, r, |i, _| got.push(i));
            got.sort();
            let want: Vec<usize> =
                (0..n).filter(|&i| (xs[i] - qx).powi(2) + (ys[i] - qy).powi(2) <= r * r).collect();
            assert_eq!(got, want);
        }
    }

    #[test]
    fn count_up_to_matches_query_and_respects_the_cap() {
        let (w, h, n) = (100usize, 100usize, 2000usize);
        let mut rng = Rng::new(4);
        let xs: Vec<f32> = (0..n).map(|_| rng.next_f32() * w as f32).collect();
        let ys: Vec<f32> = (0..n).map(|_| rng.next_f32() * h as f32).collect();
        let mut grid = Box::new(SpatialHash::new());
        grid.build(&xs, &ys, n, w, h);
        for _ in 0..30 {
            let (qx, qy) = (rng.next_f32() * w as f32, rng.next_f32() * h as f32);
            let mut all = 0;
            grid.query(&xs, &ys, qx, qy, 6.0, |_, _| all += 1);
            assert_eq!(grid.count_up_to(&xs, &ys, qx, qy, 6.0, u32::MAX), all);
            assert_eq!(grid.count_up_to(&xs, &ys, qx, qy, 6.0, 3), all.min(3));
        }
    }

    #[test]
    fn handles_out_of_bounds_and_empty() {
        let mut grid = Box::new(SpatialHash::new());
        grid.build(&[-5.0, 1000.0], &[-5.0, 1000.0], 2, 64, 64); // clampés dans la grille
        let mut c = 0;
        grid.query(&[-5.0, 1000.0], &[-5.0, 1000.0], 0.0, 0.0, 10.0, |_, _| c += 1);
        assert_eq!(c, 1);
        grid.build(&[], &[], 0, 64, 64);
        grid.query(&[], &[], 0.0, 0.0, 10.0, |_, _| panic!("vide"));
    }
}
