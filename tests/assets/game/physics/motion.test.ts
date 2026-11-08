import { Bodies, Body } from 'matter-js';
import { describe, expect, it } from 'vitest';
import {
    capSpeed,
    kick,
    limitSpeed,
} from '../../../../assets/game/physics/motion';

const box = (): Body => Bodies.rectangle(100, 100, 20, 20);

describe('capSpeed', () => {
    it('scales a faster velocity down to the limit', () => {
        const capped = capSpeed({ x: 300, y: 400 }, 100);

        expect(capped.x).toBeCloseTo(60);
        expect(capped.y).toBeCloseTo(80);
    });

    it('returns a slower velocity, and a null one, as they are', () => {
        expect(capSpeed({ x: 3, y: -4 }, 10)).toEqual({ x: 3, y: -4 });
        expect(capSpeed({ x: 0, y: 0 }, 10)).toEqual({ x: 0, y: 0 });
    });
});

describe('limitSpeed', () => {
    it('scales a faster body down to the limit, keeping its direction', () => {
        const body = box();
        Body.setVelocity(body, { x: 30, y: -40 });

        limitSpeed(body, 10);

        expect(body.velocity.x).toBeCloseTo(6);
        expect(body.velocity.y).toBeCloseTo(-8);
    });

    it('leaves a slower body alone', () => {
        const body = box();
        Body.setVelocity(body, { x: 3, y: 4 });

        limitSpeed(body, 10);

        expect(body.velocity.x).toBeCloseTo(3);
        expect(body.velocity.y).toBeCloseTo(4);
    });

    it('leaves a body at rest alone', () => {
        const body = box();

        limitSpeed(body, 10);

        expect(body.velocity).toEqual({ x: 0, y: 0 });
    });
});

describe('kick', () => {
    it('pushes along the direction, harder for a stronger blast, and a little up', () => {
        const point = box();
        kick(point, 1, 0, 0, () => 0.5);
        expect(point.velocity.x).toBeCloseTo(7);
        expect(point.velocity.y).toBeCloseTo(0);

        const centre = box();
        kick(centre, 0, 1, 1, () => 0.5);
        expect(centre.velocity.x).toBeCloseTo(0);
        // 7 + 24 down, minus 4 up.
        expect(centre.velocity.y).toBeCloseTo(27);
    });

    it('adds to the speed the body already has', () => {
        const body = box();
        Body.setVelocity(body, { x: -2, y: 3 });

        kick(body, -1, 0, 0.5, () => 0.5);

        // 7 + 12 = 19 to the left, on top of the 2 it had; and 0.5 * 4 up.
        expect(body.velocity.x).toBeCloseTo(-21);
        expect(body.velocity.y).toBeCloseTo(1);
    });

    it('spins the body by a random amount that grows with the strength', () => {
        const spinning = box();
        Body.setAngularVelocity(spinning, 0.1);
        kick(spinning, 1, 0, 1, () => 1);
        // (1 - 0.5) * 0.5 * (0.3 + 1) = 0.325, on top of 0.1.
        expect(spinning.angularVelocity).toBeCloseTo(0.425);

        const other = box();
        kick(other, 1, 0, 0, () => 0);
        // (0 - 0.5) * 0.5 * 0.3 = -0.075.
        expect(other.angularVelocity).toBeCloseTo(-0.075);
    });
});
