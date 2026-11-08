import { describe, expect, it } from 'vitest';
import { choose } from '../../../../assets/game/brain/choose';

const item = (
    name: string,
    priority: number,
    weight?: number,
): { name: string; priority: number; weight?: number } => ({
    name,
    priority,
    weight,
});

const names = (...items: { name: string }[]): string[] =>
    items.map(({ name }) => name);

describe('choose', () => {
    it('picks nothing from nothing', () => {
        expect(choose<{ priority: number }>([], () => 0)).toBeUndefined();
    });

    it('picks the highest priority, whatever the order or the dice', () => {
        const candidates = [item('low', 1), item('high', 9), item('mid', 5)];

        for (const roll of [0, 0.5, 0.99]) {
            expect(choose(candidates, () => roll)?.name).toBe('high');
        }
    });

    it('picks the highest priority when all are negative', () => {
        expect(choose([item('a', -5), item('b', -1)], () => 0)?.name).toBe('b');
    });

    it('weighs equals by their weights', () => {
        const candidates = [
            item('a', 1, 1),
            item('b', 1, 3),
            item('c', 0, 100),
        ];

        // Weights 1 and 3 make the odds 1/4 and 3/4.
        expect(choose(candidates, () => 0)?.name).toBe('a');
        expect(choose(candidates, () => 0.2499)?.name).toBe('a');
        expect(choose(candidates, () => 0.25)?.name).toBe('b');
        expect(choose(candidates, () => 0.9999)?.name).toBe('b');
    });

    it('gives equals without a weight the same odds', () => {
        const candidates = [item('a', 1), item('b', 1)];

        expect(choose(candidates, () => 0.49)?.name).toBe('a');
        expect(choose(candidates, () => 0.5)?.name).toBe('b');
    });

    it('takes the last one if the dice return 1', () => {
        expect(
            choose([item('a', 1), item('b', 1), item('c', 1)], () => 1)?.name,
        ).toBe('c');
    });

    it('keeps the order of the candidates', () => {
        const candidates = [item('a', 1), item('b', 1), item('c', 1)];

        expect(
            names(
                ...[0, 0.4, 0.7].flatMap((roll) => {
                    const picked = choose(candidates, () => roll);
                    return picked ? [picked] : [];
                }),
            ),
        ).toEqual(['a', 'b', 'c']);
    });
});
