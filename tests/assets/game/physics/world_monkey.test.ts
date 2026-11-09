import { Body } from 'matter-js';
import { describe, expect, it } from 'vitest';
import { Clock } from '../../../../assets/game/clock/clock';
import { EventBus } from '../../../../assets/game/events/event_bus';
import type { GameEvents } from '../../../../assets/game/events/game_events';
import { traitsOf } from '../../../../assets/game/physics/kinds';
import type { MonkeyBody } from '../../../../assets/game/physics/monkey_body';
import {
    MONKEY,
    PhysicsWorld,
    STEP,
    type PieceSpec,
} from '../../../../assets/game/physics/world';

// The world's monkey: his body among the pieces, the hand, the bombs. A 1000 px wide page whose
// ground starts at 700, so he stands with his centre at 665.
const names = [
    'item.freed',
    'item.grabbed',
    'item.dropped',
    'item.thrown',
    'item.hit',
    'item.restored',
    'monkey.grabbed',
    'monkey.dropped',
    'monkey.thrown',
    'monkey.landed',
    'monkey.hit',
    'monkey.blasted',
    'monkey.left',
    'bomb.exploded',
] as const satisfies readonly (keyof GameEvents)[];

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
    // Where he stands.
    monkeyAt?: number;
}

interface Bare {
    world: PhysicsWorld;
    advance: (steps: number) => void;
    events: (name: string) => unknown[];
    log: { name: string; payload: unknown }[];
    clock: Clock;
}

interface Harness extends Bare {
    monkey: MonkeyBody;
}

// A world with no monkey in it yet.
const bare = (specs: PieceSpec[] = []): Bare => {
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
        random: (): number => 0.5,
        reducedMotion: false,
    });
    const advance = (steps: number): void => {
        for (let i = 0; i < steps; i++) {
            clock.tick(STEP);
            world.step(STEP);
        }
    };
    const events = (name: string): unknown[] =>
        log.filter((entry) => entry.name === name).map((e) => e.payload);
    return { world, advance, events, log, clock };
};

const setup = ({ specs = [], monkeyAt = 300 }: Options = {}): Harness => {
    const harness = bare(specs);
    const monkey = harness.world.addMonkey(monkeyAt);
    return { ...harness, monkey };
};

describe('adding the monkey', () => {
    it('stands him on the floor where he is told to, and keeps him there', () => {
        const { world, monkey, advance } = setup();

        advance(60);

        expect(world.monkey).toBe(monkey);
        expect(monkey.position.x).toBeCloseTo(300, 1);
        expect(monkey.position.y).toBeCloseTo(665, 0);
        expect(monkey.grounded).toBe(true);
    });

    it('has none until he is added', () => {
        const { world } = bare();

        expect(world.monkey).toBeUndefined();
    });

    it('puts him within the walls, as far as his body fits', () => {
        expect(setup({ monkeyAt: 5 }).monkey.position.x).toBe(20);
        expect(setup({ monkeyAt: 20 }).monkey.position.x).toBe(20);
        expect(setup({ monkeyAt: 995 }).monkey.position.x).toBe(980);
        expect(setup({ monkeyAt: 980 }).monkey.position.x).toBe(980);
        expect(setup({ monkeyAt: 500 }).monkey.position.x).toBe(500);
    });

    it('leaves the page at rest once he has settled', () => {
        const { world, advance } = setup();

        expect(world.resting).toBe(true);
        advance(60);
        expect(world.resting).toBe(true);
    });

    it('keeps the loop going while he moves', () => {
        const { world, monkey, advance } = setup();
        monkey.goTo(600, 3);

        advance(20);

        expect(world.resting).toBe(false);
    });

    it('knows the walls around him', () => {
        const { world } = setup();

        expect(world.bounds).toEqual({ width: 1000, floor: 700 });
    });
});

