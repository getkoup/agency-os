import "server-only";

export async function mapInBatches<T, Result>(
  values: readonly T[],
  batchSize: number,
  mapValue: (value: T) => Promise<Result>,
  onBatchComplete?: () => Promise<void>,
): Promise<Result[]> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("Batch size must be a positive integer");
  }

  const results: Result[] = [];
  for (let index = 0; index < values.length; index += batchSize) {
    const batch = values.slice(index, index + batchSize);
    results.push(...(await Promise.all(batch.map(mapValue))));
    await onBatchComplete?.();
  }
  return results;
}
