import { describe, expect, it } from 'vitest';
import { Clock } from '../../../../../../assets/game/clock/clock';
import { EventBus } from '../../../../../../assets/game/events/event_bus';
import {
    PhysicsWorld,
    STEP,
} from '../../../../../../assets/game/physics/world';
import { jumpFor } from '../../../../../../assets/game/activities/monkey/search/jump';

describe('the jump to a cigarette overhead', () => {
    it('goes up by the root of 0.72 times the height plus 30', () => {
        // 0.72 * (100 + 30) = 93.6
        expect(jumpFor(100, 0).vy).toBeCloseTo(-Math.sqrt(93.6));
    });

    it('goes up at least 6, for a cigarette just over his head', () => {
        expect(jumpFor(7, 0).vy).toBe(-6);
    });

    it('goes up at most 14, however high it is', () => {
        expect(jumpFor(1000, 0).vy).toBe(-14);
        expect(jumpFor(200, 0).vy).toBeCloseTo(-12.87, 1);
    });

    it('goes across by a tenth of the distance, towards it', () => {
        expect(jumpFor(100, 30).vx).toBeCloseTo(3);
        expect(jumpFor(100, -30).vx).toBeCloseTo(-3);
        expect(jumpFor(100, 0).vx).toBe(0);
    });

    it('goes across by 4 at most', () => {
        expect(jumpFor(100, 80).vx).toBe(4);
        expect(jumpFor(100, -80).vx).toBe(-4);
    });
});

describe('the jump in the world', () => {
    // How far his head rises over its standing height, in a real world: gravity, air friction.
    const rise = (above: number): number => {
        const clock = new Clock();
        const world = new PhysicsWorld({ width: 1000, floor: 700 }, [], {
            events: new EventBus(),
            clock,
            random: (): number => 0.5,
            reducedMotion: false,
        });
        const monkey = world.addMonkey(300);
        const step = (): void => {
            clock.tick(STEP);
            world.step(STEP);
        };
        for (let i = 0; i < 40; i++) {
            step();
        }
        const standing = monkey.top;
        const { vx, vy } = jumpFor(above, 0);
        monkey.launch(vx, vy);
        let highest = standing;
        for (let i = 0; i < 120; i++) {
            step();
            highest = Math.min(highest, monkey.top);
        }
        return standing - highest;
    };

    it('lifts his head to a cigarette 120 px over it, and not 40 px past', () => {
        expect(rise(120)).toBeGreaterThanOrEqual(120);
        expect(rise(120)).toBeLessThan(160);
    });

    it('does the same for the heights in between', () => {
        for (const above of [40, 80, 160, 200]) {
            expect(rise(above)).toBeGreaterThanOrEqual(above);
            expect(rise(above)).toBeLessThan(above + 40);
        }
    });
});
