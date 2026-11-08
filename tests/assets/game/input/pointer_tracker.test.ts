import { describe, expect, it } from 'vitest';
import { PointerTracker } from '../../../../assets/game/input/pointer_tracker';
import { STEP } from '../../../../assets/game/physics/world';

describe('PointerTracker', () => {
    it('has no velocity before it has seen two samples', () => {
        const tracker = new PointerTracker();
        expect(tracker.velocity(0)).toEqual({ x: 0, y: 0 });
        tracker.add({ x: 10, y: 10 }, 0);
        expect(tracker.velocity(0)).toEqual({ x: 0, y: 0 });
    });

    it('measures the motion in pixels per physics step', () => {
        const tracker = new PointerTracker();
        tracker.add({ x: 0, y: 0 }, 0);
        tracker.add({ x: 50, y: -25 }, STEP * 5);

        const velocity = tracker.velocity(STEP * 5);

        expect(velocity.x).toBeCloseTo(10);
        expect(velocity.y).toBeCloseTo(-5);
    });

    it('measures the last 100 ms only', () => {
        const tracker = new PointerTracker();
        tracker.add({ x: 0, y: 0 }, 0);
        tracker.add({ x: 1000, y: 0 }, 50);
        // The first two samples are older than 100 ms by the time of the last one.
        tracker.add({ x: 1000, y: 0 }, 200);
        tracker.add({ x: 1060, y: 0 }, 250);

        const velocity = tracker.velocity(250);

        expect(velocity.x).toBeCloseTo((60 / 50) * STEP);
    });

    it('keeps a sample exactly 100 ms old', () => {
        const tracker = new PointerTracker();
        tracker.add({ x: 0, y: 0 }, 0);
        tracker.add({ x: 100, y: 0 }, 100);

        expect(tracker.velocity(100).x).toBeCloseTo((100 / 100) * STEP);
    });

    it('is still when the pointer rested for 100 ms before the release', () => {
        const tracker = new PointerTracker();
        tracker.add({ x: 0, y: 0 }, 0);
        tracker.add({ x: 50, y: 0 }, 20);

        expect(tracker.velocity(120).x).toBeGreaterThan(0);
        expect(tracker.velocity(121)).toEqual({ x: 0, y: 0 });
    });

    it('has no velocity when two samples share a timestamp', () => {
        const tracker = new PointerTracker();
        tracker.add({ x: 0, y: 0 }, 5);
        tracker.add({ x: 50, y: 0 }, 5);

        expect(tracker.velocity(5)).toEqual({ x: 0, y: 0 });
    });

    it('forgets everything on reset', () => {
        const tracker = new PointerTracker();
        tracker.add({ x: 0, y: 0 }, 0);
        tracker.add({ x: 50, y: 0 }, 10);
        tracker.reset();

        expect(tracker.velocity(10)).toEqual({ x: 0, y: 0 });
    });
});
