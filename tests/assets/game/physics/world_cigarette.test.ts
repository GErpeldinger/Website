import { Body, Composite } from 'matter-js';
import { describe, expect, it, vi } from 'vitest';
import { Clock } from '../../../../assets/game/clock/clock';
import { EventBus } from '../../../../assets/game/events/event_bus';
import type { GameEvents } from '../../../../assets/game/events/game_events';
import { traitsOf } from '../../../../assets/game/physics/kinds';
import {
    PhysicsWorld,
    STEP,
    type PieceSpec,
} from '../../../../assets/game/physics/world';

// His cigarette in the world: a 1000 px wide page whose ground starts at 700, the monkey at 300.
const names = [
    'cig.lost',
    'cig.discarded',
    'cig.lit',
    'monkey.hit',
    'monkey.landed',
] as const satisfies readonly (keyof GameEvents)[];

interface Harness {
    world: PhysicsWorld;
    clock: Clock;
    advance: (steps: number) => void;
    events: (name: string) => unknown[];
    reducedMotion: boolean;
}

const setup = (
    specs: PieceSpec[] = [],
    reducedMotion = false,
    random = (): number => 0.5,
): Harness => {
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
    world.addMonkey(300);
    return {
        world,
        clock,
        reducedMotion,
        advance: (steps): void => {
            for (let i = 0; i < steps; i++) {
                clock.tick(STEP);
                world.step(STEP);
            }
        },
        events: (name): unknown[] =>
            log.filter((entry) => entry.name === name).map((e) => e.payload),
    };
};

const block = (id: number, x: number, y: number): PieceSpec => ({
    id,
    kind: 'block',
    traits: traitsOf('block', {}),
    x,
    y,
    width: 100,
    height: 40,
});

describe('his cigarette to begin with', () => {
    it('is lit in his mouth, with nothing on the floor', () => {
        const { world } = setup();

        expect(world.cigaretteState).toBe('lit');
        expect(world.cigarette()).toBeUndefined();
    });

    it('can neither be picked up nor lit', () => {
        const { world, events } = setup();

        expect(world.pickUpCigarette(false)).toBe(false);
        expect(world.pickUpCigarette(true)).toBe(false);
        expect(world.lightCigarette()).toBe(false);
        expect(events('cig.discarded')).toEqual([]);
        expect(events('cig.lit')).toEqual([]);
    });

    it('cannot be lost with no monkey', () => {
        const bus = new EventBus<GameEvents>();
        const world = new PhysicsWorld({ width: 1000, floor: 700 }, [], {
            events: bus,
            clock: new Clock(),
            random: (): number => 0.5,
            reducedMotion: false,
        });

        expect(world.loseCigarette(1, 'hit')).toBe(false);
        expect(world.cigaretteState).toBe('lit');
    });
});

describe('losing it', () => {
    it('drops a body in front of him and says where and why', () => {
        const { world, events } = setup();
        world.step(0);

        expect(world.loseCigarette(1, 'sneeze')).toBe(true);

        const view = world.cigarette();
        expect(world.cigaretteState).toBe('lying');
        expect(view?.x).toBeCloseTo(317, 0);
        expect(view?.y).toBeCloseTo(663, 0);
        expect(events('cig.lost')).toEqual([
            { cause: 'sneeze', at: { x: view?.x, y: view?.y } },
        ]);
    });

    it('drops it behind a monkey who faces left', () => {
        const { world } = setup();

        world.loseCigarette(-1, 'hit');

        expect(world.cigarette()?.x).toBeCloseTo(283, 0);
    });

    it('is lost once, and says so only once', () => {
        const { world, events } = setup();
        world.loseCigarette(1, 'hit');

        expect(world.loseCigarette(1, 'hit')).toBe(false);
        expect(events('cig.lost')).toHaveLength(1);
    });

    it('falls to the floor and lies there, and the page is at rest again', () => {
        const { world, advance } = setup();
        advance(10);
        world.loseCigarette(1, 'hit');
        expect(world.resting).toBe(false);

        advance(240);

        const view = world.cigarette();
        // Lying on the 700 floor, a stick 3 px thick.
        expect(view?.y).toBeGreaterThan(696);
        expect(view?.y).toBeLessThan(700);
        expect(world.resting).toBe(true);
    });

    it('keeps the loop going while it still moves, the monkey and the pieces being still', () => {
        const { world, advance } = setup();
        advance(60);
        expect(world.resting).toBe(true);

        world.loseCigarette(1, 'hit');
        advance(5);

        expect(world.resting).toBe(false);
    });

    it('ignores the pieces: it falls through them, and they through it', () => {
        const { world, advance } = setup([block(0, 317, 600)]);
        advance(5);

        world.loseCigarette(1, 'hit');
        advance(240);

        expect(world.cigarette()?.y).toBeGreaterThan(696);
        expect(world.placements()).toEqual([]);
    });
});

