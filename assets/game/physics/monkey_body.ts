import { Body } from 'matter-js';
import type { Point } from '../events/game_events';
import {
    MONKEY_HEIGHT,
    monkeyBody,
    monkeyFilter,
    monkeyPassingFilter,
} from './bodies';
import { isGrounded } from './rules';

// Within this of the goal he has arrived.
const ARRIVED = 10;
// A step that moves him less than this is no progress. After this many in a row he hops.
const NO_PROGRESS = 0.5;
const STUCK_STEPS = 22;
const HOP = -9;
// Hops in a row that got him nowhere: the way is blocked.
const MAX_HOPS = 3;
// In the air for this many steps before touching down counts as a fall.
const MIN_AIR_STEPS = 6;
// Sent flying faster than a hop, he tumbles until he has stood for this many steps.
const TUMBLE_SPEED = 10;
const SETTLE_STEPS = 10;

export interface Landing {
    // How fast he came down, in pixels per step.
    speed: number;
}

interface Goal {
    x: number;
    speed: number;
}

// The monkey's body: a rectangle that walks by velocity, hops when it is stuck against
// something, stands back up after a fall, and notices when it lands. The world steps it; the Motor
// only says where to go.
export class MonkeyBody {
    readonly body: Body;
    readonly #floor: number;
    #goal: Goal | undefined;
    // The way he is going, and the furthest he has got that way (x, or its opposite going left).
    #direction = 0;
    #reach = 0;
    #stuck = 0;
    #hops = 0;
    #airSteps = 0;
    #fall = 0;
    #standing = 0;
    #tumbling = false;
    #supported = false;
    // Passing through the loose pieces, or told to stop and waiting to be clear of them.
    #through: 'off' | 'on' | 'ending' = 'off';

    constructor(x: number, floor: number) {
        this.body = monkeyBody(x, floor);
        this.#floor = floor;
    }

    get position(): Point {
        return { x: this.body.position.x, y: this.body.position.y };
    }

    get angle(): number {
        return this.body.angle;
    }

    get speed(): number {
        return this.body.speed;
    }

    get angularSpeed(): number {
        return this.body.angularSpeed;
    }

    get grounded(): boolean {
        return isGrounded(
            this.body.velocity.y,
            this.body.position.y + MONKEY_HEIGHT / 2,
            this.#floor,
            this.#supported,
        );
    }

    // Where he is walking to, until he arrives or is told to stop.
    get destination(): number | undefined {
        return this.#goal?.x;
    }

    // -1 to the left, 1 to the right, 0 when he is not walking.
    get heading(): -1 | 0 | 1 {
        if (!this.#goal) {
            return 0;
        }
        return this.#goal.x > this.body.position.x ? 1 : -1;
    }

    // Sent flying, and not on his feet again yet.
    get tumbling(): boolean {
        return this.#tumbling;
    }

    // He hopped over and over without getting anywhere.
    get blocked(): boolean {
        return this.#hops >= MAX_HOPS;
    }

    // The world says whether a piece holds him up from under, after each step.
    support(on: boolean): void {
        this.#supported = on;
    }

    // On: the loose pieces stop colliding with him (the ground, the walls, the pinned pieces and
    // the bombs still do). Off: they collide again once `rejoin` finds him clear of them.
    passThrough(on: boolean): void {
        if (on) {
            this.#through = 'on';
            this.body.collisionFilter = monkeyPassingFilter();
        } else if (this.#through === 'on') {
            this.#through = 'ending';
        }
    }

    // Before the engine's step: gives the loose pieces their collisions back, unless he overlaps
    // one, which the solver would push out of him in a single step.
    rejoin(overlapsLoose: () => boolean): void {
        if (this.#through === 'ending' && !overlapsLoose()) {
            this.#through = 'off';
            this.body.collisionFilter = monkeyFilter();
        }
    }

    // Walks to `x` at `speed`, in pixels per step.
    goTo(x: number, speed: number): void {
        this.#goal = { x, speed };
        this.#direction = Math.sign(x - this.body.position.x);
        this.#reach = this.#direction * this.body.position.x;
        this.#stuck = 0;
        this.#hops = 0;
    }

    // Stops walking where he is.
    halt(): void {
        this.#goal = undefined;
        this.#stuck = 0;
        this.#hops = 0;
        Body.setVelocity(this.body, { x: 0, y: this.body.velocity.y });
    }

    // Before the engine's step. Held by the visitor he is the spring's to move.
    beforeStep(held: boolean): void {
        if (held) {
            return;
        }
        const grounded = this.grounded;
        // Upright on his feet again: quickly once they touch, slowly while he falls.
        if (grounded) {
            Body.setAngle(this.body, this.body.angle * 0.8);
            Body.setAngularVelocity(this.body, this.body.angularVelocity * 0.7);
        } else {
            Body.setAngle(this.body, this.body.angle * 0.97);
        }
        if (grounded && this.#goal) {
            this.#walk(this.#goal);
        }
    }

    // After it: the landing, if he just touched down from a fall.
    afterStep(held: boolean): Landing | undefined {
        const grounded = this.grounded;
        if (held) {
            this.#tumbling = false;
        } else if (grounded) {
            this.#standing++;
            this.#tumbling &&= this.#standing < SETTLE_STEPS;
        } else {
            this.#standing = 0;
            this.#tumbling ||= this.body.speed >= TUMBLE_SPEED;
        }
        if (held || grounded) {
            const landed =
                !held && this.#airSteps >= MIN_AIR_STEPS
                    ? { speed: this.#fall }
                    : undefined;
            this.#airSteps = 0;
            this.#fall = 0;
            return landed;
        }
        this.#airSteps++;
        this.#fall = Math.max(this.#fall, this.body.velocity.y);
        return undefined;
    }

    #walk(goal: Goal): void {
        const { x } = this.body.position;
        const distance = goal.x - x;
        if (Math.abs(distance) <= ARRIVED) {
            this.#goal = undefined;
            Body.setVelocity(this.body, { x: 0, y: this.body.velocity.y });
            return;
        }
        const direction = Math.sign(distance);
        Body.setVelocity(this.body, {
            x: direction * goal.speed,
            y: this.body.velocity.y,
        });
        const reach = direction * x;
        if (direction !== this.#direction) {
            // Pushed past the goal: a new way, which starts from here.
            this.#direction = direction;
            this.#reach = reach;
            this.#stuck = 0;
            this.#hops = 0;
        } else if (reach >= this.#reach + NO_PROGRESS) {
            // Only getting further than before is progress: against an obstacle he is pushed
            // back and forth by as much as he gains.
            this.#reach = reach;
            this.#stuck = 0;
            this.#hops = 0;
        } else if (++this.#stuck > STUCK_STEPS) {
            Body.setVelocity(this.body, {
                x: direction * goal.speed,
                y: HOP,
            });
            this.#stuck = 0;
            this.#hops++;
        }
    }
}
