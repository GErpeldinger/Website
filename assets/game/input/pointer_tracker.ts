import type { Point } from '../events/game_events';
import { STEP } from '../physics/world';

// How far back the pointer's motion is measured, in ms.
const WINDOW = 100;

interface Sample {
    point: Point;
    time: number;
}

// Turns pointer positions into the velocity a thrown piece leaves with.
export class PointerTracker {
    #samples: Sample[] = [];

    add(point: Point, time: number): void {
        this.#samples.push({ point, time });
        this.#samples = this.#samples.filter(
            (sample) => time - sample.time <= WINDOW,
        );
    }

    reset(): void {
        this.#samples = [];
    }

    // In pixels per step. A pointer that rested before the release throws nothing.
    velocity(now: number): Point {
        const first = this.#samples[0];
        const last = this.#samples.at(-1);
        if (!first || !last || now - last.time > WINDOW) {
            return { x: 0, y: 0 };
        }
        const elapsed = last.time - first.time;
        if (elapsed === 0) {
            return { x: 0, y: 0 };
        }
        const scale = STEP / elapsed;
        return {
            x: (last.point.x - first.point.x) * scale,
            y: (last.point.y - first.point.y) * scale,
        };
    }
}
