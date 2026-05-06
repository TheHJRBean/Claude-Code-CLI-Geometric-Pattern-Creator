import { createConfigLibrary } from './configLibrary'

/**
 * Main-mode library of user-saved pattern configs. Persists to localStorage
 * under `main-configs-v1`, separate from Lab's `lab-tessellations-v1` so
 * the two libraries don't pollute each other.
 *
 * Implementation lives in `configLibrary.ts`; this module just binds the key.
 */

export const mainConfigLibrary = createConfigLibrary('main-configs-v1')
