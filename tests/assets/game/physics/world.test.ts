import { describe, expect, it, vi } from 'vitest';
import { Clock } from '../../../../assets/game/clock/clock';
import { EventBus } from '../../../../assets/game/events/event_bus';
import type { GameEvents } from '../../../../assets/game/events/game_events';
import { traitsOf } from '../../../../assets/game/physics/kinds';
import {
    PhysicsWorld,
    STEP,
    type PieceSpec,
    type Placement,
} from '../../../../assets/game/physics/world';

const names = [
    'item.freed',
    'item.grabbed',
    'item.dropped',
    'item.thrown',
    'item.hit',
    'item.restored',
    'bomb.placed',
    'bomb.cancelled',
    'bomb.exploded',
    'tornado.started',
    'tornado.ended',
    'gravity.changed',
] as const satisfies readonly (keyof GameEvents)[];

// A 1000 px wide page whose ground strip starts at 700.
const spec = (id: number, x: number, y: number, over = {}): PieceSpec => ({
    id,
    kind: 'block',
    traits: traitsOf('block', {}),
    x,
    y,
    width: 100,
    height: 40,
    ...over,
});

interface Options {
    specs?: PieceSpec[];
    reducedMotion?: boolean;
    random?: () => number;
}

interface Harness {
    world: PhysicsWorld;
    clock: Clock;
    // `steps` frames of 60 Hz, the clock and the physics together.
    advance: (steps: number) => void;
    // Game time only, in whole chunks the clock accepts.
    tickClock: (ms: number) => void;
    events: (name: string) => unknown[];
    log: { name: string; payload: unknown }[];
}

const setup = ({
    specs = [spec(1, 500, 300)],
    reducedMotion = false,
    random = (): number => 0.5,
}: Options = {}): Harness => {
    const bus = new EventBus<GameEvents>();
    const clock = new Clock();
    const log: { name: string; payload: unknown }[] = [];
    for (const name of names) {
        bus.on(name, (payload): void => {
            log.push({ name, payload });
        });
    }
    const world = new PhysicsWorld({ width: 1000, floor: 700 }, specs, {
        events: bus,
        clock,
        random,
        reducedMotion,
    });
    return {
        world,
        clock,
        advance: (steps: number): void => {
            for (let i = 0; i < steps; i++) {
                clock.tick(STEP);
                world.step(STEP);
            }
        },
        tickClock: (ms: number): void => {
            for (let left = ms; left > 0; left -= 250) {
                clock.tick(Math.min(250, left));
            }
        },
        events: (name: string): unknown[] =>
            log.filter((entry) => entry.name === name).map((e) => e.payload),
        log,
    };
};

const place = (world: PhysicsWorld, id: number): Placement => {
    const found = world.placements().find((placement) => placement.id === id);
    if (!found) {
        throw new Error(`Piece ${String(id)} is not loose.`);
    }
    return found;
};

describe('a fresh world', () => {
    it('pins every piece in place and is at rest', () => {
        const { world, advance } = setup();

        advance(30);

        expect(world.placements()).toEqual([]);
        expect(world.resting).toBe(true);
        expect(world.holding).toBe(false);
    });
});

describe('accumulating time', () => {
    it('steps once per 1/60 s, and keeps the remainder', () => {
        const { world } = setup();
        world.grab(1, { x: 500, y: 300 });
        world.release({ x: 0, y: 0 });

        world.step(10);
        expect(place(world, 1).dy).toBe(0);
        world.step(10);
        expect(place(world, 1).dy).toBeGreaterThan(0);
    });

    it('runs at most 3 steps for a long frame, and forgets the rest', () => {
        const long = setup();
        long.world.grab(1, { x: 500, y: 300 });
        long.world.release({ x: 0, y: 0 });
        long.world.step(5000);

        const three = setup();
        three.world.grab(1, { x: 500, y: 300 });
        three.world.release({ x: 0, y: 0 });
        three.world.step(50);

        expect(place(long.world, 1).dy).toBeGreaterThan(0);
        expect(place(long.world, 1).dy).toBeLessThan(2);
        expect(place(long.world, 1).dy).toBeCloseTo(place(three.world, 1).dy);

        // The time beyond is not owed: the next frame runs its own step only.
        long.world.step(STEP);
        three.world.step(STEP);
        expect(place(long.world, 1).dy).toBeCloseTo(place(three.world, 1).dy);
    });
});