describe('the hand taking him', () => {
    it('takes him by a point, and says so', () => {
        const { world, events } = setup();

        expect(world.grab(MONKEY, { x: 300, y: 650 })).toBe(true);

        expect(events('monkey.grabbed')).toEqual([{ at: { x: 300, y: 650 } }]);
        expect(world.holding).toBe(true);
        expect(world.monkeyHeld).toBe(true);
        expect(world.resting).toBe(false);
    });

    it('does not take him twice, nor while a piece is held, nor when he is not there', () => {
        const { world, events } = setup({ specs: [spec(1, 600, 300)] });
        expect(world.grab(MONKEY, { x: 300, y: 650 })).toBe(true);

        expect(world.grab(MONKEY, { x: 300, y: 650 })).toBe(false);
        expect(world.grab(1, { x: 600, y: 300 })).toBe(false);
        expect(events('monkey.grabbed')).toHaveLength(1);

        const piece = setup({ specs: [spec(1, 600, 300)] });
        piece.world.grab(1, { x: 600, y: 300 });
        expect(piece.world.grab(MONKEY, { x: 300, y: 650 })).toBe(false);
        expect(piece.world.monkeyHeld).toBe(false);

        const none = bare();
        expect(none.world.grab(MONKEY, { x: 300, y: 650 })).toBe(false);
        expect(none.world.holding).toBe(false);
    });

    it('is not what a piece being held means', () => {
        const { world } = setup({ specs: [spec(1, 600, 300)] });
        world.grab(1, { x: 600, y: 300 });

        expect(world.holding).toBe(true);
        expect(world.monkeyHeld).toBe(false);
    });

    it('carries him to the pointer, on a spring', () => {
        const { world, monkey, advance } = setup();
        world.grab(MONKEY, { x: 300, y: 665 });

        world.drag({ x: 300, y: 400 });
        advance(90);

        expect(monkey.position.y).toBeLessThan(500);
        expect(monkey.position.x).toBeCloseTo(300, -1);
    });

    it('lets go of a piece he is not holding', () => {
        const { world, events } = setup();

        world.release({ x: 10, y: 0 });

        expect(events('monkey.thrown')).toEqual([]);
        expect(events('monkey.dropped')).toEqual([]);
    });

    it('puts him down when let go slowly, and says he was dropped', () => {
        const { world, monkey, events, advance } = setup();
        world.grab(MONKEY, { x: 300, y: 665 });
        // He is still in the hand: the world is calm, but for the hand.
        advance(40);

        world.release({ x: 3.99, y: 0 });

        expect(events('monkey.dropped')).toEqual([undefined]);
        expect(events('monkey.thrown')).toEqual([]);
        expect(monkey.body.velocity.x).toBeCloseTo(3.99, 2);
        expect(world.holding).toBe(false);
        expect(world.monkeyHeld).toBe(false);
        expect(world.resting).toBe(false);
    });

    it('throws him at the pointer’s speed from 4 px per step', () => {
        const { world, monkey, events } = setup();
        world.grab(MONKEY, { x: 300, y: 665 });

        world.release({ x: 4, y: 0 });

        expect(events('monkey.thrown')).toEqual([{ speed: 4 }]);
        expect(events('monkey.dropped')).toEqual([]);
        expect(monkey.body.velocity.x).toBeCloseTo(4, 2);
    });

    it('caps the throw at 26 px per step, a piece at 32', () => {
        const { world, monkey, events } = setup();
        world.grab(MONKEY, { x: 300, y: 665 });

        world.release({ x: 30, y: 40 });

        const [thrown] = events('monkey.thrown') as { speed: number }[];
        expect(thrown?.speed).toBeCloseTo(26, 5);
        expect(monkey.body.speed).toBeCloseTo(26, 3);
        expect(monkey.body.velocity.x).toBeCloseTo(15.6, 2);
    });

    it('is let go of when the world is disposed', () => {
        const { world, events } = setup();
        world.grab(MONKEY, { x: 300, y: 665 });

        world.dispose();

        expect(events('monkey.dropped')).toEqual([undefined]);
        expect(world.monkeyHeld).toBe(false);
    });

    it('leaves him alone in the hand: he is not stood up or walked', () => {
        const { world, monkey, advance } = setup();
        monkey.goTo(900, 3);
        world.grab(MONKEY, { x: 300, y: 665 });
        world.drag({ x: 300, y: 400 });

        advance(30);

        expect(monkey.body.velocity.x).not.toBe(3);
        expect(world.monkeyHeld).toBe(true);
    });
});

