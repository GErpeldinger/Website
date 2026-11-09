import { describe, expect, it } from 'vitest';
import { monkeyWorld } from '../../../../assets/game/ports/monkey_world';

describe('the monkey’s world as a context source', () => {
    it('reads the world each time it is asked', () => {
        const world = { pageWidth: 900, monkeyX: 64 };
        const source = monkeyWorld(() => ({ ...world }));

        expect(source()).toEqual({ pageWidth: 900, monkeyX: 64 });

        world.monkeyX = 70;
        expect(monkeyWorld(() => world)()).toEqual({
            pageWidth: 900,
            monkeyX: 70,
        });
    });

    it('gives only those two fields', () => {
        const source = monkeyWorld(
            () =>
                ({ pageWidth: 1, monkeyX: 2, other: 3 }) as {
                    pageWidth: number;
                    monkeyX: number;
                },
        );

        expect(Object.keys(source())).toEqual(['pageWidth', 'monkeyX']);
    });
});