describe('the bounds', () => {
    it('stops a falling piece on the floor', () => {
        const { world, advance } = setup();
        world.grab(1, { x: 500, y: 300 });
        world.release({ x: 0, y: 0 });

        advance(200);

        // Its centre rests half its height above the floor line.
        expect(300 + place(world, 1).dy).toBeCloseTo(680, 0);
        expect(world.resting).toBe(true);
    });

    it('keeps a piece thrown sideways inside both walls', () => {
        const left = setup();
        left.world.grab(1, { x: 500, y: 300 });
        left.world.release({ x: -30, y: 0 });
        left.advance(60);
        expect(500 + place(left.world, 1).dx).toBeGreaterThanOrEqual(48);

        const right = setup();
        right.world.grab(1, { x: 500, y: 300 });
        right.world.release({ x: 30, y: 0 });
        right.advance(60);
        expect(500 + place(right.world, 1).dx).toBeLessThanOrEqual(952);
    });

    it('stops a piece thrown up at the top of the page', () => {
        const { world, advance } = setup();
        world.grab(1, { x: 500, y: 300 });
        world.release({ x: 0, y: -32 });

        advance(40);

        expect(300 + place(world, 1).dy).toBeGreaterThanOrEqual(18);
    });
});

describe('impacts', () => {
    const stack = (gap: number): Harness =>
        setup({
            specs: [spec(1, 500, 660 - 40 - gap), spec(2, 500, 660)],
        });

    it('frees a pinned piece a fast one lands on, and reports both hits', () => {
        const { world, advance, events } = stack(60);
        world.grab(1, { x: 500, y: 560 });
        world.release({ x: 0, y: 12 });

        advance(30);

        expect(events('item.freed')).toEqual([
            { id: 1, kind: 'block', by: 'grab' },
            { id: 2, kind: 'block', by: 'impact' },
        ]);
        const hits = events('item.hit') as {
            id: number;
            speed: number;
            against: string;
            kind: string;
        }[];
        const ids = hits.filter((h) => h.against === 'piece').map((h) => h.id);
        expect(ids.sort()).toEqual([1, 2]);
        expect(hits[0]?.kind).toBe('block');
        expect(hits[0]?.speed).toBeGreaterThanOrEqual(7);
        expect(world.placements().map((p) => p.id)).toEqual([1, 2]);
    });

    it('leaves a pinned piece alone when one rests on it gently', () => {
        const { world, advance, events } = stack(2);
        world.grab(1, { x: 500, y: 618 });
        world.release({ x: 0, y: 0 });

        advance(30);

        expect(events('item.freed')).toHaveLength(1);
        expect(events('item.hit')).toEqual([]);
        expect(world.placements().map((p) => p.id)).toEqual([1]);
    });

    it('reports a hard hit on the floor', () => {
        const { world, advance, events } = setup({
            specs: [spec(1, 500, 600)],
        });
        world.grab(1, { x: 500, y: 600 });
        world.release({ x: 0, y: 14 });

        advance(20);

        const hits = events('item.hit') as { id: number; against: string }[];
        expect(hits).toHaveLength(1);
        expect(hits[0]).toMatchObject({ id: 1, against: 'floor' });
    });

    it('reports a hard hit on a wall', () => {
        const { world, advance, events } = setup();
        world.grab(1, { x: 500, y: 300 });
        world.release({ x: -25, y: 0 });

        advance(30);

        const hits = events('item.hit') as { against: string }[];
        expect(hits[0]?.against).toBe('wall');
    });

    it('reports a hard hit on a bomb', () => {
        const { world, advance, events } = setup();
        world.placeBomb({ x: 500, y: 650 });
        world.grab(1, { x: 500, y: 300 });
        world.release({ x: 0, y: 15 });

        advance(30);

        const hits = events('item.hit') as { id: number; against: string }[];
        expect(hits.some((h) => h.id === 1 && h.against === 'bomb')).toBe(true);
    });
});

