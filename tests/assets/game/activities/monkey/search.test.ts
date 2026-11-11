import { describe, expect, it } from 'vitest';
import flee from '../../../../../assets/game/activities/monkey/flee';
import rebuild from '../../../../../assets/game/activities/monkey/rebuild';
import search from '../../../../../assets/game/activities/monkey/search';
import { stage, type LiveContext, type Stage } from './stage';

// A 1000 px page, the monkey on the floor at 300 facing right, his head at 630, and a cigarette
// lying 300 px away on the floor.
const world = (over: LiveContext = {}): LiveContext => ({
    cigarette: { x: 600, y: 690 },
    monkeyX: 300,
    monkeyTop: 630,
    onFloor: true,
    pageWidth: 1000,
    facing: 'right',
    ...over,
});

const fall = ({ events }: Stage, cause: 'hit' | 'sneeze' = 'hit'): void => {
    events.emit('cig.lost', { cause, at: { x: 600, y: 690 } });
};

const searching = (
    context: LiveContext = world(),
    others: Record<string, unknown> = {},
): { s: Stage; context: LiveContext } => {
    const s = stage({ search, ...others }, { context });
    return { s, context };
};

// Gets him through the notice and the look, to the walk the wrong way.
const looked = (s: Stage, ms = 700): void => {
    s.motor.finish();
    s.advance(ms);
    for (let i = 0; i < 3; i++) {
        s.motor.finish();
        s.advance(380);
    }
    s.motor.finish();
    s.advance(360);
};

// Past the wrong-way walk, into the search proper.
const wentAway = (s: Stage, context: LiveContext): void => {
    context.monkeyX = 190;
    s.motor.finish();
};

describe('when it starts', () => {
    it('starts on the cigarette falling, with it on the floor', () => {
        const { s } = searching();

        fall(s);

        expect(s.log).toEqual(['+monkey/search']);
        expect(s.motor.requests).toEqual([{ type: 'stand' }]);
        expect(s.motor.layers).toEqual(['body']);
    });

    it('does not start with nothing on the floor, or for anything else', () => {
        const none = searching(world({ cigarette: undefined }));
        fall(none.s);
        expect(none.s.motor.requests).toEqual([]);

        const other = searching();
        other.s.events.emit('monkey.landed', { speed: 3 });
        expect(other.s.motor.requests).toEqual([]);
        expect(search.canStart({ actor: 'monkey', now: 0 })).toBe(false);
    });

    it('starts on nothing but the cigarette falling', () => {
        const context = world();

        expect(
            search.canStart({
                actor: 'monkey',
                now: 0,
                ...context,
                trigger: { name: 'monkey.landed', payload: { speed: 3 } },
            }),
        ).toBe(false);
        expect(
            search.canStart({
                actor: 'monkey',
                now: 0,
                ...context,
                trigger: {
                    name: 'cig.lost',
                    payload: { cause: 'hit', at: { x: 600, y: 690 } },
                },
            }),
        ).toBe(true);
    });

    it('is stronger than the rebuild and weaker than the flee and the way back', () => {
        expect(search.priority).toBeGreaterThan(rebuild.priority);
        expect(search.priority).toBeLessThan(flee.priority);
        expect(search.priority).toBeLessThan(90);
        expect(search.resumes).toBe(true);
    });
});

