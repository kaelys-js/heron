/** Pre-fills the textarea with whatever's already in cv.md (so the user can
 *  edit / re-run rather than starting from scratch when revisiting). */
import { readSiblingFile } from '$lib/server/profile';

export async function load() {
  const existing = readSiblingFile('cv') ?? '';
  return { existing };
}