describe('falling and being hit', () => {
    const drop = (from: number): Harness => {
        const world = setup();
        Body.setPosition(world.monkey.body, { x: 300, y: from });
        world.advance(160);
        return world;
    };

    it('lands softly from a short fall: a landing, no hit', () => {
        const { events } = drop(600);

        const landed = events('monkey.landed') as { speed: number }[];
        expect(landed).toHaveLength(1);
        expect(landed[0]?.speed).toBeGreaterThan(2);
        expect(landed[0]?.speed).toBeLessThan(10);
        expect(events('monkey.hit')).toEqual([]);
    });

    it('is hit by the floor after a hard fall', () => {
        const { events } = drop(100);

        const hits = events('monkey.hit') as {
            speed: number;
            against: string;
        }[];
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0]?.against).toBe('floor');
        expect(hits[0]?.speed).toBeGreaterThanOrEqual(10);
        expect(events('monkey.landed')).toHaveLength(1);
    });

    it('stands on the floor, but the side walls let him through', () => {
        const { monkey, advance } = setup({ monkeyAt: 600 });
        Body.setPosition(monkey.body, { x: 995, y: 665 });
        Body.setVelocity(monkey.body, { x: 6, y: 0 });

        advance(30);

        expect(monkey.position.x).toBeGreaterThan(1010);
        expect(monkey.position.y).toBeCloseTo(665, 0);
    });

    it('goes through the ceiling when thrown up, with no hit on the way', () => {
        const { world, monkey, advance, events } = setup();
        world.grab(MONKEY, { x: 300, y: 665 });
        world.release({ x: 0, y: -26 });

        advance(60);

        // The ceiling would have stopped his centre 35 px below the top.
        expect(monkey.position.y).toBeLessThan(0);
        expect(events('monkey.hit')).toEqual([]);
    });

    it('is hit by a piece thrown at him at 7 px per step or more, and by the floor only from 10', () => {
        const piece = setup({ specs: [spec(1, 400, 665)] });
        piece.world.grab(1, { x: 400, y: 665 });
        piece.world.release({ x: -8, y: 0 });
        piece.advance(30);
        const hits = piece.events('monkey.hit') as {
            speed: number;
            against: string;
        }[];
        expect(hits[0]?.against).toBe('piece');
        expect(hits[0]?.speed).toBeGreaterThanOrEqual(7);
        expect(hits[0]?.speed).toBeLessThan(10);

        // 145 px above his feet, he lands at about 9 px per step.
        const floor = drop(520);
        expect(floor.events('monkey.landed')).toHaveLength(1);
        expect(floor.events('monkey.hit')).toEqual([]);
    });

    it('is hit by a piece thrown at him, which is hit by him', () => {
        const { world, events, advance } = setup({
            specs: [spec(1, 700, 665)],
        });
        world.grab(1, { x: 700, y: 665 });
        world.release({ x: -30, y: 0 });

        advance(30);

        const hits = events('monkey.hit') as {
            speed: number;
            against: string;
        }[];
        expect(hits[0]?.against).toBe('piece');
        expect(hits[0]?.speed).toBeGreaterThan(20);
        const items = events('item.hit') as { id: number; against: string }[];
        expect(items).toContainEqual(
            expect.objectContaining({ id: 1, against: 'monkey' }),
        );
    });

    it('is not hit by a piece rolling gently against him', () => {
        const { world, events, advance } = setup({
            specs: [spec(1, 700, 665)],
        });
        world.grab(1, { x: 700, y: 665 });
        world.release({ x: -5, y: 0 });

        advance(40);

        expect(events('monkey.hit')).toEqual([]);
    });

    it('is not hit by what he walks into at his own pace', () => {
        const { monkey, events, advance } = setup({
            specs: [spec(1, 500, 600, { width: 40, height: 200 })],
        });
        monkey.goTo(900, 3);

        advance(120);

        expect(events('monkey.hit')).toEqual([]);
    });
});

describe('standing on the page', () => {
    it('does not free a pinned piece he steps onto or settles on', () => {
        const { monkey, events, advance } = setup({
            // Its top is at 480; he lands on it from 30 px above.
            specs: [spec(1, 300, 500)],
        });
        Body.setPosition(monkey.body, { x: 300, y: 480 - 35 - 30 });

        advance(120);

        expect(events('item.freed')).toEqual([]);
        expect(monkey.position.y).toBeCloseTo(480 - 35, 0);
        expect(monkey.grounded).toBe(true);
    });

    it('frees a pinned piece struck by a piece at more than 2.2 px per step', () => {
        const { world, events, advance } = setup({
            specs: [spec(1, 600, 300), spec(2, 480, 300)],
        });
        world.grab(2, { x: 480, y: 300 });
        world.release({ x: 5, y: 0 });

        advance(30);

        expect(events('item.freed')).toContainEqual({
            id: 1,
            kind: 'block',
            by: 'impact',
        });
    });

    it('frees it after a hard fall onto it', () => {
        const { monkey, events, advance } = setup({
            specs: [spec(1, 300, 500)],
        });
        Body.setPosition(monkey.body, { x: 300, y: 480 - 35 - 200 });

        advance(60);

        expect(events('item.freed')).toEqual([
            { id: 1, kind: 'block', by: 'impact' },
        ]);
    });

    it('is stopped by a pinned piece in his way, hops it three times, and gives up', () => {
        const { world, monkey, events, advance } = setup({
            // A wall from the floor to far above his highest hop.
            specs: [spec(1, 500, 300, { width: 40, height: 800 })],
        });
        monkey.goTo(800, 3);

        for (let step = 0; step < 900 && !monkey.blocked; step++) {
            advance(1);
        }

        expect(monkey.blocked).toBe(true);
        expect(monkey.position.x).toBeLessThan(500);
        expect(events('item.freed')).toEqual([]);
        expect(world.piece(1)?.pinned).toBe(true);
    });

    it('hops a low obstacle and goes on', () => {
        const { monkey, advance } = setup({
            specs: [spec(1, 500, 680, { width: 40, height: 40 })],
        });
        monkey.goTo(700, 3);

        advance(400);

        expect(monkey.position.x).toBeGreaterThan(680);
        expect(monkey.destination).toBeUndefined();
    });
});

