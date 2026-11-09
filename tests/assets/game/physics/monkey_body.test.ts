import { Body } from 'matter-js';
import { describe, expect, it } from 'vitest';
import { MonkeyBody } from '../../../../assets/game/physics/monkey_body';

// The body is stepped by hand: each test sets what the engine would have left in it, so that
// every threshold is tried on both sides, with no physics in between. The floor is at 700, and
// he stands on it at 300.
const FLOOR = 700;

const standing = (): MonkeyBody => new MonkeyBody(300, FLOOR);

// Somewhere in the air, moving as `velocity` says.
const lift = (monkey: MonkeyBody, vy: number, vx = 0): void => {
    Body.setPosition(monkey.body, { x: monkey.body.position.x, y: 300 });
    Body.setVelocity(monkey.body, { x: vx, y: vy });
};

const land = (monkey: MonkeyBody): void => {
    Body.setPosition(monkey.body, { x: monkey.body.position.x, y: 665 });
    Body.setVelocity(monkey.body, { x: 0, y: 0 });
};

describe('what the body says of itself', () => {
    it('is the body’s centre, a copy that does not move him', () => {
        const monkey = standing();
        const at = monkey.position;

        expect(at.x).toBeCloseTo(300);
        expect(at.y).toBeCloseTo(665);
        at.x = 0;
        expect(monkey.position.x).toBeCloseTo(300);
    });

    it('turns, moves and spins as the body does', () => {
        const monkey = standing();
        Body.setAngle(monkey.body, 0.3);
        Body.setVelocity(monkey.body, { x: 3, y: 4 });
        Body.setAngularVelocity(monkey.body, 0.07);

        expect(monkey.angle).toBeCloseTo(0.3);
        expect(monkey.speed).toBeCloseTo(5);
        expect(monkey.angularSpeed).toBeCloseTo(0.07);
    });

    it('stands on his feet on the floor, still', () => {
        const monkey = standing();

        expect(monkey.grounded).toBe(true);
        expect(monkey.destination).toBeUndefined();
        expect(monkey.heading).toBe(0);
        expect(monkey.blocked).toBe(false);
        expect(monkey.tumbling).toBe(false);
    });

    it('is not on his feet while he falls or rises, however near the floor', () => {
        const monkey = standing();

        Body.setVelocity(monkey.body, { x: 0, y: 0.5 });
        expect(monkey.grounded).toBe(true);
        Body.setVelocity(monkey.body, { x: 0, y: 1 });
        expect(monkey.grounded).toBe(false);
        Body.setVelocity(monkey.body, { x: 0, y: -1 });
        expect(monkey.grounded).toBe(false);
    });

    it('is on his feet at the floor when his soles are within 6 px of it, and not higher up when quick', () => {
        const monkey = standing();
        Body.setVelocity(monkey.body, { x: 3, y: 0 });

        // His soles are 35 px under his centre.
        Body.setPosition(monkey.body, { x: 300, y: 659 });
        expect(monkey.grounded).toBe(true);
        Body.setPosition(monkey.body, { x: 300, y: 658.9 });
        expect(monkey.grounded).toBe(false);
        Body.setPosition(monkey.body, { x: 300, y: 600 });
        expect(monkey.grounded).toBe(false);
    });

    it('is on his feet in the air only when the world says something holds him up', () => {
        const monkey = standing();
        lift(monkey, 0);
        expect(monkey.grounded).toBe(false);

        monkey.support(true);
        expect(monkey.grounded).toBe(true);

        monkey.support(false);
        expect(monkey.grounded).toBe(false);
    });
});

