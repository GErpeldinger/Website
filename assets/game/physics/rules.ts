import type { ExitSide, Point } from '../events/game_events';
import { MONKEY_HEIGHT, MONKEY_WIDTH } from './bodies';

// The physics feel, from the prototype. Speeds are in pixels per 60 Hz step, Matter's own unit.

// How long, in ms of game time, the monkey stays out of the page before he is said to have left.
export const LEFT_AFTER = 1500;

// The side the monkey is out of the page by, or undefined while any of him is inside: one set
// down on the edge is no exit. A side wins over the top, as he falls past the end of the floor.
export const exitSide = (
    { x, y }: Point,
    width: number,
): ExitSide | undefined =>
    x < -MONKEY_WIDTH / 2
        ? 'left'
        : x > width + MONKEY_WIDTH / 2
          ? 'right'
          : y < -MONKEY_HEIGHT / 2
            ? 'top'
            : undefined;

// A pinned piece struck by a body this fast comes loose. The monkey standing on one is no
// impact: only a hard fall (9 px per step) knocks a piece off its place, a loose body 2.2.
export const loosensPinned = (
    strikerSpeed: number,
    byMonkey: boolean,
): boolean => strikerSpeed > (byMonkey ? 9 : 2.2);

// A collision this hard is worth an event (a reaction, a sound).
export const isHardHit = (relativeSpeed: number): boolean => relativeSpeed >= 7;

// A hit on the monkey is worth an event from the same speed; the floor or a pinned piece, which
// he falls onto, only from a hard fall.
export const hurtsMonkey = (
    relativeSpeed: number,
    againstSolid: boolean,
): boolean => (againstSolid ? relativeSpeed >= 10 : isHardHit(relativeSpeed));

// On his feet: not falling or rising, and either his soles are within 6 px of the floor or
// something holds him up from under (a piece), which the world says.
export const isGrounded = (
    velocityY: number,
    soles: number,
    floor: number,
    supported: boolean,
): boolean => Math.abs(velocityY) < 0.8 && (soles >= floor - 6 || supported);

// A contact holds him up when it pushes mostly upward (the contact normal is steeper than 45
// degrees) and the other body is below his centre: a piece he stands on, not one he bumps his
// head on or leans against.
export const holdsUp = (
    normalY: number,
    otherY: number,
    monkeyY: number,
): boolean => Math.abs(normalY) > 0.7 && otherY > monkeyY;

// Let go at this speed, a piece was thrown rather than put down.
export const isThrow = (releaseSpeed: number): boolean => releaseSpeed >= 4;

// Below both limits a body counts as still. Resting on the floor leaves a tiny jitter.
export const isCalm = (speed: number, angularSpeed: number): boolean =>
    speed < 0.2 && angularSpeed < 0.02;

// Counts the steps in a row where nothing moved. A body at the top of a throw is still for one
// step only, so the world counts as at rest after a run of them.
export class Stillness {
    readonly #required: number;
    #calmSteps: number;

    // Starts satisfied: a page nobody touched needs no frame.
    constructor(required: number) {
        this.#required = required;
        this.#calmSteps = required;
    }

    get holds(): boolean {
        return this.#calmSteps >= this.#required;
    }

    observe(calm: boolean): void {
        this.#calmSteps = calm ? this.#calmSteps + 1 : 0;
    }

    // A body was moved outside a step: wait for it to settle.
    disturb(): void {
        this.#calmSteps = 0;
    }
}

// A bomb reaches 30% of the page width, within 220 and 340 px.
export const blastRadius = (pageWidth: number): number =>
    Math.max(220, Math.min(340, pageWidth * 0.3));