describe('noticing and looking', () => {
    it('stands still for 700 ms, then says where is it, forced', () => {
        const { s } = searching();
        fall(s);
        s.motor.finish();

        s.advance(699);
        expect(s.motor.requests).toHaveLength(1);
        expect(s.log).toEqual(['+monkey/search']);

        s.advance(1);
        expect(s.log).toEqual(['+monkey/search', 'search']);
    });

    it('takes 900 ms to notice after a sneeze', () => {
        const { s } = searching();
        fall(s, 'sneeze');
        s.motor.finish();

        s.advance(899);
        expect(s.log).toEqual(['+monkey/search']);
        s.advance(1);
        expect(s.log).toEqual(['+monkey/search', 'search']);
    });

    it('turns the other way every 380 ms for 1.5 s: four turns, the last one short', () => {
        const { s } = searching();
        fall(s);
        s.motor.finish();
        s.advance(700);

        const faces = (): unknown[] =>
            s.motor.requests.filter(({ type }) => type === 'face');
        expect(faces()).toEqual([{ type: 'face', direction: 'left' }]);
        s.motor.finish();
        s.advance(379);
        expect(faces()).toHaveLength(1);
        s.advance(1);
        expect(faces()).toHaveLength(2);
        s.motor.finish();
        s.advance(380);
        s.motor.finish();
        s.advance(380);
        expect(faces()).toEqual([
            { type: 'face', direction: 'left' },
            { type: 'face', direction: 'right' },
            { type: 'face', direction: 'left' },
            { type: 'face', direction: 'right' },
        ]);

        s.motor.finish();
        s.advance(359);
        expect(s.motor.requests.at(-1)).toEqual({
            type: 'face',
            direction: 'right',
        });
        s.advance(1);
        expect(s.motor.requests.at(-1)?.type).toBe('walk');
    });

    it('starts by turning away from the way he faces', () => {
        const { s } = searching(world({ facing: 'left' }));
        fall(s);
        s.motor.finish();
        s.advance(700);

        expect(s.motor.requests.at(-1)).toEqual({
            type: 'face',
            direction: 'right',
        });
    });

    it('turns left first when he does not know the way he faces', () => {
        const without = world();
        delete without.facing;
        const { s } = searching(without);
        fall(s);
        s.motor.finish();
        s.advance(700);

        expect(s.motor.requests.at(-1)).toEqual({
            type: 'face',
            direction: 'left',
        });
    });
});

describe('going the wrong way first', () => {
    it('walks 110 px away from a cigarette on his right', () => {
        const { s } = searching();
        fall(s);
        looked(s);

        expect(s.motor.requests.at(-1)).toEqual({ type: 'walk', x: 190 });
    });

    it('walks 110 px away from a cigarette on his left', () => {
        const { s } = searching(world({ cigarette: { x: 100, y: 690 } }));
        fall(s);
        looked(s);

        expect(s.motor.requests.at(-1)).toEqual({ type: 'walk', x: 410 });
    });

    it('stops 40 px inside the page', () => {
        const left = searching(world({ monkeyX: 60 }));
        fall(left.s);
        looked(left.s);
        expect(left.s.motor.requests.at(-1)).toEqual({ type: 'walk', x: 40 });

        const right = searching(
            world({ monkeyX: 960, cigarette: { x: 100, y: 690 } }),
        );
        fall(right.s);
        looked(right.s);
        expect(right.s.motor.requests.at(-1)).toEqual({ type: 'walk', x: 960 });
    });

    it('goes the wrong way from a cigarette right above him', () => {
        const { s } = searching(world({ cigarette: { x: 300, y: 690 } }));
        fall(s);
        looked(s);

        expect(s.motor.requests.at(-1)).toEqual({ type: 'walk', x: 410 });
    });

    it('says where is it again, not forced, once he has gone', () => {
        const { s, context } = searching();
        fall(s);
        looked(s);
        // The 1.7 s between two of his lines, which the first has long used up.
        s.advance(1700);

        wentAway(s, context);

        expect(s.log.filter((line) => line === 'search')).toHaveLength(2);
    });

    it('holds the second line back when he spoke a moment ago', () => {
        const { s, context } = searching();
        fall(s);
        looked(s);

        wentAway(s, context);

        expect(s.log.filter((line) => line === 'search')).toHaveLength(1);
    });

    it('is over if the cigarette is back in his mouth by then', () => {
        const { s, context } = searching();
        fall(s);
        looked(s);

        delete context.cigarette;

        s.motor.finish();
        expect(s.log.at(-1)).toBe('-monkey/search:done');
    });

    it('is over if the world does not say where the cigarette is', () => {
        const { s, context } = searching();
        fall(s);
        s.motor.finish();
        s.advance(700);
        delete context.monkeyX;
        for (let i = 0; i < 3; i++) {
            s.motor.finish();
            s.advance(380);
        }
        s.motor.finish();
        s.advance(360);

        expect(s.log.at(-1)).toBe('-monkey/search:done');
    });
});

