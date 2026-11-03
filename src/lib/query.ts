type QueryResult<T> = { data: T | null; error: { message: string } | null };

export function unwrap<T>(result: QueryResult<T>): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}
