import { expect, it } from 'vitest';
import { registered } from '../../../../assets/game/registry/behaviours';

it('lists the behaviours of the activities folder, one id each', () => {
    const ids = registered.map(({ id }) => id);

    expect(Array.isArray(registered)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const behaviour of registered) {
        expect(behaviour.id.startsWith(`${behaviour.actor}/`)).toBe(true);
    }
});