describe('walking', () => {
    it('sets his speed towards the goal, keeping what he falls at', () => {
        const right = standing();
        right.goTo(500, 3);
        Body.setVelocity(right.body, { x: 0, y: 0.5 });
        right.beforeStep(false);

        expect(right.body.velocity.x).toBe(3);
        expect(right.body.velocity.y).toBe(0.5);
        expect(right.heading).toBe(1);
        expect(right.destination).toBe(500);

        const left = standing();
        left.goTo(100, 6.5);
        left.beforeStep(false);

        expect(left.body.velocity.x).toBe(-6.5);
        expect(left.heading).toBe(-1);
    });

    it('does nothing without a goal', () => {
        const monkey = standing();
        Body.setVelocity(monkey.body, { x: 1, y: 0 });

        monkey.beforeStep(false);

        expect(monkey.body.velocity.x).toBe(1);
    });

    it('does not walk while the visitor holds him, nor in the air', () => {
        const held = standing();
        held.goTo(500, 3);
        Body.setAngle(held.body, 0.5);
        held.beforeStep(true);

        expect(held.body.velocity.x).toBe(0);
        expect(held.body.angle).toBeCloseTo(0.5);

        const flying = standing();
        flying.goTo(500, 3);
        lift(flying, 5);
        flying.beforeStep(false);

        expect(flying.body.velocity.x).toBe(0);
    });

    it('arrives within 10 px of the goal, stops there, and keeps falling if he was', () => {
        const near = standing();
        near.goTo(310, 3);
        Body.setVelocity(near.body, { x: 2, y: 0.5 });
        near.beforeStep(false);

        expect(near.destination).toBeUndefined();
        expect(near.heading).toBe(0);
        expect(near.body.velocity.x).toBe(0);
        expect(near.body.velocity.y).toBe(0.5);

        const nearLeft = standing();
        nearLeft.goTo(290, 3);
        nearLeft.beforeStep(false);
        expect(nearLeft.destination).toBeUndefined();

        const far = standing();
        far.goTo(310.5, 3);
        far.beforeStep(false);
        expect(far.destination).toBe(310.5);
        expect(far.body.velocity.x).toBe(3);

        const farLeft = standing();
        farLeft.goTo(289.5, 3);
        farLeft.beforeStep(false);
        expect(farLeft.destination).toBe(289.5);
    });

    it('heads left for a goal on the spot he stands on, which he is already at', () => {
        const monkey = standing();

        monkey.goTo(300, 3);

        expect(monkey.heading).toBe(-1);
    });

    it('heads the way of the goal, not the way he last went', () => {
        const monkey = standing();
        monkey.goTo(500, 3);
        expect(monkey.heading).toBe(1);

        monkey.goTo(100, 3);
        expect(monkey.heading).toBe(-1);
    });

    it('stops where he is when halted, whatever he was doing', () => {
        const monkey = standing();
        monkey.goTo(500, 3);
        monkey.beforeStep(false);
        Body.setVelocity(monkey.body, { x: 3, y: 0.5 });

        monkey.halt();

        expect(monkey.destination).toBeUndefined();
        expect(monkey.heading).toBe(0);
        expect(monkey.body.velocity.x).toBe(0);
        expect(monkey.body.velocity.y).toBe(0.5);
    });
});

describe('the walls closing on him', () => {
    const sideMask = (monkey: MonkeyBody): number =>
        (monkey.body.collisionFilter.mask ?? 0) & 2;

    it('only once they are wanted and he is inside, and they stay while they are wanted', () => {
        const monkey = standing();

        monkey.closeIn(true, false);
        expect(sideMask(monkey)).toBe(0);
        monkey.closeIn(false, true);
        expect(sideMask(monkey)).toBe(0);

        monkey.closeIn(true, true);
        expect(sideMask(monkey)).toBe(2);
        monkey.closeIn(true, false);
        expect(sideMask(monkey)).toBe(2);

        monkey.closeIn(false, true);
        expect(sideMask(monkey)).toBe(0);
    });

    it('leaves his filter alone when nothing changes', () => {
        const monkey = standing();
        const filter = monkey.body.collisionFilter;

        monkey.closeIn(false, true);
        expect(monkey.body.collisionFilter).toBe(filter);
        monkey.closeIn(true, true);
        const closed = monkey.body.collisionFilter;
        monkey.closeIn(true, true);

        expect(monkey.body.collisionFilter).toBe(closed);
    });

    it('go with the loose pieces’ passing: the mask follows both', () => {
        const monkey = standing();
        monkey.passThrough(true);
        monkey.closeIn(true, true);
        expect(monkey.body.collisionFilter.mask).toBe(1 | 2 | 4 | 32);

        monkey.passThrough(false);
        expect(monkey.body.collisionFilter.mask).toBe(1 | 2 | 4 | 32);
        monkey.rejoin(() => false);
        expect(monkey.body.collisionFilter.mask).toBe(1 | 2 | 4 | 8 | 32);

        monkey.closeIn(false, true);
        expect(monkey.body.collisionFilter.mask).toBe(1 | 4 | 8 | 32);
    });
});

