export function starsFor(correct: number, total: number): 1 | 2 | 3 {
  if (total <= 0 || correct >= total) return 3;
  if (correct / total >= 0.75) return 2;
  return 1;
}

// 六組配對最少要翻 6 次。多幾次失誤仍然給星星，避免小朋友覺得被處罰。
export function memoryStars(moves: number, pairs: number): 1 | 2 | 3 {
  if (moves <= pairs + 4) return 3;
  if (moves <= pairs + 10) return 2;
  return 1;
}
