export function slugifyName(value: string, fallback = "item"): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}

export function slugWithSuffix(baseSlug: string, index: number): string {
  return index <= 1 ? baseSlug : `${baseSlug}-${index}`;
}
