import { Body } from 'matter-js';
import { cigaretteBody } from './bodies';

// Lit and in his mouth, lying where it fell, or back in his mouth and not lit yet.
export type CigaretteState = 'lit' | 'lying' | 'unlit';

// Where the dropped cigarette lies, for the effects layer.
export interface CigaretteView {
    x: number;
    y: number;
    angle: number;
}

// From his mouth: how far in front of his centre, and how far above it.
const MOUTH = { ahead: 17, above: 2 };
// How much of his speed it keeps, and the jitter it is thrown with.
const KEEPS = 0.6;
const JITTER = 6;
const SPIN = 0.6;
const LIFT = { least: 3, spread: 3 };

// His cigarette: in his mouth until it falls, then a body of its own until he picks it up and
// lights it again. The world adds and removes the body this hands over.
export class Cigarette {
    // Lit in his mouth, until it falls.
    #lit = true;
    // Lying where it fell, until he picks it up.
    #body: Body | undefined;

    get state(): CigaretteState {
        return this.#body ? 'lying' : this.#lit ? 'lit' : 'unlit';
    }

    get body(): Body | undefined {
        return this.#body;
    }

    view(): CigaretteView | undefined {
        const body = this.#body;
        return (
            body && {
                x: body.position.x,
                y: body.position.y,
                angle: body.angle,
            }
        );
    }

    // Drops it from the mouth of `monkey`, who faces `facing`. Undefined if it is not lit.
    lose(monkey: Body, facing: 1 | -1, random: () => number): Body | undefined {
        if (!this.#lit) {
            return undefined;
        }
        const body = cigaretteBody({
            x: monkey.position.x + facing * MOUTH.ahead,
            y: monkey.position.y - MOUTH.above,
        });
        Body.setVelocity(body, {
            x: monkey.velocity.x * KEEPS + (random() - 0.5) * JITTER,
            y:
                Math.min(monkey.velocity.y * KEEPS, 0) -
                LIFT.least -
                random() * LIFT.spread,
        });
        Body.setAngularVelocity(body, (random() - 0.5) * SPIN);
        this.#body = body;
        this.#lit = false;
        return body;
    }

    // Picks it up: the body to remove, and the cigarette is in his mouth, not lit.
    take(): Body | undefined {
        const body = this.#body;
        this.#body = undefined;
        return body;
    }

    // Lights the one in his mouth, if it is waiting for it.
    light(): boolean {
        if (this.#lit || this.#body) {
            return false;
        }
        this.#lit = true;
        return true;
    }
}
