import type { ContextSource } from '../brain/behaviour';

declare module '../brain/behaviour' {
    interface ContextFields {
        // A fresh draw in [0, 1) each time the Brain reads the world: a behaviour that happens
        // "with a chance of 0.5" starts when `roll` is below it.
        readonly roll: number;
    }
}

// A context source drawing a number each time it is read.
export const chance =
    (random: () => number): ContextSource =>
    () => ({ roll: random() });