describe('walking to the cigarette', () => {
    const arrive = (context: LiveContext): Stage => {
        const { s } = searching(context);
        fall(s);
        looked(s);
        s.motor.finish();
        return s;
    };

    it('walks to its x', () => {
        const s = arrive(world());

        expect(s.motor.requests.at(-1)).toEqual({ type: 'walk', x: 600 });
    });

    it('reads the cigarette again each time: it rolls', () => {
        const context = world();
        const s = arrive(context);
        context.monkeyX = 600;
        context.cigarette = { x: 700, y: 690 };

        s.motor.finish();

        expect(s.motor.requests.at(-1)).toEqual({ type: 'walk', x: 700 });
    });

    it('goes on walking when the way is blocked, until it gives up', () => {
        const s = arrive(world());

        s.motor.finish('failed');

        expect(s.motor.requests.at(-1)).toEqual({ type: 'walk', x: 600 });
        expect(s.log.at(-1)).not.toContain('-monkey/search');
    });

    it('reaches it within 10 px, standing', () => {
        const context = world();
        const s = arrive(context);
        context.monkeyX = 590;

        s.motor.finish();

        expect(s.motor.requests.at(-1)).toEqual({ type: 'pickup' });
    });

    it('is not there yet 10.1 px away', () => {
        const context = world();
        const s = arrive(context);
        context.monkeyX = 589.9;

        s.motor.finish();

        expect(s.motor.requests.at(-1)).toEqual({ type: 'walk', x: 600 });
    });

    it('reaches it from the other side too', () => {
        const context = world();
        const s = arrive(context);
        context.monkeyX = 610;

        s.motor.finish();

        expect(s.motor.requests.at(-1)).toEqual({ type: 'pickup' });
    });

    it('reaches one against the wall by standing against it', () => {
        const context = world({ cigarette: { x: 5, y: 690 } });
        const { s } = searching(context);
        fall(s);
        looked(s);
        s.motor.finish();
        expect(s.motor.requests.at(-1)).toEqual({ type: 'walk', x: 20 });

        context.monkeyX = 20;
        s.motor.finish();

        expect(s.motor.requests.at(-1)).toEqual({ type: 'pickup' });
    });

    it('reaches one against the right wall too', () => {
        const context = world({ cigarette: { x: 997, y: 690 }, monkeyX: 700 });
        const { s } = searching(context);
        fall(s);
        looked(s);
        s.motor.finish();
        expect(s.motor.requests.at(-1)).toEqual({ type: 'walk', x: 980 });
    });
});

