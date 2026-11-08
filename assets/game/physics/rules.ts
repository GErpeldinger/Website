// The physics feel, from the prototype. Speeds are in pixels per 60 Hz step, Matter's own unit.

// A pinned piece struck by a body this fast comes loose. The monkey standing on one is no
// impact: only a hard fall knocks a piece off its place.
export const loosensPinned = (strikerSpeed: number): boolean =>
    strikerSpeed > 2.2;

// A collision this hard is worth an event (a reaction, a sound).
export const isHardHit = (relativeSpeed: number): boolean => relativeSpeed >= 7;

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
