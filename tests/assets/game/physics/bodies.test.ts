import { Body } from 'matter-js';
import { describe, expect, it } from 'vitest';
import {
    GROUND,
    MONKEY_HEIGHT,
    MONKEY_WIDTH,
    SIDE,
    bombBody,
    looseFilter,
    monkeyBody,
    monkeyFilter,
    monkeyPassingFilter,
    pieceBody,
    pinnedFilter,
    takenFilter,
    wallBodies,
} from '../../../../assets/game/physics/bodies';
import { traitsOf } from '../../../../assets/game/physics/kinds';

const piece = (over = {}): Body =>
    pieceBody({
        id: 0,
        kind: 'block',
        traits: traitsOf('block', {}),
        x: 300,
        y: 200,
        width: 100,
        height: 40,
        ...over,
    });

describe('pieceBody', () => {
    it('is pinned in place, a rectangle at the measured box', () => {
        const body = piece();

        expect(body.isStatic).toBe(true);
        expect(body.position.x).toBeCloseTo(300);
        expect(body.position.y).toBeCloseTo(200);
        expect(body.bounds.min.x).toBeCloseTo(250);
        expect(body.bounds.max.x).toBeCloseTo(350);
        expect(body.bounds.min.y).toBeCloseTo(180);
        expect(body.bounds.max.y).toBeCloseTo(220);
        expect(body.collisionFilter).toEqual(pinnedFilter());
    });

    // Matter keeps a static body's own values aside and gives them back when it is freed.
    const freed = (over = {}): Body => {
        const body = piece(over);
        Body.setStatic(body, false);
        return body;
    };

    it('has the prototype feel once freed: little bounce, grippy', () => {
        const body = freed();

        expect(body.restitution).toBe(0.22);
        expect(body.friction).toBe(0.65);
    });

    it('is as dense as its weight says', () => {
        const density = (weight: string): number =>
            freed({ traits: traitsOf('block', { weight }) }).density;

        expect(density('light')).toBe(0.0009);
        expect(density('medium')).toBe(0.0014);
        expect(density('heavy')).toBe(0.0025);
    });

    // A chamfer starts at its radius from the corner, along the edge.
    const startsAt = (body: Body, x: number, y: number): boolean =>
        body.vertices.some(
            (vertex) =>
                Math.abs(vertex.x - x) < 0.01 && Math.abs(vertex.y - y) < 0.01,
        );

    it('rounds its corners by 4 px, so it does not snag', () => {
        const body = piece();

        expect(body.vertices.length).toBeGreaterThan(4);
        expect(startsAt(body, 250, 184)).toBe(true);
    });

    it('rounds a small piece by a quarter of its height', () => {
        const body = piece({ width: 60, height: 8 });

        expect(startsAt(body, 270, 198)).toBe(true);
    });
});

describe('the filters', () => {
    it('let a pinned piece feel only the loose, the monkey and the bombs, and a loose one everything', () => {
        expect(pinnedFilter()).toEqual({
            category: 4,
            mask: 8 | 16 | 32,
            group: 0,
        });
        expect(looseFilter()).toEqual({
            category: 8,
            mask: GROUND | SIDE | 4 | 8 | 16 | 32,
            group: 0,
        });
    });

    it('make the monkey stand on the ground and every piece, and be pushed by bombs, but leave the ceiling and the side walls out of his way', () => {
        expect(monkeyBody(100, 700).collisionFilter).toEqual({
            category: 16,
            mask: GROUND | 4 | 8 | 32,
            group: 0,
        });
    });

    it('make the monkey passing through pieces collide with all but the loose and the walls', () => {
        expect(monkeyPassingFilter()).toEqual({
            category: 16,
            mask: GROUND | 4 | 32,
            group: 0,
        });
        expect(monkeyFilter()).toEqual(monkeyBody(100, 700).collisionFilter);
    });

    it('close the ceiling and the side walls on the monkey when asked', () => {
        expect(monkeyFilter(true).mask).toBe(GROUND | SIDE | 4 | 8 | 32);
        expect(monkeyPassingFilter(true).mask).toBe(GROUND | SIDE | 4 | 32);
    });

    it('make a taken piece collide with nothing', () => {
        expect(takenFilter()).toEqual({ category: 64, mask: 0, group: 0 });
    });

    it('give a new object each time, since a body owns its filter', () => {
        expect(pinnedFilter()).not.toBe(pinnedFilter());
        expect(looseFilter()).not.toBe(looseFilter());
        expect(takenFilter()).not.toBe(takenFilter());
        expect(monkeyFilter()).not.toBe(monkeyFilter());
        expect(monkeyPassingFilter()).not.toBe(monkeyPassingFilter());
    });
});

