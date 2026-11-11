import { describe, expect, it } from 'vitest';
import {
    monkeyWorld,
    type MonkeyWorld,
} from '../../../../assets/game/ports/monkey_world';

const world = (): MonkeyWorld => ({
    pageWidth: 900,
    monkeyX: 64,
    monkeyTop: 630,
    onFloor: true,
    grounded: true,
    free: true,
    facing: 'right',
});

describe('the monkey’s world as a context source', () => {
    it('reads the world each time it is asked', () => {
        const state = world();
        const source = monkeyWorld(() => ({ ...state }));

        expect(source()).toEqual(world());

        state.monkeyX = 70;
        state.free = false;
        expect(monkeyWorld(() => state)()).toEqual({
            ...world(),
            monkeyX: 70,
            free: false,
        });
    });

    it('gives only the fields it knows', () => {
        const source = monkeyWorld(
            () => ({ ...world(), other: 3 }) as MonkeyWorld,
        );

        expect(Object.keys(source())).toEqual([
            'pageWidth',
            'monkeyX',
            'monkeyTop',
            'onFloor',
            'grounded',
            'free',
            'facing',
        ]);
    });
});
