import type { ContextSource } from '../brain/behaviour';

// What the game tells the monkey's behaviours of his world: the page's width and where he stands,
// both in page pixels.
declare module '../brain/behaviour' {
    interface ContextFields {
        readonly pageWidth: number;
        readonly monkeyX: number;
    }
}

export interface MonkeyWorld {
    pageWidth: number;
    monkeyX: number;
}

// A context source reading the world when the Brain decides, not when the game starts.
export const monkeyWorld =
    (read: () => MonkeyWorld): ContextSource =>
    () => {
        const { pageWidth, monkeyX } = read();
        return { pageWidth, monkeyX };
    };