describe('a bomb going off near him', () => {
    const blast = (bombX: number): Harness => {
        const world = setup();
        world.world.placeBomb({ x: bombX, y: 680 });
        // The fuse is 1.5 s of game time.
        world.advance(91);
        return world;
    };

    it('throws him away from it, harder the nearer it is', () => {
        const { monkey, events } = blast(400);

        expect(events('bomb.exploded')).toHaveLength(1);
        expect(monkey.body.velocity.x).toBeLessThan(-18);
        expect(monkey.body.velocity.y).toBeLessThan(0);
    });

    it('says the blast caught him, after the explosion, with the bomb’s id', () => {
        const world = setup();
        const id = world.world.placeBomb({ x: 400, y: 680 });

        world.advance(91);

        expect(world.events('monkey.blasted')).toEqual([{ bomb: id }]);
        expect(
            world.log
                .map(({ name }) => name)
                .filter(
                    (name) =>
                        name.startsWith('monkey.b') || name === 'bomb.exploded',
                ),
        ).toEqual(['bomb.exploded', 'monkey.blasted']);
    });

    it('says it at the edge of his reach, a bit past a piece’s', () => {
        expect(blast(630).events('monkey.blasted')).toHaveLength(1);
    });

    it('throws him by at least a weak blast’s share: never gently, within reach', () => {
        const { monkey } = blast(630);

        expect(monkey.body.velocity.x).toBeLessThan(-15);
        expect(monkey.body.velocity.x).toBeGreaterThan(-19);
    });

    it('leaves him alone beyond a bit more than the blast’s radius', () => {
        const { monkey, events } = blast(646);

        expect(events('bomb.exploded')).toHaveLength(1);
        expect(Math.abs(monkey.body.velocity.x)).toBeLessThan(0.5);
    });

    it('does not say it when the blast is out of his reach', () => {
        expect(blast(646).events('monkey.blasted')).toEqual([]);
    });
});

