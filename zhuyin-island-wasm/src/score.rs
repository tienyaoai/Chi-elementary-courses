pub fn stars_for(correct: usize, total: usize) -> u8 {
    if total == 0 || correct >= total {
        return 3;
    }
    if correct * 4 >= total * 3 {
        return 2;
    }
    1
}

pub fn memory_stars(moves: usize, pairs: usize) -> u8 {
    if moves <= pairs + 4 {
        3
    } else if moves <= pairs + 10 {
        2
    } else {
        1
    }
}
