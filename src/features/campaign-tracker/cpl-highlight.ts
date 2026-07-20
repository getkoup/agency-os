export function getCplHighlightClass(cpl: string | null): string {
  if (cpl === null) return "";
  const value = Number(cpl);
  if (value > 25) return "bg-red-500/40";
  if (value > 15) return "bg-orange-500/40";
  return "";
}
