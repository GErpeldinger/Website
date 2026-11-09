import type { ContextSource } from '../brain/behaviour';

// A broken piece the monkey could carry home: its id, and where it lies, in page pixels.
export interface LoosePiece {
    readonly id: number;
    readonly x: number;
}

declare module '../brain/behaviour' {
    interface ContextFields {
        readonly loosePieces: readonly LoosePiece[];
        // The piece in his hands: a carry cut short leaves it there.
        readonly carrying: number;
    }
}

export interface MonkeyPieces {
    loose: readonly LoosePiece[];
    carrying: number | undefined;
}

// A context source reading the broken pieces when the Brain decides, not when the game starts.
export const monkeyPieces =
    (read: () => MonkeyPieces): ContextSource =>
    () => {
        const { loose, carrying } = read();
        return {
            loosePieces: loose,
            ...(carrying === undefined ? {} : { carrying }),
        };
    };