describe('a cigarette over his head', () => {
    // He is under it, or beside it, on the floor; its y is above his head at 630.
    const up = (over: LiveContext): { s: Stage; context: LiveContext } => {
        const context = world({ monkeyX: 600, ...over });
        const { s } = searching(context);
        fall(s);
        looked(s);
        // The wrong way, then the loop.
        s.motor.finish();
        return { s, context };
    };

    it('is walked under, not jumped for, when it is more than 6 px above his head', () => {
        const { s } = up({
            monkeyX: 300,
            cigarette: { x: 500, y: 600 },
        });

        // 200 px away: too far to jump.
        expect(s.motor.requests.at(-1)).toEqual({ type: 'walk', x: 500 });
    });

    it('is jumped for from under 90 px, with the jump the prototype made', () => {
        const { s } = up({ cigarette: { x: 640, y: 530 } });

        // above = 630 - 530 = 100; dx = 40.
        expect(s.motor.requests.at(-1)).toEqual({
            type: 'jump',
            vx: 4,
            vy: -Math.sqrt(0.56 * 130),
        });
    });

    it('says hup as he jumps, once his last line is 1.7 s behind him', () => {
        const context = world({ cigarette: { x: 640, y: 530 } });
        const { s } = searching(context);
        fall(s);
        looked(s);
        s.motor.finish();
        // 340 px away: he walks. A while later he is under it.
        expect(s.motor.requests.at(-1)).toEqual({ type: 'walk', x: 640 });
        s.advance(3000);
        context.monkeyX = 600;

        s.motor.finish();

        expect(s.motor.requests.at(-1)?.type).toBe('jump');
        expect(s.log.at(-1)).toBe('jump');
    });

    it('is jumped for from 89 px but not from 90', () => {
        const near = up({ cigarette: { x: 689, y: 530 } });
        expect(near.s.motor.requests.at(-1)?.type).toBe('jump');

        const far = up({ cigarette: { x: 690, y: 530 } });
        expect(far.s.motor.requests.at(-1)).toEqual({ type: 'walk', x: 690 });
    });

    it('is jumped for to the left too', () => {
        const { s } = up({ cigarette: { x: 560, y: 530 } });

        expect(s.motor.requests.at(-1)).toEqual({
            type: 'jump',
            vx: -4,
            vy: -Math.sqrt(0.56 * 130),
        });
    });

    it('is reached, not jumped for, at 6 px over his head, and jumped for at more', () => {
        const flat = up({ cigarette: { x: 600, y: 624 } });
        expect(flat.s.motor.requests.at(-1)).toEqual({ type: 'pickup' });

        const high = up({ cigarette: { x: 600, y: 623.9 } });
        expect(high.s.motor.requests.at(-1)?.type).toBe('jump');
    });

    it('is not jumped for from a piece above the floor', () => {
        const { s } = up({
            onFloor: false,
            cigarette: { x: 640, y: 530 },
        });

        expect(s.motor.requests.at(-1)).toEqual({ type: 'walk', x: 640 });
    });

    it('is waited under, not walked to, when it is 10 px off and he cannot jump', () => {
        const { s } = up({
            onFloor: false,
            cigarette: { x: 610, y: 530 },
        });

        // Nothing is asked of the body: he is as close as he can get.
        expect(s.motor.pending).toEqual([]);
    });

    it('is waited under, 100 ms at a time, until 700 ms after the last jump', () => {
        const { s } = up({ cigarette: { x: 600, y: 530 } });
        const jumps = (): number =>
            s.motor.requests.filter(({ type }) => type === 'jump').length;
        expect(jumps()).toBe(1);
        const count = s.motor.requests.length;

        // He has landed, right under it.
        s.motor.finish();
        for (let waited = 100; waited < 700; waited += 100) {
            s.advance(100);
            expect(s.motor.requests).toHaveLength(count);
        }
        s.advance(100);

        expect(jumps()).toBe(2);
    });

    it('is jumped for no oftener than every 700 ms, walking in the meantime', () => {
        const { s, context } = up({ cigarette: { x: 640, y: 530 } });
        const count = s.motor.requests.length;

        // He lands 50 px off, too far to be under it: he walks back.
        context.monkeyX = 700;
        s.motor.finish();
        expect(s.motor.requests).toHaveLength(count + 1);
        expect(s.motor.requests.at(-1)).toEqual({ type: 'walk', x: 640 });
    });
});

