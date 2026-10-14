import { customAlphabet } from "nanoid";

/** Stable public identifiers for URLs and QR codes (DIR-06). Lowercase, no ambiguous glyphs. */
const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
const gen = customAlphabet(alphabet, 8);

export function newPublicId(): string {
  return gen();
}

export const PUBLIC_ID_PATTERN = /^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/;
