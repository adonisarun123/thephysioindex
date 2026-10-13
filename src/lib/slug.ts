/** URL slug: lowercase ASCII, hyphen separated, stable for a given input. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** Normalised form for alias matching: lowercase, no punctuation or spaces. */
export function normaliseAlias(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Normalised registration number for duplicate detection (VER-01): uppercase alphanumerics only. */
export function normaliseRegistrationNumber(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]+/g, "");
}
