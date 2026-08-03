export function filterRankedClients<T extends { name: string }>(
  rows: readonly T[],
  query: string,
): Array<{ rank: number; row: T }> {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return rows.flatMap((row, index) =>
    row.name.toLocaleLowerCase().includes(normalizedQuery)
      ? [{ rank: index + 1, row }]
      : [],
  );
}