describe('grab', () => {
    it('refuses an unknown piece and an ungrabbable one', () => {
        const { world, events } = setup({
            specs: [
                spec(1, 500, 300, {
                    traits: traitsOf('block', { grabbable: 'false' }),
                }),
            ],
        });

        expect(world.grab(9, { x: 0, y: 0 })).toBe(false);
        expect(world.grab(1, { x: 500, y: 300 })).toBe(false);
        expect(world.holding).toBe(false);
        expect(events('item.freed')).toEqual([]);
        expect(events('item.grabbed')).toEqual([]);
    });

    it('holds one piece at a time, freeing it and saying so', () => {
        const { world, events } = setup({
            specs: [spec(1, 500, 300), spec(2, 200, 300)],
        });

        expect(world.grab(1, { x: 510, y: 305 })).toBe(true);
        expect(world.grab(2, { x: 200, y: 300 })).toBe(false);

        expect(world.holding).toBe(true);
        expect(events('item.freed')).toEqual([
            { id: 1, kind: 'block', by: 'grab' },
        ]);
        expect(events('item.grabbed')).toEqual([
            { id: 1, kind: 'block', at: { x: 510, y: 305 } },
        ]);
    });

    it('does not free a piece that is already loose', () => {
        const { world, events } = setup();
        world.grab(1, { x: 500, y: 300 });
        world.release({ x: 0, y: 0 });

        world.grab(1, { x: 500, y: 300 });

        expect(events('item.freed')).toHaveLength(1);
        expect(events('item.grabbed')).toHaveLength(2);
    });

    it('drags the piece after the pointer, hanging from the point it was taken by', () => {
        const { world, advance } = setup();
        world.grab(1, { x: 530, y: 300 });

        world.drag({ x: 730, y: 300 });
        advance(400);

        // The piece hangs from the point it was taken by, 30 px right of its centre: it comes
        // to rest with that point at the pointer and its centre 30 px lower.
        const placement = place(world, 1);
        expect(placement.dx).toBeGreaterThan(215);
        expect(placement.dx).toBeLessThan(245);
        expect(placement.dy).toBeGreaterThan(0);
        expect(placement.dy).toBeLessThan(45);
    });

    it.each([
        ['left', { x: -400, y: 300 }],
        ['right', { x: 1400, y: 300 }],
        ['top', { x: 500, y: -400 }],
        ['bottom', { x: 500, y: 1100 }],
    ])(
        'keeps the piece in the page when the pointer leaves it by the %s',
        (_side, to) => {
            const { world, advance } = setup();
            world.grab(1, { x: 500, y: 300 });

            world.drag(to);
            advance(120);

            const { dx, dy } = place(world, 1);
            const at = { x: 500 + dx, y: 300 + dy };
            expect(at.x).toBeGreaterThan(0);
            expect(at.x).toBeLessThan(1000);
            expect(at.y).toBeGreaterThan(0);
            expect(at.y).toBeLessThan(700);
        },
    );

    it('ignores a drag when nothing is held', () => {
        const { world, advance } = setup();

        world.drag({ x: 730, y: 300 });
        advance(5);

        expect(world.placements()).toEqual([]);
    });
});

describe('release', () => {
    it('throws the piece at the pointer velocity, and says how fast', () => {
        const { world, advance, events } = setup();
        world.grab(1, { x: 500, y: 300 });
        world.release({ x: 20, y: -10 });

        advance(1);

        expect(world.holding).toBe(false);
        expect(events('item.thrown')).toEqual([
            { id: 1, kind: 'block', speed: Math.hypot(20, 10) },
        ]);
        expect(events('item.dropped')).toEqual([]);
        expect(place(world, 1).dx).toBeCloseTo(20, 0);
        expect(place(world, 1).dy).toBeLessThan(-8);
    });

    it('puts the piece down when it is let go slowly', () => {
        const { world, events } = setup();
        world.grab(1, { x: 500, y: 300 });

        world.release({ x: 3, y: 0 });

        expect(events('item.dropped')).toEqual([{ id: 1, kind: 'block' }]);
        expect(events('item.thrown')).toEqual([]);
    });

    it('calls a release at 4 px per step a throw', () => {
        const { world, events } = setup();
        world.grab(1, { x: 500, y: 300 });

        world.release({ x: 0, y: 4 });

        expect(events('item.thrown')).toHaveLength(1);
    });

    it('caps the speed at 32', () => {
        const { world, events } = setup();
        world.grab(1, { x: 500, y: 300 });

        world.release({ x: 300, y: 400 });

        const [thrown] = events('item.thrown') as { speed: number }[];
        expect(thrown?.speed).toBeCloseTo(32, 5);
    });

    it('does nothing when nothing is held', () => {
        const { world, log } = setup();

        world.release({ x: 10, y: 10 });

        expect(log).toEqual([]);
    });
});