describe('a piece he takes', () => {
    it('says where each piece is, copies that cannot move it', () => {
        const { world } = setup({ specs: [spec(1, 600, 300)] });

        const info = world.piece(1);

        expect(info).toEqual({
            position: { x: 600, y: 300 },
            home: { x: 600, y: 300 },
            width: 100,
            pinned: true,
            taken: false,
            held: false,
        });
        if (info) {
            info.position.x = 0;
            info.home.x = 0;
        }
        expect(world.piece(1)?.position.x).toBe(600);
        expect(world.piece(1)?.home.x).toBe(600);
        expect(world.piece(7)).toBeUndefined();
    });

    it('says when the visitor holds it, or the monkey has it', () => {
        const { world } = setup({ specs: [spec(1, 600, 300)] });
        world.grab(1, { x: 600, y: 300 });

        expect(world.piece(1)).toMatchObject({ pinned: false, held: true });
        expect(world.take(1)).toBe(false);

        world.release({ x: 0, y: 0 });
        expect(world.take(1)).toBe(true);
        expect(world.piece(1)).toMatchObject({ taken: true, held: false });
    });

    it('lists the loose pieces he could carry, not those pinned, held or in his hands', () => {
        const { world } = setup({
            specs: [spec(1, 600, 300), spec(2, 200, 300), spec(3, 800, 300)],
        });
        expect(world.loose()).toEqual([]);

        world.grab(1, { x: 600, y: 300 });
        expect(world.loose()).toEqual([]);
        world.release({ x: 0, y: 0 });
        world.grab(2, { x: 200, y: 300 });
        world.release({ x: 0, y: 0 });
        world.grab(3, { x: 800, y: 300 });
        expect(world.loose().map(({ id }) => id)).toEqual([1, 2]);
        expect(world.loose()[1]?.x).toBeCloseTo(200, 0);

        world.take(2);
        expect(world.loose().map(({ id }) => id)).toEqual([1]);
        world.restore(1);
        expect(world.loose()).toEqual([]);
    });

    it('has every piece home only when none is loose, held or in his hands', () => {
        const { world } = setup({ specs: [spec(1, 600, 300)] });
        expect(world.allHome()).toBe(true);

        world.grab(1, { x: 600, y: 300 });
        expect(world.allHome()).toBe(false);
        world.release({ x: 0, y: 0 });
        world.take(1);
        expect(world.allHome()).toBe(false);
        world.restore(1);
        expect(world.allHome()).toBe(true);
    });

    it('can only be a loose piece, taken once', () => {
        const { world } = setup({ specs: [spec(1, 600, 300)] });

        expect(world.take(1)).toBe(false);
        expect(world.take(7)).toBe(false);
        world.grab(1, { x: 600, y: 300 });
        world.release({ x: 0, y: 0 });
        expect(world.take(1)).toBe(true);
        expect(world.take(1)).toBe(false);
    });

    it('cannot be taken by the hand any more, and is listed with the loose', () => {
        const { world } = setup({ specs: [spec(1, 600, 300)] });
        world.grab(1, { x: 600, y: 300 });
        world.release({ x: 0, y: 0 });
        world.take(1);

        expect(world.grab(1, { x: 600, y: 300 })).toBe(false);
        expect(world.placements().map(({ id }) => id)).toEqual([1]);
    });

    it('stays where it is put, and collides with nothing', () => {
        const { world, monkey, advance } = setup({
            specs: [spec(1, 600, 300)],
        });
        world.grab(1, { x: 600, y: 300 });
        world.release({ x: 0, y: 0 });
        world.take(1);

        world.carry(1, { x: 300, y: 650 });
        advance(60);

        expect(world.piece(1)?.position.x).toBeCloseTo(300);
        expect(world.piece(1)?.position.y).toBeCloseTo(650);
        expect(monkey.position.y).toBeCloseTo(665, 0);
        expect(monkey.position.x).toBeCloseTo(300, 0);
    });

    it('is moved only if it is taken', () => {
        const { world } = setup({ specs: [spec(1, 600, 300)] });

        world.carry(1, { x: 10, y: 10 });
        world.carry(7, { x: 10, y: 10 });

        expect(world.piece(1)?.position).toEqual({ x: 600, y: 300 });
    });

    it('falls again once let go, and is collided with again', () => {
        const { world, advance } = setup({ specs: [spec(1, 600, 300)] });
        world.grab(1, { x: 600, y: 300 });
        world.release({ x: 0, y: 0 });
        world.take(1);
        world.carry(1, { x: 600, y: 300 });
        advance(60);
        expect(world.piece(1)?.position.y).toBeCloseTo(300);

        world.letGo(1);
        expect(world.resting).toBe(false);
        advance(120);

        expect(world.piece(1)?.taken).toBe(false);
        expect(world.piece(1)?.position.y).toBeGreaterThan(600);
        expect(world.piece(1)?.position.y).toBeLessThan(685);
    });

    it('lets go of nothing that is not his', () => {
        const { world } = setup({ specs: [spec(1, 600, 300)] });

        world.letGo(1);
        world.letGo(7);

        expect(world.piece(1)?.pinned).toBe(true);
    });

    it('goes home and is pinned there when restored', () => {
        const { world, events } = setup({ specs: [spec(1, 600, 300)] });
        world.grab(1, { x: 600, y: 300 });
        world.release({ x: 0, y: 0 });
        world.take(1);
        world.carry(1, { x: 100, y: 100 });

        world.restore(1);

        expect(world.piece(1)).toMatchObject({
            pinned: true,
            taken: false,
            position: { x: 600, y: 300 },
        });
        expect(events('item.restored')).toEqual([{ id: 1, kind: 'block' }]);
        expect(world.grab(1, { x: 600, y: 300 })).toBe(true);
    });
});

