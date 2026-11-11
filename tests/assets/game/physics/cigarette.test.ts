import { Bodies, Body } from 'matter-js';
import { describe, expect, it } from 'vitest';
import { Cigarette } from '../../../../assets/game/physics/cigarette';

// A monkey standing at (300, 665), as the world has him, and a "random" that returns what the
// test says, in order.
const monkey = (velocity = { x: 0, y: 0 }): Body => {
    const body = Bodies.rectangle(300, 665, 40, 70);
    Body.setVelocity(body, velocity);
    return body;
};

const sequence =
    (...values: number[]) =>
    (): number =>
        values.shift() ?? 0;

describe('the cigarette in his mouth', () => {
    it('is lit and shows nothing on the page', () => {
        const cigarette = new Cigarette();

        expect(cigarette.state).toBe('lit');
        expect(cigarette.view()).toBeUndefined();
        expect(cigarette.body).toBeUndefined();
    });

    it('cannot be taken or lit', () => {
        const cigarette = new Cigarette();

        expect(cigarette.take()).toBeUndefined();
        expect(cigarette.light()).toBe(false);
        expect(cigarette.state).toBe('lit');
    });
});

describe('losing it', () => {
    it('drops a body at his mouth, 17 px in front of him and 2 above his centre', () => {
        const right = new Cigarette();
        const left = new Cigarette();

        const a = right.lose(monkey(), 1, sequence());
        const b = left.lose(monkey(), -1, sequence());

        expect(a?.position).toEqual({ x: 317, y: 663 });
        expect(b?.position).toEqual({ x: 283, y: 663 });
        expect(right.state).toBe('lying');
        expect(right.body).toBe(a);
    });

    it('throws it with 0.6 of his speed and a random jitter, never downwards', () => {
        const cigarette = new Cigarette();

        // x: 0.6 * 10 + (1 - 0.5) * 6; y: min(0.6 * 5, 0) - 3 - 1 * 3; spin (0.75 - 0.5) * 0.6.
        const body = cigarette.lose(
            monkey({ x: 10, y: 5 }),
            1,
            sequence(1, 1, 0.75),
        );

        expect(body?.velocity.x).toBeCloseTo(9);
        expect(body?.velocity.y).toBeCloseTo(-6);
        expect(body?.angularVelocity).toBeCloseTo(0.15);
    });

    it('keeps the upward part of his speed, and is thrown up by at least 3', () => {
        const body = new Cigarette().lose(
            monkey({ x: -10, y: -20 }),
            1,
            sequence(0.5, 0, 0.5),
        );

        expect(body?.velocity.x).toBeCloseTo(-6);
        expect(body?.velocity.y).toBeCloseTo(-15);
        expect(body?.angularVelocity).toBeCloseTo(0);
    });

    it('is lost once: he has only the one', () => {
        const cigarette = new Cigarette();
        cigarette.lose(monkey(), 1, sequence());

        expect(cigarette.lose(monkey(), 1, sequence())).toBeUndefined();
    });

    it('is seen where it lies, turned as it is', () => {
        const cigarette = new Cigarette();
        const body = cigarette.lose(monkey(), 1, sequence());
        if (!body) {
            throw new Error('He should have lost it.');
        }
        Body.setPosition(body, { x: 400, y: 690 });
        Body.setAngle(body, 0.4);

        expect(cigarette.view()).toEqual({ x: 400, y: 690, angle: 0.4 });
    });
});

describe('finding it again', () => {
    it('takes the body and leaves it unlit in his mouth', () => {
        const cigarette = new Cigarette();
        const body = cigarette.lose(monkey(), 1, sequence());

        expect(cigarette.take()).toBe(body);
        expect(cigarette.state).toBe('unlit');
        expect(cigarette.view()).toBeUndefined();
        expect(cigarette.body).toBeUndefined();
        expect(cigarette.take()).toBeUndefined();
    });

    it('is lit with the lighter, once', () => {
        const cigarette = new Cigarette();
        cigarette.lose(monkey(), 1, sequence());
        cigarette.take();

        expect(cigarette.light()).toBe(true);
        expect(cigarette.state).toBe('lit');
        expect(cigarette.light()).toBe(false);
    });

    it('cannot be lit while it lies on the floor', () => {
        const cigarette = new Cigarette();
        cigarette.lose(monkey(), 1, sequence());

        expect(cigarette.light()).toBe(false);
        expect(cigarette.state).toBe('lying');
    });

    it('cannot be lost while it is being lit', () => {
        const cigarette = new Cigarette();
        cigarette.lose(monkey(), 1, sequence());
        cigarette.take();

        expect(cigarette.lose(monkey(), 1, sequence())).toBeUndefined();
        expect(cigarette.state).toBe('unlit');
    });
});