describe('finding it', () => {
    const found = (): { s: Stage; context: LiveContext } => {
        const context = world({ monkeyX: 600 });
        const { s } = searching(context);
        fall(s);
        looked(s);
        s.motor.finish();
        return { s, context };
    };

    it('picks it up, says so forced, lights it with the lighter for 1.9 s, then lights it', () => {
        const { s, context } = found();
        expect(s.motor.requests.at(-1)).toEqual({ type: 'pickup' });
        // The world takes it off the floor.
        delete context.cigarette;

        // The line a moment after another: only a forced one is said.
        s.motor.finish();
        expect(s.log.at(-1)).toBe('found');
        expect(s.motor.requests.at(-1)).toEqual({
            type: 'pose',
            pose: 'light',
            ms: 1900,
        });
        expect(s.motor.layers.at(-1)).toBe('body');

        s.motor.finish();
        expect(s.motor.requests.at(-1)).toEqual({ type: 'relight' });

        s.motor.finish();
        s.advance(100);
        expect(s.log.at(-1)).toBe('-monkey/search:done');
    });

    it('does nothing more when the cigarette is no longer on the floor to be picked up', () => {
        const { s, context } = found();
        delete context.cigarette;

        s.motor.finish('failed');
        s.advance(100);

        expect(s.log.at(-1)).toBe('-monkey/search:done');
        expect(s.motor.requests.at(-1)).toEqual({ type: 'pickup' });
    });

    it('does not pick it up from text above it: he must be on the floor', () => {
        const context = world({ monkeyX: 600, onFloor: false });
        const { s } = searching(context);
        fall(s);
        looked(s);

        s.motor.finish();

        expect(s.motor.pending).toEqual([]);
        expect(s.motor.requests.map(({ type }) => type)).not.toContain(
            'pickup',
        );
        context.onFloor = true;
        s.advance(100);
        expect(s.motor.requests.at(-1)).toEqual({ type: 'pickup' });
    });
});

describe('giving up', () => {
    // The cigarette is out of reach, high up against the ceiling, and 12 s go by.
    const hopeless = (): { s: Stage; context: LiveContext; since: number } => {
        const context = world({ monkeyX: 600, cigarette: { x: 1000, y: 5 } });
        const { s } = searching(context);
        fall(s);
        looked(s);
        // The time the loop counts from is the end of the look.
        const since = 700 + 3 * 380 + 360;
        return { s, context, since };
    };

    it('does so after 12 s of searching, with a puff and a new cigarette lit', () => {
        const { s, context } = hopeless();
        s.motor.finish();
        context.monkeyX = 980;
        s.advance(11_999);
        s.motor.finish();
        expect(s.motor.requests.at(-1)?.type).not.toBe('discard');

        s.advance(1);
        s.motor.finish();
        expect(s.motor.requests.at(-1)).toEqual({ type: 'discard' });
    });

    it('says it has gone out, not forced, and lights the new one the same way', () => {
        const { s, context } = hopeless();
        s.motor.finish();
        context.monkeyX = 980;
        s.advance(12_000);
        s.motor.finish();
        delete context.cigarette;
        s.motor.finish();

        expect(s.log.at(-1)).toBe('giveUp');
        expect(s.motor.requests.at(-1)).toEqual({
            type: 'pose',
            pose: 'light',
            ms: 1900,
        });
        s.motor.finish();
        expect(s.motor.requests.at(-1)).toEqual({ type: 'relight' });
        delete context.cigarette;
        s.motor.finish();
        s.advance(100);
        expect(s.log.at(-1)).toBe('-monkey/search:done');
    });

    // He is under a cigarette he cannot reach from where he stands, waiting.
    const waiting = (
        over: LiveContext = {},
    ): { s: Stage; context: LiveContext } => {
        const context = world({
            monkeyX: 600,
            onFloor: false,
            cigarette: { x: 600, y: 530 },
            ...over,
        });
        const { s } = searching(context);
        fall(s);
        looked(s);
        s.motor.finish();
        return { s, context };
    };

    it('counts only the time he searched: the time the search waited to go on does not count', () => {
        const { s, context } = waiting();
        context.away = { 'monkey/search': 5000 };

        s.advance(12_000);

        expect(s.motor.requests.at(-1)?.type).not.toBe('discard');
    });

    it('counts the waiting that came after the search began, not before', () => {
        const { s, context } = waiting({ away: { 'monkey/search': 3000 } });

        s.advance(12_000);

        expect(s.motor.requests.at(-1)).toEqual({ type: 'discard' });
        expect(context.away).toBeDefined();
    });

    it('holds the line back when he spoke a moment ago, not being forced', () => {
        const { s, context } = hopeless();
        s.motor.finish();
        context.monkeyX = 980;
        s.advance(11_999);
        // He says something at the last moment: `giveUp` is held back.
        s.events.emit('line.said', { actor: 'monkey', key: 'x', text: 'x' });
        s.motor.finish();
        expect(s.motor.requests.at(-1)?.type).not.toBe('discard');
    });

    it('does nothing more when there is nothing to give up', () => {
        const { s, context } = hopeless();
        s.motor.finish();
        context.monkeyX = 980;
        s.advance(12_000);
        s.motor.finish();

        delete context.cigarette;
        s.motor.finish('failed');
        s.advance(100);

        expect(s.log.at(-1)).toBe('-monkey/search:done');
        expect(s.motor.requests.at(-1)).toEqual({ type: 'discard' });
    });
});