describe('monkeyBody', () => {
    it('is the prototype’s 40 by 70 rectangle, standing on the floor at x', () => {
        const body = monkeyBody(300, 700);

        expect(MONKEY_WIDTH).toBe(40);
        expect(MONKEY_HEIGHT).toBe(70);
        expect(body.isStatic).toBe(false);
        expect(body.position.x).toBeCloseTo(300);
        expect(body.position.y).toBeCloseTo(665);
        expect(body.bounds.min.x).toBeCloseTo(280);
        expect(body.bounds.max.x).toBeCloseTo(320);
        expect(body.bounds.min.y).toBeCloseTo(630);
        expect(body.bounds.max.y).toBeCloseTo(700);
    });

    it('has the prototype feel: grippy, hardly bouncy, a little denser than a piece', () => {
        const body = monkeyBody(300, 700);

        expect(body.friction).toBe(0.8);
        expect(body.restitution).toBe(0.15);
        expect(body.density).toBe(0.002);
    });

    it('rounds its corners by 14 px', () => {
        const body = monkeyBody(300, 700);

        expect(
            body.vertices.some(
                (vertex) =>
                    Math.abs(vertex.x - 280) < 0.01 &&
                    Math.abs(vertex.y - 644) < 0.01,
            ),
        ).toBe(true);
    });
});

describe('bombBody', () => {
    it('is a dense, bouncy circle of 15 px at the given point', () => {
        const body = bombBody({ x: 400, y: 200 }, 700);

        expect(body.isStatic).toBe(false);
        expect(body.position).toEqual({ x: 400, y: 200 });
        expect(body.circleRadius).toBe(15);
        expect(body.restitution).toBe(0.45);
        expect(body.friction).toBe(0.5);
        expect(body.density).toBe(0.004);
    });

    it('collides with everything, the pinned pieces and the monkey included', () => {
        const { category, mask } = bombBody(
            { x: 0, y: 0 },
            700,
        ).collisionFilter;

        expect(category).toBe(32);
        expect(mask).toBe(GROUND | SIDE | 4 | 8 | 16 | 32);
    });

    it('does not start under the ground', () => {
        expect(bombBody({ x: 400, y: 900 }, 700).position.y).toBe(680);
        expect(bombBody({ x: 400, y: 680 }, 700).position.y).toBe(680);
        expect(bombBody({ x: 400, y: 679 }, 700).position.y).toBe(679);
    });
});

describe('wallBodies', () => {
    const [floor, left, right, ceiling] = wallBodies({
        width: 1000,
        floor: 700,
    });

    it('makes the floor, the two sides and the ceiling, all fixed', () => {
        expect(
            [floor, left, right, ceiling].every((wall) => wall?.isStatic),
        ).toBe(true);
    });

    it('lays the floor along the ground strip, wider than the page', () => {
        expect(floor?.bounds.min.y).toBe(700);
        expect(floor?.bounds.max.y).toBe(940);
        expect(floor?.bounds.min.x).toBe(-240);
        expect(floor?.bounds.max.x).toBe(1240);
        expect(floor?.collisionFilter).toEqual({
            category: GROUND,
            mask: 0xffff,
            group: 0,
        });
    });

    it('stands the sides along the page edges, from the ceiling to under the floor', () => {
        expect(left?.bounds.max.x).toBe(0);
        expect(left?.bounds.min.x).toBe(-240);
        expect(right?.bounds.min.x).toBe(1000);
        expect(right?.bounds.max.x).toBe(1240);
        for (const side of [left, right]) {
            expect(side?.bounds.min.y).toBe(-240);
            expect(side?.bounds.max.y).toBe(940);
            expect(side?.collisionFilter.category).toBe(SIDE);
            expect(side?.collisionFilter.mask).toBe(0xffff);
        }
    });

    it('closes the page at its top', () => {
        expect(ceiling?.bounds.max.y).toBe(0);
        expect(ceiling?.bounds.min.y).toBe(-240);
        expect(ceiling?.bounds.min.x).toBe(-240);
        expect(ceiling?.bounds.max.x).toBe(1240);
        expect(ceiling?.collisionFilter.category).toBe(SIDE);
    });
});
