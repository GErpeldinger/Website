import type { ContextSource } from '../brain/behaviour';
import type { Facing } from './monkey';

// What the game tells the monkey's behaviours of his world: the page's width and where he stands,
// in page pixels, and whether he is on his feet.
declare module '../brain/behaviour' {
    interface ContextFields {
        readonly pageWidth: number;
        readonly monkeyX: number;
        // The y of the top of his head.
        readonly monkeyTop: number;
        // His soles are at the floor, not on a piece above it.
        readonly onFloor: boolean;
        readonly grounded: boolean;
        // In the page and not in the visitor's hand.
        readonly free: boolean;
        readonly facing: Facing;
    }
}

export interface MonkeyWorld {
    pageWidth: number;
    monkeyX: number;
    monkeyTop: number;
    onFloor: boolean;
    grounded: boolean;
    free: boolean;
    facing: Facing;
}

// A context source reading the world when the Brain decides, not when the game starts.
export const monkeyWorld =
    (read: () => MonkeyWorld): ContextSource =>
    () => {
        const {
            pageWidth,
            monkeyX,
            monkeyTop,
            onFloor,
            grounded,
            free,
            facing,
        } = read();
        return {
            pageWidth,
            monkeyX,
            monkeyTop,
            onFloor,
            grounded,
            free,
            facing,
        };
    };