describe('placements', () => {
    it('gives the offset and turn of every loose piece from its home', () => {
        const { world, advance } = setup({
            specs: [spec(1, 500, 300), spec(2, 200, 300)],
        });
        world.grab(2, { x: 200, y: 300 });
        world.release({ x: 0, y: 0 });
        advance(10);

        const [placement] = world.placements();
        expect(world.placements()).toHaveLength(1);
        expect(placement?.id).toBe(2);
        expect(placement?.dx).toBeCloseTo(0, 3);
        expect(placement?.dy).toBeGreaterThan(5);
        expect(placement?.angle).toBeCloseTo(0, 3);
    });

    it('turns a piece that is struck off centre', () => {
        const { world, advance } = setup();
        world.grab(1, { x: 540, y: 300 });
        world.drag({ x: 540, y: 200 });
        advance(30);

        expect(Math.abs(place(world, 1).angle)).toBeGreaterThan(0.01);
    });
});

describe('restore', () => {
    it('sends a loose piece home and pins it again', () => {
        const { world, advance, events } = setup();
        world.grab(1, { x: 500, y: 300 });
        world.release({ x: 15, y: 0 });
        advance(30);

        world.restore(1);
        advance(30);

        expect(world.placements()).toEqual([]);
        expect(events('item.restored')).toEqual([{ id: 1, kind: 'block' }]);
    });

    it('puts the piece exactly back, without the speed or the spin it had', () => {
        const { world, advance } = setup();
        world.grab(1, { x: 540, y: 300 });
        world.drag({ x: 700, y: 200 });
        advance(30);
        world.release({ x: 12, y: -9 });
        advance(5);

        world.restore(1);
        advance(30);
        world.grab(1, { x: 500, y: 300 });
        world.release({ x: 0, y: 0 });
        advance(1);

        const placement = place(world, 1);
        expect(placement.dx).toBeCloseTo(0, 1);
        expect(placement.dy).toBeCloseTo(0.28, 1);
        expect(placement.angle).toBeCloseTo(0, 3);
    });

    it('is not undone by an impact that was waiting for the next step', () => {
        const { world, advance } = setup({
            specs: [spec(1, 500, 660 - 40 - 60), spec(2, 500, 660)],
        });
        world.grab(1, { x: 500, y: 560 });
        world.release({ x: 0, y: 12 });
        advance(30);
        world.restore(2);
        advance(5);

        expect(world.placements().map((p) => p.id)).toEqual([1]);
    });

    it('can free the restored piece again', () => {
        const { world, events } = setup();
        world.grab(1, { x: 500, y: 300 });
        world.release({ x: 0, y: 0 });
        world.restore(1);

        world.grab(1, { x: 500, y: 300 });

        expect(events('item.freed')).toHaveLength(2);
        expect(world.holding).toBe(true);
    });

    it('lets go of a piece the visitor holds', () => {
        const { world, events } = setup();
        world.grab(1, { x: 500, y: 300 });

        world.restore(1);

        expect(world.holding).toBe(false);
        expect(events('item.dropped')).toEqual([{ id: 1, kind: 'block' }]);
        expect(events('item.restored')).toHaveLength(1);
    });

    it('keeps holding another piece', () => {
        const { world } = setup({
            specs: [spec(1, 500, 300), spec(2, 200, 300)],
        });
        world.grab(2, { x: 200, y: 300 });
        world.release({ x: 0, y: 0 });
        world.grab(1, { x: 500, y: 300 });

        world.restore(2);

        expect(world.holding).toBe(true);
    });

    it('ignores an unknown piece and a piece that never moved', () => {
        const { world, log } = setup();

        world.restore(9);
        world.restore(1);

        expect(log).toEqual([]);
    });
});

