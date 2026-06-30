const DEFAULT_INSERT_CHUNK_SIZE = 100;

export async function runInChunks<T>(
  rows: T[],
  runChunk: (chunk: T[]) => Promise<unknown>,
  chunkSize = DEFAULT_INSERT_CHUNK_SIZE,
): Promise<void> {
  for (let start = 0; start < rows.length; start += chunkSize) {
    await runChunk(rows.slice(start, start + chunkSize));
  }
}