describe('being put somewhere', () => {
    it('stands him upright and still at the point, with nothing left to walk to', () => {
        const monkey = standing();
        monkey.goTo(500, 3);
        Body.setAngle(monkey.body, 1);
        Body.setVelocity(monkey.body, { x: 5, y: 7 });
        Body.setAngularVelocity(monkey.body, 0.4);

        monkey.placeAt({ x: 120, y: 45 });

        expect(monkey.position).toEqual({ x: 120, y: 45 });
        expect(monkey.angle).toBe(0);
        expect(monkey.body.velocity).toEqual({ x: 0, y: 0 });
        expect(monkey.body.angularVelocity).toBe(0);
        expect(monkey.destination).toBeUndefined();
    });
});

// What he does when something is in the way: his step gets him nowhere, so after 22 of them in a
// row he hops, and after three hops that got him nowhere the way is blocked.
describe('being stuck', () => {
    // A step with no progress, since the body is not moved.
    const stuck = (monkey: MonkeyBody, steps: number): void => {
        for (let i = 0; i < steps; i++) {
            monkey.beforeStep(false);
        }
    };

    it('hops on the 23rd step that got him nowhere, still going on', () => {
        const monkey = standing();
        monkey.goTo(500, 3);

        stuck(monkey, 22);
        expect(monkey.body.velocity.y).toBe(0);

        stuck(monkey, 1);
        expect(monkey.body.velocity.y).toBe(-9);
        expect(monkey.body.velocity.x).toBe(3);
    });

    it('hops towards the goal on the left too', () => {
        const monkey = standing();
        monkey.goTo(100, 3);

        stuck(monkey, 23);

        expect(monkey.body.velocity).toEqual({ x: -3, y: -9 });
    });

    it('counts the next hop from zero again', () => {
        const monkey = standing();
        monkey.goTo(500, 3);
        stuck(monkey, 23);
        land(monkey);

        stuck(monkey, 22);
        expect(monkey.body.velocity.y).toBe(0);
        stuck(monkey, 1);
        expect(monkey.body.velocity.y).toBe(-9);
    });

    it('is blocked after three hops in a row, and not before', () => {
        const monkey = standing();
        monkey.goTo(500, 3);

        for (let hop = 1; hop <= 3; hop++) {
            expect(monkey.blocked).toBe(false);
            stuck(monkey, 23);
            land(monkey);
        }

        expect(monkey.blocked).toBe(true);
    });

    it('counts a step that moved him by half a pixel as progress, a smaller one as none', () => {
        const small = standing();
        small.goTo(500, 3);
        stuck(small, 22);
        Body.setPosition(small.body, { x: 300.49, y: 665 });
        stuck(small, 1);
        expect(small.body.velocity.y).toBe(-9);

        const half = standing();
        half.goTo(500, 3);
        stuck(half, 22);
        Body.setPosition(half.body, { x: 300.5, y: 665 });
        stuck(half, 1);
        expect(half.body.velocity.y).toBe(0);
        // Progress starts the count again.
        stuck(half, 22);
        expect(half.body.velocity.y).toBe(0);
        stuck(half, 1);
        expect(half.body.velocity.y).toBe(-9);
    });

    it('does not count a step back as progress, nor one past the goal’s side', () => {
        const right = standing();
        right.goTo(500, 3);
        stuck(right, 22);
        Body.setPosition(right.body, { x: 299, y: 665 });
        stuck(right, 1);
        expect(right.body.velocity.y).toBe(-9);

        const left = standing();
        left.goTo(100, 3);
        stuck(left, 22);
        Body.setPosition(left.body, { x: 301, y: 665 });
        stuck(left, 1);
        expect(left.body.velocity.y).toBe(-9);
    });

    it('counts a step towards the goal on the left as progress', () => {
        const monkey = standing();
        monkey.goTo(100, 3);
        stuck(monkey, 22);
        Body.setPosition(monkey.body, { x: 299.5, y: 665 });
        stuck(monkey, 1);

        expect(monkey.body.velocity.y).toBe(0);
    });

    it('counts only getting further than before as progress, so being pushed back and forth is none', () => {
        const monkey = standing();
        monkey.goTo(500, 3);
        Body.setPosition(monkey.body, { x: 310, y: 665 });
        stuck(monkey, 1);

        for (let i = 0; i < 11; i++) {
            Body.setPosition(monkey.body, { x: 306, y: 665 });
            stuck(monkey, 1);
            Body.setPosition(monkey.body, { x: 310, y: 665 });
            stuck(monkey, 1);
        }
        expect(monkey.body.velocity.y).toBe(0);
        Body.setPosition(monkey.body, { x: 306, y: 665 });
        stuck(monkey, 1);

        expect(monkey.body.velocity.y).toBe(-9);
    });

    it('starts again from where he is when pushed past the goal, which turns him round', () => {
        const monkey = standing();
        monkey.goTo(500, 3);
        stuck(monkey, 22);

        Body.setPosition(monkey.body, { x: 520, y: 665 });
        stuck(monkey, 1);
        expect(monkey.body.velocity.x).toBe(-3);
        stuck(monkey, 22);
        expect(monkey.body.velocity.y).toBe(0);
        stuck(monkey, 1);

        expect(monkey.body.velocity.y).toBe(-9);
    });

    it('forgets the hops that got him nowhere once he moves', () => {
        const monkey = standing();
        monkey.goTo(500, 3);
        for (let hop = 1; hop <= 2; hop++) {
            stuck(monkey, 23);
            land(monkey);
        }
        Body.setPosition(monkey.body, { x: 310, y: 665 });
        stuck(monkey, 1);
        for (let hop = 1; hop <= 2; hop++) {
            stuck(monkey, 23);
            land(monkey);
        }

        expect(monkey.blocked).toBe(false);
    });

    it('starts over with a new goal, or when halted', () => {
        const goal = standing();
        goal.goTo(500, 3);
        for (let hop = 1; hop <= 2; hop++) {
            stuck(goal, 23);
            land(goal);
        }
        stuck(goal, 10);
        goal.goTo(500, 3);
        stuck(goal, 22);
        expect(goal.body.velocity.y).toBe(0);
        stuck(goal, 1);
        land(goal);
        stuck(goal, 23);
        land(goal);
        expect(goal.blocked).toBe(false);

        const halted = standing();
        halted.goTo(500, 3);
        for (let hop = 1; hop <= 2; hop++) {
            stuck(halted, 23);
            land(halted);
        }
        stuck(halted, 10);
        halted.halt();
        halted.goTo(500, 3);
        halted.halt();
        halted.goTo(500, 3);
        stuck(halted, 22);
        expect(halted.body.velocity.y).toBe(0);
        stuck(halted, 1);
        land(halted);
        stuck(halted, 23);
        land(halted);
        expect(halted.blocked).toBe(false);
    });

    it('measures progress from where the goal was set', () => {
        const monkey = standing();
        Body.setPosition(monkey.body, { x: 400, y: 665 });
        monkey.goTo(600, 3);

        stuck(monkey, 22);
        expect(monkey.body.velocity.y).toBe(0);
        stuck(monkey, 1);
        expect(monkey.body.velocity.y).toBe(-9);
    });
});