describe('in the air', () => {
    it('is no landing at the top of a throw straight up: only back down', () => {
        const { monkey, advance, events } = setup();
        Body.setVelocity(monkey.body, { x: 0, y: -12 });

        for (let step = 0; step < 200; step++) {
            advance(1);
            if (monkey.position.y < 640) {
                expect(events('monkey.landed'), String(step)).toEqual([]);
                expect(monkey.grounded, String(step)).toBe(false);
            }
        }

        expect(events('monkey.landed')).toHaveLength(1);
        expect(monkey.grounded).toBe(true);
    });

    it('is not held up by what rests nearby, nor by what he bumps his head on', () => {
        const rest = setup({ specs: [spec(1, 500, 680)] });
        rest.world.grab(1, { x: 500, y: 680 });
        rest.world.release({ x: 0, y: 0 });
        rest.advance(60);
        Body.setVelocity(rest.monkey.body, { x: 0, y: -12 });
        for (let step = 0; step < 70; step++) {
            rest.advance(1);
            // Up to the top of the throw and past it, with the piece resting on the floor.
            if (rest.monkey.position.y < 630) {
                expect(rest.monkey.grounded, String(step)).toBe(false);
            }
        }

        const first = setup();
        Body.setPosition(first.monkey.body, { x: 300, y: 300 });
        first.advance(1);
        expect(first.monkey.grounded).toBe(false);

        // A piece 50 px above his head: he hits it with his head, going up.
        const bump = setup({ specs: [spec(1, 300, 560)] });
        Body.setVelocity(bump.monkey.body, { x: 0, y: -4 });
        for (let step = 0; step < 30; step++) {
            bump.advance(1);
            if (bump.monkey.position.y < 640) {
                expect(bump.monkey.grounded, String(step)).toBe(false);
            }
        }
    });

    it('is held up by a bomb under him, which the engine names after him', () => {
        const { world, monkey, advance } = setup({
            specs: [spec(1, 300, 680)],
        });
        // The bomb rests on a piece lying on the floor: its top is 70 px above the floor, so
        // only the contact holds him.
        world.grab(1, { x: 300, y: 680 });
        world.release({ x: 0, y: 0 });
        Body.setPosition(monkey.body, { x: 700, y: 665 });
        world.placeBomb({ x: 300, y: 600 });
        advance(30);
        Body.setPosition(monkey.body, { x: 300, y: 540 });
        Body.setVelocity(monkey.body, { x: 0, y: 0 });
        let held = false;

        for (let step = 0; step < 40; step++) {
            advance(1);
            held ||= monkey.grounded && monkey.position.y < 640;
        }

        expect(held).toBe(true);
    });

    it('is held up by a piece under him, which is what stands him on it', () => {
        const { monkey, advance } = setup({ specs: [spec(1, 300, 500)] });
        Body.setPosition(monkey.body, { x: 300, y: 480 - 35 - 30 });

        advance(120);

        expect(monkey.grounded).toBe(true);
        expect(monkey.position.y).toBeLessThan(500);
    });

    it('is not held up by a piece he only leans on from the side', () => {
        const { monkey, advance } = setup({
            specs: [spec(1, 330, 400, { width: 20, height: 800 })],
        });
        Body.setPosition(monkey.body, { x: 295, y: 300 });
        Body.setVelocity(monkey.body, { x: 3, y: 0 });

        advance(2);

        expect(monkey.grounded).toBe(false);
    });

    it('is hurt by a hard fall onto a pinned piece, like onto the floor, and not by a lesser one', () => {
        const soft = setup({ specs: [spec(1, 300, 500)] });
        Body.setPosition(soft.monkey.body, { x: 300, y: 480 - 35 - 145 });
        soft.advance(120);
        expect(soft.events('monkey.hit')).toEqual([]);

        const hard = setup({ specs: [spec(1, 300, 500)] });
        Body.setPosition(hard.monkey.body, { x: 300, y: 480 - 35 - 260 });
        hard.advance(60);
        expect(hard.events('monkey.hit')).toContainEqual(
            expect.objectContaining({ against: 'piece' }),
        );
    });
});

describe('a piece he carries, while the page goes on', () => {
    const carried = (): Harness => {
        const harness = setup({ specs: [spec(1, 400, 300)] });
        harness.world.grab(1, { x: 400, y: 300 });
        harness.world.release({ x: 0, y: 0 });
        harness.world.take(1);
        harness.world.carry(1, { x: 400, y: 640 });
        return harness;
    };

    it('is not thrown by a bomb, so the page comes to rest and a drop starts from rest', () => {
        const { world, advance } = carried();
        // 250 px from the piece, within the blast, and out of the monkey's reach.
        world.placeBomb({ x: 650, y: 680 });

        advance(120);

        expect(world.resting).toBe(true);
        world.letGo(1);
        advance(1);
        expect(world.piece(1)?.position.x).toBeCloseTo(400, 0);
        expect(world.piece(1)?.position.y).toBeCloseTo(640, 0);
    });

    it('does not float away when gravity goes, and drops from rest', () => {
        const { world, advance } = carried();

        world.setZeroGravity(true);
        advance(30);
        expect(world.piece(1)?.position.y).toBeCloseTo(640, 0);
        world.letGo(1);
        advance(1);

        expect(world.piece(1)?.position.x).toBeCloseTo(400, 0);
        expect(world.piece(1)?.position.y).toBeCloseTo(640, 0);
    });

    it('is not swept away by a tornado', () => {
        const { world, advance } = carried();

        world.startTornado(400);
        advance(60);

        expect(world.piece(1)?.position).toEqual({ x: 400, y: 640 });
    });
});

