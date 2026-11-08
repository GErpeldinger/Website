import { Bodies, Body } from 'matter-js';
import { describe, expect, it } from 'vitest';
import { Vortex } from '../../../../assets/game/physics/vortex';

const at = (x: number, y: number): Body => Bodies.rectangle(x, y, 20, 20);

describe('step', () => {
    it('drifts with a slow sway when nothing steers it', () => {
        const vortex = new Vortex(500, 1000);

        vortex.step(undefined);

        expect(vortex.x).toBeCloseTo(500 + Math.sin(0.16 * 0.35) * 1.4);
    });

    it('follows the pointer a little more each step', () => {
        const vortex = new Vortex(500, 1000);

        vortex.step(700);

        expect(vortex.x).toBeCloseTo(
            500 + 200 * 0.018 + Math.sin(0.16 * 0.35) * 1.4,
        );
    });

    it('turns on, step after step', () => {
        const vortex = new Vortex(500, 1000);
        vortex.step(undefined);
        const first = vortex.x;

        vortex.step(undefined);

        expect(vortex.x).toBeCloseTo(first + Math.sin(0.32 * 0.35) * 1.4);
    });

    it('stays 70 px inside the page', () => {
        const left = new Vortex(100, 1000);
        left.step(-5000);
        expect(left.x).toBe(70);

        const right = new Vortex(950, 1000);
        right.step(5000);
        expect(right.x).toBe(930);
    });
});

describe('reaches', () => {
    it('covers 270 px each side, whatever the height', () => {
        const vortex = new Vortex(500, 1000);

        expect(vortex.reaches(at(770, 9000))).toBe(true);
        expect(vortex.reaches(at(770.5, 0))).toBe(false);
        expect(vortex.reaches(at(230, 0))).toBe(true);
        expect(vortex.reaches(at(229.5, 0))).toBe(false);
    });
});

describe('pull', () => {
    it('draws a body in and lifts it, and swirls it with the height', () => {
        const vortex = new Vortex(500, 1000);
        vortex.step(undefined);
        const body = at(600, 300);

        vortex.pull(body);

        const n = 1 - Math.abs(body.position.x - vortex.x) / 270;
        const swirl = Math.sin(0.16 + 300 * 0.012);
        expect(body.velocity.x).toBeCloseTo(-n * 0.65 + swirl * n * 2.5);
        expect(body.velocity.y).toBeCloseTo(-(1.25 + n));
        expect(body.angularVelocity).toBeCloseTo(n * 0.012);
    });

    it('draws a body on the left towards the right', () => {
        const vortex = new Vortex(500, 1000);
        vortex.step(undefined);
        const body = at(400, 0);

        vortex.pull(body);

        const n = 1 - Math.abs(body.position.x - vortex.x) / 270;
        const swirl = Math.sin(0.16);
        expect(body.velocity.x).toBeCloseTo(n * 0.65 + swirl * n * 2.5);
    });

    it('treats a body right on the axis as a body on its left', () => {
        const vortex = new Vortex(500, 1000);
        vortex.step(undefined);
        const body = at(vortex.x, 0);

        vortex.pull(body);

        expect(body.velocity.x).toBeCloseTo(0.65 + Math.sin(0.16) * 2.5);
    });

    it('adds to the speed the body already has', () => {
        const vortex = new Vortex(500, 1000);
        vortex.step(undefined);
        const body = at(vortex.x, 0);
        Body.setVelocity(body, { x: 1, y: 2 });

        vortex.pull(body);

        expect(body.velocity.y).toBeCloseTo(2 - 2.25);
    });

    it('caps the speed at 24', () => {
        const vortex = new Vortex(500, 1000);
        const body = at(500, 0);
        Body.setVelocity(body, { x: 0, y: -100 });

        vortex.pull(body);

        expect(Math.hypot(body.velocity.x, body.velocity.y)).toBeCloseTo(24);
    });
});
