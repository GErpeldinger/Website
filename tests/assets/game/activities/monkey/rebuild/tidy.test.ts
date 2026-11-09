import { describe, expect, it, vi } from 'vitest';
import { tidy } from '../../../../../../assets/game/activities/monkey/rebuild/tidy';
import type {
    Act,
    Context,
} from '../../../../../../assets/game/brain/behaviour';

const actWith = (
    fields: Partial<Context>,
): { act: Act; say: ReturnType<typeof vi.fn> } => {
    const say = vi.fn();
    const context = { actor: 'monkey', now: 0, ...fields } as Context;
    return { act: { say, context: () => context }, say };
};

describe('tidying the broken pieces', () => {
    it('ends at once when it does not know of any', () => {
        const { act } = actWith({});

        expect(
            tidy(act, { pace: 'walk', pause: () => undefined }).next().done,
        ).toBe(true);
    });

    it('takes the nearest to the origin when it does not know where he stands', () => {
        const { act } = actWith({
            loosePieces: [
                { id: 0, x: 300 },
                { id: 1, x: 100 },
            ],
        });

        const first = tidy(act, {
            pace: 'walk',
            pause: () => undefined,
        }).next();

        expect(first.value).toEqual({ type: 'carry', piece: 1, pace: 'walk' });
    });

    it('keeps the first of two pieces at the same distance', () => {
        const { act } = actWith({
            monkeyX: 200,
            loosePieces: [
                { id: 4, x: 100 },
                { id: 5, x: 300 },
            ],
        });

        const first = tidy(act, {
            pace: 'walk',
            pause: () => undefined,
        }).next();

        expect(first.value).toMatchObject({ piece: 4 });
    });

    it('says the pause’s line without resting when it has no duration, and rests without a line', () => {
        const { act, say } = actWith({ loosePieces: [{ id: 0, x: 10 }] });
        const steps = tidy(act, {
            pace: 'run',
            pause: (placed) => (placed === 1 ? { line: 'build' } : { ms: 500 }),
        });
        steps.next();
        steps.next('done');
        const next = steps.next('done');

        expect(say).toHaveBeenCalledWith('build');
        expect(next.value).toEqual({ type: 'carry', piece: 0, pace: 'run' });
    });

    it('rests for the pause’s duration', () => {
        const { act, say } = actWith({ loosePieces: [{ id: 0, x: 10 }] });
        const steps = tidy(act, { pace: 'run', pause: () => ({ ms: 500 }) });
        steps.next();
        steps.next('done');

        expect(steps.next('done').value).toEqual({ type: 'wait', ms: 500 });
        expect(say).not.toHaveBeenCalled();
    });
});
