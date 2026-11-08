import { Body } from 'matter-js';
import { limitSpeed } from './motion';

// How far each side of its axis the vortex reaches, at any height.
const RADIUS = 270;
// It never leaves the page: its axis stays this far from each side.
const MARGIN = 70;

// The tornado's air: a column that sways, follows the pointer slowly and sweeps bodies up.
export class Vortex {
    readonly #width: number;
    #phase = 0;
    x: number;

    constructor(x: number, pageWidth: number) {
        this.x = x;
        this.#width = pageWidth;
    }

    // One physics step. `aim` is where the visitor's pointer is, if it was seen.
    step(aim: number | undefined): void {
        this.#phase += 0.16;
        const target = aim ?? this.x;
        const moved =
            this.x +
            (target - this.x) * 0.018 +
            Math.sin(this.#phase * 0.35) * 1.4;
        this.x = Math.max(MARGIN, Math.min(this.#width - MARGIN, moved));
    }

    reaches(body: Body): boolean {
        return Math.abs(body.position.x - this.x) <= RADIUS;
    }

    // Only for a body that `reaches`: the closer to the axis, the harder it is drawn in and lifted.
    pull(body: Body): void {
        const dx = body.position.x - this.x;
        const n = 1 - Math.abs(dx) / RADIUS;
        const direction = dx > 0 ? 1 : -1;
        const swirl = Math.sin(this.#phase + body.position.y * 0.012);
        Body.setVelocity(body, {
            x: body.velocity.x - direction * n * 0.65 + swirl * n * 2.5,
            y: body.velocity.y - (1.25 + n),
        });
        Body.setAngularVelocity(body, body.angularVelocity + n * 0.012);
        limitSpeed(body, 24);
    }
}
