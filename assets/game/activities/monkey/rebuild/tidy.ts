import { wait, type Act, type Step } from '../../../brain/behaviour';
import type { MonkeyRequest, Pace } from '../../../ports/monkey';
import type { LoosePiece } from '../../../ports/monkey_pieces';
import type { Outcome } from '../../../ports/motor';

// What he does after putting piece number `placed` (from 1) home: say a line, and/or rest.
export interface Pause {
    line?: string;
    ms?: number;
}

export interface Tidying {
    pace: Pace;
    pause: (placed: number) => Pause | undefined;
}

const nearest = (
    pieces: readonly LoosePiece[],
    x: number,
): LoosePiece | undefined =>
    pieces.reduce<LoosePiece | undefined>(
        (best, piece) =>
            best === undefined || Math.abs(piece.x - x) < Math.abs(best.x - x)
                ? piece
                : best,
        undefined,
    );

// Carries the broken pieces home, the nearest first, until none is left. A piece already in his
// hands (a carry cut short) goes first. The pieces are read again before each, so one the visitor
// took or broke meanwhile is seen. A piece he cannot carry, or place, is left where it is and not
// tried again: the loop always ends. No rest or word after the last one: there is nothing to wait
// for.
export function* tidy(
    act: Act,
    { pace, pause }: Tidying,
): Generator<Step<MonkeyRequest>, void, Outcome> {
    const skipped = new Set<number>();
    const remaining = (): readonly LoosePiece[] =>
        (act.context().loosePieces ?? []).filter(({ id }) => !skipped.has(id));
    let placed = 0;
    for (;;) {
        const { carrying, monkeyX = 0 } = act.context();
        let id = carrying;
        if (id === undefined) {
            const piece = nearest(remaining(), monkeyX);
            if (piece === undefined) {
                return;
            }
            id = piece.id;
            if ((yield { type: 'carry', piece: id, pace }) === 'failed') {
                skipped.add(id);
                continue;
            }
        }
        if ((yield { type: 'place', piece: id, pace }) === 'failed') {
            skipped.add(id);
            // Still in his hands: let it fall rather than walk about with it.
            yield { type: 'drop' };
            continue;
        }
        placed++;
        if (remaining().length === 0) {
            return;
        }
        const { line, ms } = pause(placed) ?? {};
        if (line !== undefined) {
            act.say(line);
        }
        if (ms !== undefined) {
            yield wait(ms);
        }
    }
}
