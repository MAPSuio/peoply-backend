/* function to calculate edit distance between two strings */
export function calculateEditDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const d = new Array(m + 1);
  for (let i = 0; i <= m; i++) {
    d[i] = new Array(n + 1);
    d[i][0] = i;
  }
  for (let j = 0; j <= n; j++) {
    d[0][j] = j;
  }
  for (let j = 1; j <= n; j++) {
    for (let i = 1; i <= m; i++) {
      if (s1[i - 1] === s2[j - 1]) {
        d[i][j] = d[i - 1][j - 1];
      } else {
        d[i][j] = Math.min(
          d[i - 1][j - 1] + 1,
          d[i][j - 1] + 1,
          d[i - 1][j] + 1,
        );
      }
    }
  }
  return d[m][n];
}
