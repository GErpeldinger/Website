// Stryker disable all: Vite reads the glob's pattern at build time, so it cannot be mutated.
import type { Behaviour } from '../brain/behaviour';
import { discover } from './discover';

// Every behaviour of every actor, found by the build: a file in `activities/<actor>/` is
// registered by existing. The glob is eager, so Vite turns it into static imports (no dynamic
// `import()`, which the boundary rules forbid); a folder one level down is for a file's helpers.
// This is the one place in the game allowed to call `import.meta.glob`.
export const registered: readonly Behaviour[] = discover(
    import.meta.glob<unknown>('../activities/*/*.ts', { eager: true }),
);