describe('picking it up and lighting it', () => {
    it('removes the body and puts the cigarette in his mouth, unlit, saying nothing', () => {
        const { world, events, advance } = setup();
        world.loseCigarette(1, 'hit');

        expect(world.pickUpCigarette(false)).toBe(true);

        expect(world.cigaretteState).toBe('unlit');
        expect(world.cigarette()).toBeUndefined();
        expect(events('cig.discarded')).toEqual([]);
        // The body is gone from the simulation: the page can rest.
        advance(40);
        expect(world.resting).toBe(true);
    });

    it('says where it lay when he gives up on it', () => {
        const { world, events } = setup();
        world.loseCigarette(1, 'hit');
        const view = world.cigarette();

        expect(world.pickUpCigarette(true)).toBe(true);

        expect(events('cig.discarded')).toEqual([
            { at: { x: view?.x, y: view?.y } },
        ]);
        expect(world.cigaretteState).toBe('unlit');
    });

    it('takes the body out of the simulation, since it is in his mouth now', () => {
        const { world } = setup();
        world.loseCigarette(1, 'hit');
        const remove = vi.spyOn(Composite, 'remove');

        world.pickUpCigarette(false);

        expect(remove).toHaveBeenCalledTimes(1);
        remove.mockRestore();
    });

    it('is picked up once', () => {
        const { world } = setup();
        world.loseCigarette(1, 'hit');
        world.pickUpCigarette(false);

        expect(world.pickUpCigarette(false)).toBe(false);
    });

    it('is lit once, which he says', () => {
        const { world, events } = setup();
        world.loseCigarette(1, 'hit');
        world.pickUpCigarette(false);

        expect(world.lightCigarette()).toBe(true);
        expect(world.cigaretteState).toBe('lit');
        expect(events('cig.lit')).toEqual([undefined]);
        expect(world.lightCigarette()).toBe(false);
        expect(events('cig.lit')).toHaveLength(1);
    });

    it('can be lost again once lit', () => {
        const { world, events } = setup();
        world.loseCigarette(1, 'hit');
        world.pickUpCigarette(false);
        world.lightCigarette();

        expect(world.loseCigarette(1, 'sneeze')).toBe(true);
        expect(events('cig.lost')).toHaveLength(2);
    });
});

describe('a bomb', () => {
    it('kicks the cigarette on the floor, on 0.4 of the falloff a piece gets', () => {
        const { world, advance, clock } = setup();
        advance(10);
        world.loseCigarette(1, 'hit');
        advance(200);
        const before = world.cigarette()?.x ?? 0;
        // Bombs hit from 133 px to its right: strength 1 - 133 / 300.
        world.placeBomb({ x: before + 133, y: 690 });
        while (world.bombs().length > 0) {
            advance(1);
        }
        const exploded = world.cigarette()?.x ?? 0;
        advance(1);

        const moved = (world.cigarette()?.x ?? 0) - exploded;
        // Power 7 + 24 * 0.4 * (1 - d / r), to the left, a little less for the air.
        expect(moved).toBeLessThan(-8);
        expect(moved).toBeGreaterThan(-14);
        expect(clock.now()).toBeGreaterThan(0);
    });

    it('does not reach it when it lies further than its radius', () => {
        const { world, advance } = setup();
        world.addMonkey(100);
        world.loseCigarette(1, 'hit');
        advance(200);
        const before = world.cigarette()?.x ?? 0;

        world.placeBomb({ x: before + 400, y: 690 });
        advance(120);

        expect(world.cigarette()?.x).toBeCloseTo(before, 0);
    });
});

describe('a tornado', () => {
    it('sweeps it up and the ceiling and walls keep it in the page', () => {
        const { world, advance } = setup();
        world.loseCigarette(1, 'hit');
        advance(200);

        world.startTornado(317);
        advance(30);
        expect(world.cigarette()?.y).toBeLessThan(500);

        advance(300);
        const view = world.cigarette();
        expect(view?.y).toBeGreaterThan(0);
        expect(view?.x).toBeGreaterThan(0);
        expect(view?.x).toBeLessThan(1000);
    });

    it('leaves it alone when it is out of its reach', () => {
        const { world, advance } = setup();
        world.loseCigarette(1, 'hit');
        advance(200);

        world.startTornado(900);
        advance(30);

        expect(world.cigarette()?.y).toBeGreaterThan(690);
    });
});

describe('whether he is free', () => {
    it('is in the page and not in the visitor’s hand', () => {
        const { world } = setup();

        expect(world.monkeyFree).toBe(true);
    });

    it('is not while the visitor holds him', () => {
        const { world } = setup();
        world.grab(-1, { x: 300, y: 665 });

        expect(world.monkeyFree).toBe(false);
    });

    it('is not once he is out of the page', () => {
        const { world } = setup();
        if (world.monkey) {
            Body.setPosition(world.monkey.body, { x: 300, y: -100 });
        }

        expect(world.monkeyFree).toBe(false);
    });
});

describe('his own jump', () => {
    it('is no fall to be hurt by when he lands on the floor', () => {
        const { world, advance, events } = setup();
        advance(30);

        world.monkey?.launch(0, -12);
        advance(120);

        expect(events('monkey.hit')).toEqual([]);
        expect(world.monkey?.grounded).toBe(true);
        expect(world.monkey?.tumbling).toBe(false);
    });

    it('ends in the air when a blast throws him mid-jump', () => {
        const { world, advance } = setup();
        advance(30);
        world.placeBomb({ x: 300, y: 690 });
        advance(50);
        world.monkey?.launch(0, -14);
        expect(world.monkey?.leaping).toBe(true);

        while (world.bombs().length > 0) {
            advance(1);
        }

        // Still in the air, thrown by the blast: not a leap of his any more.
        expect(world.monkey?.grounded).toBe(false);
        expect(world.monkey?.leaping).toBe(false);
    });

    it('is a fall when he was merely dropped from as high', () => {
        const { world, advance, events } = setup();
        advance(30);

        if (world.monkey) {
            Body.setPosition(world.monkey.body, { x: 300, y: 300 });
            Body.setVelocity(world.monkey.body, { x: 0, y: -12 });
        }
        advance(240);

        expect(events('monkey.hit')).not.toEqual([]);
    });
});