describe('standing up', () => {
    it('straightens out quickly on his feet: the angle by a fifth and the spin by 3 tenths each step', () => {
        const monkey = standing();
        Body.setAngle(monkey.body, 0.5);
        Body.setAngularVelocity(monkey.body, 0.1);

        monkey.beforeStep(false);

        expect(monkey.body.angle).toBeCloseTo(0.4);
        expect(monkey.body.angularVelocity).toBeCloseTo(0.07);
    });

    it('straightens out slowly in the air, and keeps spinning', () => {
        const monkey = standing();
        lift(monkey, 5);
        Body.setAngle(monkey.body, 0.5);
        Body.setAngularVelocity(monkey.body, 0.1);

        monkey.beforeStep(false);

        expect(monkey.body.angle).toBeCloseTo(0.485);
        expect(monkey.body.angularVelocity).toBeCloseTo(0.1);
    });

    it('is left alone in the hand', () => {
        const monkey = standing();
        lift(monkey, 5);
        Body.setAngle(monkey.body, 0.5);

        monkey.beforeStep(true);

        expect(monkey.body.angle).toBeCloseTo(0.5);
    });
});

describe('landing', () => {
    const fall = (monkey: MonkeyBody, steps: number): void => {
        for (let i = 0; i < steps; i++) {
            lift(monkey, 2);
            expect(monkey.afterStep(false)).toBeUndefined();
        }
    };

    it('is noticed after 6 steps in the air, with the fastest he came down', () => {
        const monkey = standing();
        lift(monkey, -4);
        monkey.afterStep(false);
        for (const vy of [2, 9, 4, 3, 1]) {
            lift(monkey, vy);
            expect(monkey.afterStep(false)).toBeUndefined();
        }

        land(monkey);

        expect(monkey.afterStep(false)).toEqual({ speed: 9 });
    });

    it('is not a landing after 5 steps, a hop', () => {
        const monkey = standing();
        fall(monkey, 5);

        land(monkey);

        expect(monkey.afterStep(false)).toBeUndefined();
    });

    it('happens once, and counts again from the next fall', () => {
        const monkey = standing();
        fall(monkey, 6);
        land(monkey);
        expect(monkey.afterStep(false)).toEqual({ speed: 2 });
        expect(monkey.afterStep(false)).toBeUndefined();

        fall(monkey, 5);
        land(monkey);
        expect(monkey.afterStep(false)).toBeUndefined();
    });

    it('does not count a rise as a fall', () => {
        const monkey = standing();
        for (let i = 0; i < 6; i++) {
            lift(monkey, -3);
            monkey.afterStep(false);
        }

        land(monkey);

        expect(monkey.afterStep(false)).toEqual({ speed: 0 });
    });

    it('is not one when the visitor puts him down, and starts the count over', () => {
        const monkey = standing();
        fall(monkey, 6);

        land(monkey);
        expect(monkey.afterStep(true)).toBeUndefined();
        land(monkey);
        expect(monkey.afterStep(false)).toBeUndefined();
    });

    it('forgets a fall in the hand', () => {
        const monkey = standing();
        fall(monkey, 3);
        lift(monkey, 8);
        monkey.afterStep(true);
        fall(monkey, 3);

        land(monkey);

        expect(monkey.afterStep(false)).toBeUndefined();
    });
});