describe('zero gravity', () => {
    it('frees every piece and sets it adrift upwards', () => {
        const { world, advance, events } = setup({
            specs: [spec(1, 500, 300), spec(2, 200, 400)],
            random: () => 1,
        });

        world.setZeroGravity(true);
        advance(1);

        expect(events('gravity.changed')).toEqual([{ zero: true }]);
        expect(events('item.freed')).toEqual([
            { id: 1, kind: 'block', by: 'gravity' },
            { id: 2, kind: 'block', by: 'gravity' },
        ]);
        // random() = 1: 1.5 to the right, 3 up.
        expect(place(world, 1).dx).toBeCloseTo(1.5, 0);
        expect(place(world, 1).dy).toBeCloseTo(-3, 0);
    });

    it('drifts the other way for the other end of the random range', () => {
        const { world, advance } = setup({ random: () => 0 });

        world.setZeroGravity(true);
        advance(1);

        expect(place(world, 1).dx).toBeCloseTo(-1.5, 0);
        expect(place(world, 1).dy).toBeCloseTo(-1, 0);
    });

    it('turns the pieces over slowly', () => {
        const { world, advance } = setup({ random: () => 1 });

        world.setZeroGravity(true);
        advance(1);

        // (1 - 0.5) * 0.05 radians per step.
        expect(place(world, 1).angle).toBeCloseTo(0.025, 2);
    });

    it('only draws its random drift when switched on', () => {
        const random = vi.fn(() => 0.5);
        const { world } = setup({ random });

        world.setZeroGravity(true);
        expect(random).toHaveBeenCalledTimes(3);
        world.setZeroGravity(false);

        expect(random).toHaveBeenCalledTimes(3);
    });

    it('keeps floating, and says nothing when it is already so', () => {
        const { world, advance, events } = setup({ random: () => 1 });
        world.setZeroGravity(true);
        world.setZeroGravity(true);
        advance(400);

        expect(events('gravity.changed')).toHaveLength(1);
        // It drifted up towards the ceiling, the top of the page, and not through it.
        expect(300 + place(world, 1).dy).toBeLessThan(100);
        expect(300 + place(world, 1).dy).toBeGreaterThan(15);
    });

    it('brings the weight back when switched off', () => {
        const { world, advance, events } = setup({ random: () => 0.5 });
        world.setZeroGravity(true);
        advance(20);
        world.setZeroGravity(false);
        advance(300);

        expect(events('gravity.changed')).toEqual([
            { zero: true },
            { zero: false },
        ]);
        expect(300 + place(world, 1).dy).toBeCloseTo(680, 0);
        expect(world.resting).toBe(true);
    });

    it('says nothing when switched off while it was off', () => {
        const { world, log } = setup();

        world.setZeroGravity(false);

        expect(log).toEqual([]);
    });
});

