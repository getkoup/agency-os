export function getFormString(data: FormData, key: string): string {
  const value = data.get(key);
  if (typeof value !== "string") {
    throw new Error(`Missing form field: ${key}`);
  }
  return value;
}
