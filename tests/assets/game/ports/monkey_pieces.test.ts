import { expect, it } from 'vitest';
import { monkeyPieces } from '../../../../assets/game/ports/monkey_pieces';

it('reads the broken pieces and what he holds each time it is asked', () => {
    const world: { loose: { id: number; x: number }[]; carrying?: number } = {
        loose: [{ id: 1, x: 10 }],
    };
    const source = monkeyPieces(() => ({ carrying: undefined, ...world }));

    expect(source()).toStrictEqual({ loosePieces: [{ id: 1, x: 10 }] });

    world.loose.push({ id: 2, x: 20 });
    world.carrying = 0;
    expect(source()).toStrictEqual({
        loosePieces: [
            { id: 1, x: 10 },
            { id: 2, x: 20 },
        ],
        carrying: 0,
    });
});
