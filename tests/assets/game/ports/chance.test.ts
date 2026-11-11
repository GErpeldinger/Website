import { expect, it } from 'vitest';
import { chance } from '../../../../assets/game/ports/chance';

it('draws a new number each time it is read', () => {
    const draws = [0.2, 0.9];
    const source = chance(() => draws.shift() ?? 0);

    expect(source()).toStrictEqual({ roll: 0.2 });
    expect(source()).toStrictEqual({ roll: 0.9 });
});