describe('bombs', () => {
    it('places a bomb, within the floor', () => {
        const { world, events } = setup();

        expect(world.placeBomb({ x: 400, y: 200 })).toBe(1);
        expect(world.placeBomb({ x: 300, y: 900 })).toBe(2);

        expect(events('bomb.placed')).toEqual([
            { id: 1, at: { x: 400, y: 200 } },
            { id: 2, at: { x: 300, y: 680 } },
        ]);
    });

    it('holds at most 5 bombs at a time', () => {
        const { world, events, tickClock } = setup();
        for (let i = 0; i < 5; i++) {
            expect(world.placeBomb({ x: 100 * (i + 1), y: 100 })).toBe(i + 1);
        }

        expect(world.placeBomb({ x: 700, y: 100 })).toBeUndefined();
        expect(events('bomb.placed')).toHaveLength(5);

        tickClock(1500);
        expect(world.placeBomb({ x: 700, y: 100 })).toBe(6);
    });

    it('blows up after 1.5 s of game time, not before', () => {
        const { world, events, tickClock } = setup({ specs: [] });
        world.placeBomb({ x: 400, y: 200 });

        tickClock(1499);
        expect(events('bomb.exploded')).toEqual([]);
        tickClock(1);

        expect(events('bomb.exploded')).toEqual([
            { id: 1, at: { x: 400, y: 200 }, radius: 300, freed: [] },
        ]);
    });

    it('falls to the floor while the fuse burns', () => {
        const { world, advance, events } = setup();
        world.placeBomb({ x: 400, y: 300 });

        advance(89);
        expect(events('bomb.exploded')).toEqual([]);
        advance(2);

        const [exploded] = events('bomb.exploded') as { at: { y: number } }[];
        expect(exploded?.at.y).toBeGreaterThan(660);
    });

    it('bounces on the floor while the fuse burns', () => {
        const { world, advance, tickClock, events } = setup({ specs: [] });
        world.placeBomb({ x: 400, y: 300 });

        advance(80);
        tickClock(250);

        const [exploded] = events('bomb.exploded') as { at: { y: number } }[];
        // At rest on the floor it would sit at 685.
        expect(exploded?.at.y).toBeLessThan(675);
    });

    it('frees a pinned piece it lands on', () => {
        const { world, advance, events } = setup({
            specs: [spec(1, 500, 650)],
        });
        world.placeBomb({ x: 500, y: 300 });

        advance(70);

        expect(events('item.freed')).toEqual([
            { id: 1, kind: 'block', by: 'impact' },
        ]);
    });

    it('is gone once it blew: nothing rests on it', () => {
        const { world, advance, tickClock } = setup();
        world.placeBomb({ x: 500, y: 650 });
        tickClock(1500);
        world.grab(1, { x: 500, y: 300 });
        world.release({ x: 0, y: 0 });

        advance(250);

        // On the floor, not on the bomb that was there.
        expect(300 + place(world, 1).dy).toBeCloseTo(680, 0);
    });

    it('frees and throws the pieces in reach, away from the blast', () => {
        const { world, events, tickClock, advance } = setup({
            specs: [spec(1, 500, 600), spec(2, 800, 650), spec(3, 801, 650)],
        });
        world.placeBomb({ x: 500, y: 650 });

        tickClock(1500);
        advance(1);

        // Piece 2 is exactly 300 px away: in reach with the weakest push. Piece 3 is out.
        expect(events('bomb.exploded')).toMatchObject([
            { id: 1, radius: 300, freed: [1, 2] },
        ]);
        expect(events('item.freed')).toEqual([
            { id: 1, kind: 'block', by: 'bomb' },
            { id: 2, kind: 'block', by: 'bomb' },
        ]);
        // Piece 1 is straight above the blast: pushed up hard.
        expect(place(world, 1).dy).toBeLessThan(-20);
        expect(Math.abs(place(world, 1).dx)).toBeLessThan(5);
        // Piece 2 is level with it on the right: pushed right.
        expect(place(world, 2).dx).toBeGreaterThan(5);
        expect(world.placements().map((p) => p.id)).toEqual([1, 2]);
    });

    it('pushes harder the nearer the piece is', () => {
        const { world, tickClock, advance } = setup({
            specs: [spec(1, 600, 650), spec(2, 780, 650)],
        });
        world.placeBomb({ x: 500, y: 650 });

        tickClock(1500);
        advance(1);

        expect(place(world, 1).dx).toBeGreaterThan(place(world, 2).dx);
    });

    it('pushes a piece that is already loose, without reporting it as freed', () => {
        const { world, tickClock, advance, events } = setup({
            specs: [spec(1, 600, 650)],
        });
        world.grab(1, { x: 600, y: 650 });
        world.release({ x: 0, y: 0 });
        world.placeBomb({ x: 500, y: 650 });

        tickClock(1500);
        advance(1);

        expect(events('bomb.exploded')).toMatchObject([{ freed: [] }]);
        expect(place(world, 1).dx).toBeGreaterThan(5);
    });

    it('scales the radius with the page width', () => {
        const bus = new EventBus<GameEvents>();
        const clock = new Clock();
        const exploded: unknown[] = [];
        bus.on('bomb.exploded', (payload): void => {
            exploded.push(payload);
        });
        const world = new PhysicsWorld({ width: 400, floor: 700 }, [], {
            events: bus,
            clock,
            random: (): number => 0.5,
            reducedMotion: false,
        });
        world.placeBomb({ x: 200, y: 200 });

        for (let i = 0; i < 6; i++) {
            clock.tick(250);
        }

        expect(exploded).toMatchObject([{ radius: 220 }]);
    });

    it('kicks a bomb beside it away', () => {
        const { world, events, tickClock, advance } = setup({ specs: [] });
        world.placeBomb({ x: 500, y: 300 });
        tickClock(500);
        world.placeBomb({ x: 500, y: 250 });

        tickClock(1000);
        advance(5);
        tickClock(500);

        const exploded = events('bomb.exploded') as {
            id: number;
            at: { x: number; y: number };
        }[];
        expect(exploded.map((e) => e.id)).toEqual([1, 2]);
        // Bomb 2 was straight above bomb 1: pushed up, by half what a piece there would get.
        expect(exploded[1]?.at.y).toBeLessThan(200);
        expect(exploded[1]?.at.y).toBeGreaterThan(130);
    });

    it('does not kick a bomb that sits on the blast, or out of its reach', () => {
        const { world, events, tickClock, advance } = setup({ specs: [] });
        world.placeBomb({ x: 500, y: 300 });
        tickClock(500);
        world.placeBomb({ x: 500, y: 300 });
        world.placeBomb({ x: 900, y: 300 });

        tickClock(1000);
        advance(5);
        tickClock(450);

        const exploded = events('bomb.exploded') as {
            at: { x: number; y: number };
        }[];
        expect(exploded).toHaveLength(3);
        // They only fell, a few pixels in 5 steps: no push up, none to the side.
        expect(exploded[1]?.at.x).toBeCloseTo(500, 0);
        expect(exploded[1]?.at.y).toBeGreaterThan(300);
        expect(exploded[1]?.at.y).toBeLessThan(310);
        expect(exploded[2]?.at.x).toBeCloseTo(900, 0);
        expect(exploded[2]?.at.y).toBeLessThan(310);
    });

    it('does not kick a bomb 1 px from the blast either', () => {
        const { world, events, tickClock, advance } = setup({ specs: [] });
        world.placeBomb({ x: 500, y: 300 });
        tickClock(500);
        world.placeBomb({ x: 501, y: 300 });

        tickClock(1000);
        advance(5);
        tickClock(450);

        const exploded = events('bomb.exploded') as { at: { x: number } }[];
        expect(exploded[1]?.at.x).toBeCloseTo(501, 0);
    });
});