describe('passing through the loose pieces', () => {
    const LOOSE = 8;
    // A loose piece lying on the floor at x = 600, 100 wide.
    const lying = (): Harness => {
        const harness = setup({ specs: [spec(1, 600, 680)] });
        harness.world.grab(1, { x: 600, y: 680 });
        harness.world.release({ x: 0, y: 0 });
        harness.advance(60);
        return harness;
    };
    const mask = (monkey: MonkeyBody): number =>
        monkey.body.collisionFilter.mask ?? 0;

    it('walks through it without moving it', () => {
        const { world, monkey, advance } = lying();
        const before = world.piece(1)?.position ?? { x: 0, y: 0 };

        monkey.passThrough(true);
        monkey.goTo(800, 3);
        advance(200);

        expect(monkey.position.x).toBeGreaterThan(780);
        expect(monkey.position.y).toBeCloseTo(665, 0);
        expect(world.piece(1)?.position.x).toBeCloseTo(before.x, 1);
    });

    it('pushes it when he does not pass', () => {
        const { world, monkey, advance } = lying();
        const before = world.piece(1)?.position.x ?? 0;

        monkey.goTo(800, 3);
        advance(120);

        expect(
            Math.abs((world.piece(1)?.position.x ?? 0) - before),
        ).toBeGreaterThan(5);
    });

    it('goes out of the page by a side like any walk, the walls being no obstacle to him', () => {
        const { monkey, advance } = lying();

        monkey.passThrough(true);
        monkey.goTo(2000, 6.5);
        advance(300);

        expect(monkey.position.x).toBeGreaterThan(1010);
    });

    it('waits until he is clear of the pieces to collide with them again', () => {
        const { world, monkey, advance } = lying();
        const before = world.piece(1)?.position ?? { x: 0, y: 0 };
        monkey.passThrough(true);
        monkey.goTo(600, 3);
        advance(200);
        expect(Math.abs(monkey.position.x - 600)).toBeLessThanOrEqual(10);

        monkey.passThrough(false);
        advance(30);

        expect(mask(monkey) & LOOSE).toBe(0);
        expect(world.piece(1)?.position.x).toBeCloseTo(before.x, 1);

        Body.setPosition(monkey.body, { x: 300, y: 665 });
        advance(1);

        expect(mask(monkey) & LOOSE).toBe(LOOSE);
    });

    it('collides again on the next step when no piece is under him', () => {
        const { world, monkey, advance } = lying();
        monkey.passThrough(true);
        monkey.passThrough(false);

        advance(1);
        expect(mask(monkey) & LOOSE).toBe(LOOSE);
        expect(world.piece(1)?.pinned).toBe(false);
    });
});

// Out of the page by the top or a side, he is said to have left once he has been out for 1.5 s of
// game time and the visitor does not hold him.
describe('leaving the page', () => {
    // High enough that he is still falling back after the 1.5 s wait.
    const above = { x: 400, y: -5000 };
    const placeAt = (harness: Harness, at: { x: number; y: number }): void => {
        Body.setPosition(harness.monkey.body, at);
        Body.setVelocity(harness.monkey.body, { x: 0, y: 0 });
    };

    it('says so once he has been out for 1.5 s, by the top', () => {
        const harness = setup();
        placeAt(harness, above);

        harness.advance(85);
        expect(harness.events('monkey.left')).toEqual([]);

        harness.advance(10);
        expect(harness.events('monkey.left')).toEqual([{ side: 'top' }]);
    });

    it('says the side he went by, on the floor that goes on beyond the page or past its end', () => {
        const left = setup();
        placeAt(left, { x: -100, y: 665 });
        left.advance(100);
        expect(left.events('monkey.left')).toEqual([{ side: 'left' }]);

        const right = setup();
        placeAt(right, { x: 1100, y: 665 });
        right.advance(100);
        expect(right.events('monkey.left')).toEqual([{ side: 'right' }]);

        const beyond = setup();
        placeAt(beyond, { x: 1500, y: 2000 });
        beyond.advance(100);
        expect(beyond.events('monkey.left')).toEqual([{ side: 'right' }]);
    });

    it('says it again every 1.5 s while he is still out, as who heard it may have been busy', () => {
        const harness = setup();
        placeAt(harness, above);

        harness.advance(200);

        expect(harness.events('monkey.left')).toHaveLength(2);
    });

    it('says nothing once he is back inside, and starts again for the next exit', () => {
        const harness = setup();
        placeAt(harness, above);
        harness.advance(100);
        expect(harness.events('monkey.left')).toHaveLength(1);

        placeAt(harness, { x: 300, y: 665 });
        harness.advance(150);
        expect(harness.events('monkey.left')).toHaveLength(1);

        placeAt(harness, above);
        harness.advance(100);
        expect(harness.events('monkey.left')).toHaveLength(2);
    });

    it('does not count him out while any of him is inside, set down on the edge', () => {
        const harness = setup();
        placeAt(harness, { x: -19, y: 665 });

        harness.advance(200);

        expect(harness.events('monkey.left')).toEqual([]);
    });

    it('says nothing when he is back inside before the wait is over, and counts again from the next exit', () => {
        const harness = setup();
        placeAt(harness, above);
        harness.advance(60);
        placeAt(harness, { x: 300, y: 665 });
        harness.advance(100);
        expect(harness.events('monkey.left')).toEqual([]);

        placeAt(harness, above);
        harness.advance(60);
        expect(harness.events('monkey.left')).toEqual([]);
        harness.advance(40);
        expect(harness.events('monkey.left')).toHaveLength(1);
    });

    it('counts the 1.5 s from the latest exit, not from one he came back from', () => {
        const harness = setup();
        placeAt(harness, above);
        harness.advance(60);
        placeAt(harness, { x: 300, y: 665 });
        harness.advance(5);

        placeAt(harness, above);
        harness.advance(50);

        expect(harness.events('monkey.left')).toEqual([]);
        harness.advance(45);
        expect(harness.events('monkey.left')).toHaveLength(1);
    });

    it('says nothing while the visitor holds him, and waits again from the moment he lets go', () => {
        const harness = setup();
        placeAt(harness, above);
        harness.advance(30);
        harness.world.grab(MONKEY, above);

        harness.advance(200);
        expect(harness.events('monkey.left')).toEqual([]);

        harness.world.release({ x: 0, y: 0 });
        harness.advance(80);
        expect(harness.events('monkey.left')).toEqual([]);
        harness.advance(20);
        expect(harness.events('monkey.left')).toHaveLength(1);
    });

    it('does not say it for a timer that fires when he is back inside or taken, before a step noticed', () => {
        const back = setup();
        placeAt(back, above);
        back.advance(1);
        placeAt(back, { x: 300, y: 300 });
        for (let i = 0; i < 7; i++) {
            back.clock.tick(250);
        }
        expect(back.events('monkey.left')).toEqual([]);

        const held = setup();
        placeAt(held, above);
        held.advance(1);
        held.world.grab(MONKEY, above);
        for (let i = 0; i < 7; i++) {
            held.clock.tick(250);
        }
        expect(held.events('monkey.left')).toEqual([]);
    });

    it('puts a wait on the game clock, which the sleeping loop wakes for', () => {
        const harness = setup();
        expect(harness.clock.next()).toBeUndefined();

        placeAt(harness, above);
        harness.advance(1);

        expect(harness.clock.next()).toBeDefined();
    });

    it('drops the wait when the page is measured again', () => {
        const harness = setup();
        placeAt(harness, above);
        harness.advance(1);

        harness.world.dispose();

        expect(harness.clock.next()).toBeUndefined();
    });

    it('has no one to watch before he is added', () => {
        const { world, advance, events } = bare();

        advance(100);

        expect(world.monkey).toBeUndefined();
        expect(events('monkey.left')).toEqual([]);
    });
});

