import { describe, expect, it } from 'vitest';
import { Clock } from '../../../../assets/game/clock/clock';
import { EventBus } from '../../../../assets/game/events/event_bus';
import type { GameEvents } from '../../../../assets/game/events/game_events';
import { PhysicsWorld, STEP } from '../../../../assets/game/physics/world';

// What the world shows of its bombs and its tornado, for the effects layer to draw.
const setup = (): {
    world: PhysicsWorld;
    advance: (steps: number) => void;
    tickClock: (ms: number) => void;
} => {
    const clock = new Clock();
    const world = new PhysicsWorld({ width: 1000, floor: 700 }, [], {
        events: new EventBus<GameEvents>(),
        clock,
        random: (): number => 0.5,
        reducedMotion: false,
    });
    return {
        world,
        advance: (steps): void => {
            for (let i = 0; i < steps; i++) {
                clock.tick(STEP);
                world.step(STEP);
            }
        },
        tickClock: (ms): void => {
            for (let left = ms; left > 0; left -= 250) {
                clock.tick(Math.min(250, left));
            }
        },
    };
};

describe('bombs', () => {
    it('lists each pending bomb with its place, turn and how far its fuse has burnt', () => {
        const { world, tickClock } = setup();
        world.placeBomb({ x: 400, y: 200 });
        tickClock(750);
        world.placeBomb({ x: 300, y: 100 });

        const [first, second] = world.bombs();

        expect(world.bombs()).toHaveLength(2);
        expect(first).toMatchObject({ id: 1, x: 400, y: 200, angle: 0 });
        expect(first?.fuse).toBeCloseTo(0.5);
        expect(second).toMatchObject({ id: 2, x: 300, y: 100, fuse: 0 });
    });

    it('follows the body as it falls', () => {
        const { world, advance } = setup();
        world.placeBomb({ x: 400, y: 200 });

        advance(40);

        const [bomb] = world.bombs();
        expect(bomb?.y).toBeGreaterThan(300);
        expect(bomb?.x).toBeCloseTo(400, 0);
    });

    it('reads the turn of the body', () => {
        const { world, advance } = setup();
        world.placeBomb({ x: 400, y: 200 });
        world.startTornado(300);

        advance(30);

        expect(Math.abs(world.bombs()[0]?.angle ?? 0)).toBeGreaterThan(0);
    });

    it('drops a bomb once it has blown or been cancelled', () => {
        const { world, tickClock } = setup();
        world.placeBomb({ x: 400, y: 200 });
        tickClock(1500);
        world.placeBomb({ x: 300, y: 100 });

        expect(world.bombs().map((bomb) => bomb.id)).toEqual([2]);

        world.dispose();
        expect(world.bombs()).toEqual([]);
    });
});

describe('tornado', () => {
    it('is absent until one starts, and once it ends', () => {
        const { world, tickClock } = setup();
        expect(world.tornado()).toBeUndefined();

        world.startTornado(500);
        expect(world.tornado()).toEqual({ x: 500, phase: 0 });

        tickClock(5200);
        expect(world.tornado()).toBeUndefined();
    });

    it('gives the axis and the sway as the air moves them', () => {
        const { world, advance } = setup();
        world.startTornado(500);

        advance(10);

        const view = world.tornado();
        expect(view?.phase).toBeCloseTo(1.6);
        expect(view?.x).not.toBe(500);
    });
});