describe('tumbling', () => {
    it('starts when he flies faster than a hop, at 10 px per step', () => {
        const slow = standing();
        lift(slow, -9.99);
        slow.afterStep(false);
        expect(slow.tumbling).toBe(false);

        const fast = standing();
        lift(fast, -10);
        fast.afterStep(false);
        expect(fast.tumbling).toBe(true);
    });

    it('goes on while he is in the air, however slow', () => {
        const monkey = standing();
        lift(monkey, -12);
        monkey.afterStep(false);

        lift(monkey, -3);
        monkey.afterStep(false);

        expect(monkey.tumbling).toBe(true);
    });

    it('ends after 10 steps on his feet in a row', () => {
        const monkey = standing();
        lift(monkey, -12);
        monkey.afterStep(false);

        land(monkey);
        for (let i = 0; i < 9; i++) {
            monkey.afterStep(false);
            expect(monkey.tumbling).toBe(true);
        }
        monkey.afterStep(false);

        expect(monkey.tumbling).toBe(false);
    });

    it('counts the steps on his feet from the last time he left them', () => {
        const monkey = standing();
        lift(monkey, -12);
        monkey.afterStep(false);
        land(monkey);
        for (let i = 0; i < 9; i++) {
            monkey.afterStep(false);
        }
        lift(monkey, -3);
        monkey.afterStep(false);

        land(monkey);
        for (let i = 0; i < 9; i++) {
            monkey.afterStep(false);
        }

        expect(monkey.tumbling).toBe(true);
    });

    it('stays off while he walks on his feet', () => {
        const monkey = standing();
        Body.setVelocity(monkey.body, { x: 11, y: 0 });

        monkey.afterStep(false);

        expect(monkey.tumbling).toBe(false);
    });

    it('ends in the hand', () => {
        const monkey = standing();
        lift(monkey, -12);
        monkey.afterStep(false);

        monkey.afterStep(true);

        expect(monkey.tumbling).toBe(false);
    });
});