describe('the tornado', () => {
    it('does not start under reduced motion', () => {
        const { world, events } = setup({ reducedMotion: true });

        expect(world.startTornado(500)).toBe(false);

        expect(events('tornado.started')).toEqual([]);
    });

    it('starts once, and is not restarted while it runs', () => {
        const { world, events } = setup();

        expect(world.startTornado(500)).toBe(true);
        expect(world.startTornado(300)).toBe(false);

        expect(events('tornado.started')).toEqual([{ x: 500 }]);
    });

    it('sweeps the pieces in reach up and away from the page', () => {
        const { world, advance, events } = setup({
            specs: [spec(1, 520, 600), spec(2, 900, 600)],
        });

        world.startTornado(500);
        advance(20);

        expect(events('item.freed')).toEqual([
            { id: 1, kind: 'block', by: 'tornado' },
        ]);
        expect(place(world, 1).dy).toBeLessThan(-50);
        expect(world.placements().map((p) => p.id)).toEqual([1]);
    });

    it('follows the pointer, slowly', () => {
        const without = setup({ specs: [spec(1, 900, 600)] });
        without.world.startTornado(500);
        without.advance(100);
        expect(without.world.placements()).toEqual([]);

        const aimed = setup({ specs: [spec(1, 900, 600)] });
        aimed.world.startTornado(500);
        aimed.world.aim(900);
        aimed.advance(100);
        expect(aimed.events('item.freed')).toEqual([
            { id: 1, kind: 'block', by: 'tornado' },
        ]);
    });

    it('takes a bomb in its reach up with it', () => {
        const { world, advance, tickClock, events } = setup({ specs: [] });
        world.placeBomb({ x: 500, y: 650 });
        world.startTornado(500);

        advance(30);
        tickClock(1500);

        const [exploded] = events('bomb.exploded') as { at: { y: number } }[];
        expect(exploded?.at.y).toBeLessThan(500);
    });

    it('leaves a bomb out of its reach alone', () => {
        const { world, advance, tickClock, events } = setup({ specs: [] });
        // 300 px from the axis: just out of reach, where a pull would still lift it.
        world.placeBomb({ x: 800, y: 300 });
        world.startTornado(500);

        advance(30);
        tickClock(1500);

        const [exploded] = events('bomb.exploded') as { at: { y: number } }[];
        expect(exploded?.at.y).toBeGreaterThan(350);
    });

    it('lasts 5.2 s, then lets a new one start', () => {
        const { world, events, tickClock } = setup();
        world.startTornado(500);

        tickClock(5199);
        expect(events('tornado.ended')).toEqual([]);
        tickClock(1);

        expect(events('tornado.ended')).toEqual([undefined]);
        expect(world.startTornado(500)).toBe(true);
    });

    it('ignores a pointer when no tornado runs', () => {
        const { world, log } = setup();

        world.aim(300);

        expect(log).toEqual([]);
    });
});