describe('never being left without it', () => {
    const flight = {
        pageWidth: 1000,
        monkeyX: 300,
    };

    it('goes on after a flee, asking again for the walk it was in', () => {
        const { s, context } = searching(world(flight), { flee });
        fall(s);
        looked(s);
        s.motor.finish();
        const walk = s.motor.requests.at(-1);
        expect(walk).toEqual({ type: 'walk', x: 600 });

        s.events.emit('bomb.placed', { id: 1, at: { x: 100, y: 690 } });
        expect(s.log).toContain('-monkey/search:interrupted');
        expect(s.motor.cancelled).toContainEqual(walk);
        s.motor.finish();
        context.monkeyX = 960;

        expect(s.log.at(-1)).toBe('+monkey/search');
        expect(s.motor.pending).toEqual([walk]);
    });

    it('goes on after a flee through the notice too', () => {
        const { s } = searching(world(flight), { flee });
        fall(s);
        s.motor.finish();

        s.events.emit('bomb.placed', { id: 1, at: { x: 100, y: 690 } });
        s.motor.finish();

        expect(s.log.at(-1)).toBe('+monkey/search');
        s.advance(700);
        expect(s.log).toContain('search');
    });

    it('goes on lighting after a flee cut it short, and lights', () => {
        const context = world({ ...flight, monkeyX: 600 });
        const { s } = searching(context, { flee });
        fall(s);
        looked(s);
        s.motor.finish();
        s.motor.finish();
        expect(s.motor.requests.at(-1)).toEqual({
            type: 'pose',
            pose: 'light',
            ms: 1900,
        });

        s.events.emit('bomb.placed', { id: 1, at: { x: 100, y: 690 } });
        s.motor.finish();

        // The pose is asked again, and he lights it after.
        expect(s.motor.pending).toEqual([
            { type: 'pose', pose: 'light', ms: 1900 },
        ]);
        s.motor.finish();
        expect(s.motor.requests.at(-1)).toEqual({ type: 'relight' });
    });

    it('looks for it again when it was lost again while the search waited to light up', () => {
        const context = world({ ...flight, monkeyX: 600 });
        const { s } = searching(context, { flee });
        fall(s);
        looked(s);
        s.motor.finish();
        delete context.cigarette;
        s.motor.finish();
        expect(s.motor.requests.at(-1)?.type).toBe('pose');

        // A flee takes over; the page is measured again, and a hit loses the new cigarette.
        s.events.emit('bomb.placed', { id: 1, at: { x: 100, y: 690 } });
        context.cigarette = { x: 600, y: 690 };
        s.events.emit('cig.lost', { cause: 'hit', at: { x: 600, y: 690 } });
        s.motor.finish();
        expect(s.motor.pending).toEqual([
            { type: 'pose', pose: 'light', ms: 1900 },
        ]);
        s.motor.finish();
        expect(s.motor.requests.at(-1)).toEqual({ type: 'relight' });
        s.motor.finish('failed');

        expect(s.log.at(-1)).not.toBe('-monkey/search:done');
        s.advance(100);
        expect(s.motor.requests.at(-1)).toEqual({ type: 'pickup' });
    });

    it('stops searching when the page was measured again and gave him his cigarette', () => {
        const context = world();
        const { s } = searching(context);
        fall(s);
        looked(s);
        s.motor.finish();
        expect(s.motor.requests.at(-1)).toEqual({ type: 'walk', x: 600 });

        delete context.cigarette;
        s.motor.finish();

        expect(s.log.at(-1)).toBe('-monkey/search:done');
    });
});