describe('passing through the loose pieces', () => {
    const LOOSE = 8;
    const mask = (monkey: MonkeyBody): number =>
        monkey.body.collisionFilter.mask ?? 0;

    it('collides with every kind of piece to begin with', () => {
        expect(mask(standing()) & LOOSE).toBe(LOOSE);
    });

    it('stops colliding with the loose pieces, and only with them, once told to', () => {
        const monkey = standing();

        monkey.passThrough(true);

        expect(mask(monkey)).toBe(1 | 4 | 32);
        expect(monkey.body.collisionFilter.category).toBe(16);
    });

    it('keeps passing while the loose pieces are in the way after he is told to stop', () => {
        const monkey = standing();
        monkey.passThrough(true);
        monkey.passThrough(false);

        monkey.rejoin(() => true);
        monkey.rejoin(() => true);

        expect(mask(monkey) & LOOSE).toBe(0);
    });

    it('collides again at the first step nothing is in the way', () => {
        const monkey = standing();
        monkey.passThrough(true);
        monkey.passThrough(false);
        monkey.rejoin(() => true);

        monkey.rejoin(() => false);

        expect(monkey.body.collisionFilter).toEqual(
            standing().body.collisionFilter,
        );
        // Done: nothing is looked at any more.
        monkey.rejoin(() => {
            throw new Error('Nothing was left to check.');
        });
    });

    it('does not look for loose pieces while he is still told to pass', () => {
        const monkey = standing();
        monkey.passThrough(true);

        monkey.rejoin(() => {
            throw new Error('He is still passing.');
        });

        expect(mask(monkey) & LOOSE).toBe(0);
    });

    it('does not look for loose pieces when he never passed', () => {
        const monkey = standing();

        monkey.passThrough(false);
        monkey.rejoin(() => {
            throw new Error('He never passed.');
        });

        expect(mask(monkey) & LOOSE).toBe(LOOSE);
    });

    it('goes on passing when told to again before he was clear', () => {
        const monkey = standing();
        monkey.passThrough(true);
        monkey.passThrough(false);

        monkey.passThrough(true);
        monkey.rejoin(() => {
            throw new Error('He is passing again.');
        });

        expect(mask(monkey) & LOOSE).toBe(0);
    });
});