describe('resting', () => {
    it('is false while a piece is held, even a still one', () => {
        const { world, advance } = setup();
        world.grab(1, { x: 500, y: 300 });
        advance(300);

        expect(world.resting).toBe(false);

        world.release({ x: 0, y: 0 });
        expect(world.resting).toBe(false);
        advance(1);
        expect(world.resting).toBe(false);
        advance(300);
        expect(world.resting).toBe(true);
    });

    it('is false while a bomb waits', () => {
        const { world, advance } = setup();
        world.placeBomb({ x: 500, y: 650 });
        advance(45);

        expect(world.resting).toBe(false);
    });

    it('is false during a tornado', () => {
        const { world, advance } = setup();
        world.startTornado(100);
        advance(45);

        expect(world.resting).toBe(false);
    });

    it('is false while the pieces float, and true once they are up against the ceiling', () => {
        const { world, advance } = setup({ random: () => 1 });
        world.setZeroGravity(true);
        advance(45);

        expect(world.resting).toBe(false);

        // Zero gravity is still on, but nothing moves: the loop can sleep.
        advance(900);
        expect(world.resting).toBe(true);
    });

    it('waits for the pieces to fall when the zero gravity ends', () => {
        const { world, advance } = setup({ random: () => 1 });
        world.setZeroGravity(true);
        // Up against the ceiling, as still as a piece can be.
        advance(900);

        world.setZeroGravity(false);

        expect(world.resting).toBe(false);
        advance(400);
        expect(world.resting).toBe(true);
    });

    it('waits for the pieces to fall when the tornado ends', () => {
        const { world, advance, tickClock } = setup({
            specs: [spec(1, 500, 600)],
        });
        world.startTornado(500);
        // Swept up against the ceiling, and held there.
        advance(300);
        expect(world.resting).toBe(false);

        tickClock(200);

        expect(world.resting).toBe(false);
        advance(400);
        expect(world.resting).toBe(true);
    });

    it('waits for the aftermath of a blast, with nothing there to move', () => {
        const { world, tickClock } = setup({ specs: [] });
        world.placeBomb({ x: 500, y: 650 });

        tickClock(1500);

        expect(world.resting).toBe(false);
    });

    it('waits for a run of calm steps after a blast', () => {
        const { world, advance, tickClock } = setup({
            specs: [spec(1, 500, 600)],
        });
        world.placeBomb({ x: 500, y: 650 });
        tickClock(1500);
        advance(5);

        expect(world.resting).toBe(false);

        advance(400);
        expect(world.resting).toBe(true);
    });
});

describe('dispose', () => {
    it('cancels the fuses, ends the tornado and the zero gravity, lets go', () => {
        const { world, events, tickClock, log } = setup();
        world.placeBomb({ x: 500, y: 650 });
        world.startTornado(500);
        world.setZeroGravity(true);
        world.grab(1, { x: 500, y: 300 });
        log.length = 0;

        world.dispose();
        tickClock(6000);

        expect(log.map((entry) => entry.name)).toEqual([
            'item.dropped',
            'bomb.cancelled',
            'tornado.ended',
            'gravity.changed',
        ]);
        expect(events('gravity.changed')).toEqual([{ zero: false }]);
        expect(events('bomb.exploded')).toEqual([]);
        expect(events('bomb.cancelled')).toEqual([{ id: 1 }]);
    });

    it('says nothing when there is nothing to end', () => {
        const { world, log } = setup();

        world.dispose();

        expect(log).toEqual([]);
    });
});
