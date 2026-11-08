use rand::seq::SliceRandom;
use rand::thread_rng;

pub fn shuffle<T: Clone>(list: &[T]) -> Vec<T> {
    let mut copy = list.to_vec();
    copy.shuffle(&mut thread_rng());
    copy
}

pub fn sample<T: Clone>(list: &[T], count: usize) -> Vec<T> {
    shuffle(list).into_iter().take(count).collect()
}