// In zero gravity everything floats in view: the ceiling and the side walls close on him too.
describe('the walls in zero gravity', () => {
    const sideBit = (monkey: MonkeyBody): number =>
        (monkey.body.collisionFilter.mask ?? 0) & 2;

    it('keep him under the ceiling, where he floats, with no exit', () => {
        const { world, monkey, advance, events } = setup();
        world.setZeroGravity(true);
        Body.setVelocity(monkey.body, { x: 0, y: -8 });

        advance(300);

        expect(monkey.position.y).toBeGreaterThan(30);
        expect(events('monkey.left')).toEqual([]);
    });

    it('close on him once the gravity is off and his whole body is inside, and open when it is back', () => {
        const { world, monkey, advance } = setup();
        expect(sideBit(monkey)).toBe(0);

        world.setZeroGravity(true);
        advance(1);
        expect(sideBit(monkey)).toBe(2);

        world.setZeroGravity(false);
        advance(1);
        expect(sideBit(monkey)).toBe(0);
    });

    it('wait for him to be in when the gravity goes off while he is out, then close', () => {
        const { world, monkey, advance } = setup();
        Body.setPosition(monkey.body, { x: 400, y: -5000 });
        Body.setVelocity(monkey.body, { x: 0, y: 0 });

        world.setZeroGravity(true);
        advance(5);
        expect(sideBit(monkey)).toBe(0);

        Body.setPosition(monkey.body, { x: 400, y: 300 });
        advance(1);
        expect(sideBit(monkey)).toBe(2);
    });

    it.each([
        ['his left side just on the wall', 20, 300],
        ['his right side just on the wall', 980, 300],
        ['his head just under the ceiling', 400, 35],
    ])('close while %s', (_name, x, y) => {
        const { world, monkey, advance } = setup();
        world.setZeroGravity(true);
        Body.setPosition(monkey.body, { x, y });
        Body.setVelocity(monkey.body, { x: 0, y: 0 });

        advance(1);

        expect(sideBit(monkey)).toBe(2);
    });

    it.each([
        ['his left side', 19, 300],
        ['his right side', 981, 300],
        ['his head', 400, 34],
    ])('do not close while %s is past them', (_name, x, y) => {
        const { world, monkey, advance } = setup();
        world.setZeroGravity(true);
        Body.setPosition(monkey.body, { x, y });
        Body.setVelocity(monkey.body, { x: 0, y: 0 });

        advance(1);

        expect(sideBit(monkey)).toBe(0);
    });
});
