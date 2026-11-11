import { expect, it } from 'vitest';
import {
    HURRY,
    LAZY,
    hasWork,
    isHurrying,
    isLazy,
    isRebuilding,
    REBUILD,
} from '../../../../../../assets/game/activities/monkey/rebuild/state';

const now = { actor: 'monkey', now: 0 };

it('knows the slow rebuild from the hurried one by the running behaviours', () => {
    expect(LAZY).toBe('monkey/lazy_rebuild');
    expect(HURRY).toBe('monkey/hurry');
    expect(isLazy({ ...now, running: [HURRY, LAZY] })).toBe(true);
    expect(isLazy({ ...now, running: [HURRY] })).toBe(false);
    expect(isHurrying({ ...now, running: [LAZY, HURRY] })).toBe(true);
    expect(isHurrying({ ...now, running: [LAZY] })).toBe(false);
});

it('says neither when it is not told what runs', () => {
    expect(isLazy(now)).toBe(false);
    expect(isHurrying(now)).toBe(false);
});

it('has work when a piece lies about or is in his hands, and not otherwise', () => {
    expect(hasWork(now)).toBe(false);
    expect(hasWork({ ...now, loosePieces: [] })).toBe(false);
    expect(hasWork({ ...now, loosePieces: [{ id: 0, x: 1 }] })).toBe(true);
    expect(hasWork({ ...now, carrying: 0 })).toBe(true);
});

it('is rebuilding while any of the three rebuilds runs', () => {
    expect(REBUILD).toBe('monkey/rebuild');
    expect(isRebuilding({ ...now, running: [REBUILD] })).toBe(true);
    expect(isRebuilding({ ...now, running: ['monkey/flee', LAZY] })).toBe(true);
    expect(isRebuilding({ ...now, running: [HURRY] })).toBe(true);
    expect(isRebuilding({ ...now, running: ['monkey/flee'] })).toBe(false);
    expect(isRebuilding({ ...now, running: [] })).toBe(false);
    expect(isRebuilding(now)).toBe(false);
});
