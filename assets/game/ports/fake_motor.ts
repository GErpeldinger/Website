import type { ClockView } from '../clock/clock';
import type { Layer, Motor, MotorRequest, MotorTask, Outcome } from './motor';

export interface FakeMotorOptions {
    // With a clock, each request finishes after `duration` ms of game time by itself.
    clock?: ClockView;
    duration?: number;
    // Each request finishes inside `perform`.
    instant?: boolean;
}

interface Pending {
    request: MotorRequest;
    layer: Layer;
    done: (outcome: Outcome) => void;
    stop: () => void;
}

// A Motor that moves nothing. A test scripts it request by request (`finish`) to run a behaviour
// as a sequence; in development it gives an actor whose real Motor is not built a body that
// takes a moment, so the director panel can exercise its Brain.
export class FakeMotor implements Motor {
    readonly requests: MotorRequest[] = [];
    readonly layers: Layer[] = [];
    readonly cancelled: MotorRequest[] = [];
    readonly #pending: Pending[] = [];
    readonly #options: FakeMotorOptions;

    constructor(options: FakeMotorOptions = {}) {
        this.#options = options;
    }

    get pending(): MotorRequest[] {
        return this.#pending.map(({ request }) => request);
    }

    perform(
        request: MotorRequest,
        done: (outcome: Outcome) => void,
        layer: Layer,
    ): MotorTask {
        this.requests.push(request);
        this.layers.push(layer);
        const { clock, duration = 400, instant = false } = this.#options;
        const entry: Pending = { request, layer, done, stop: () => undefined };
        if (instant) {
            done('done');
            return { cancel: () => undefined };
        }
        this.#pending.push(entry);
        if (clock) {
            entry.stop = clock.after(duration, () => {
                this.#finish(entry, 'done');
            });
        }
        return {
            cancel: (): void => {
                if (this.#pending.includes(entry)) {
                    this.#pending.splice(this.#pending.indexOf(entry), 1);
                    entry.stop();
                    this.cancelled.push(request);
                }
            },
        };
    }

    // Ends the oldest pending request, of one layer or any.
    finish(outcome: Outcome = 'done', layer?: Layer): void {
        const entry = this.#pending.find(
            (candidate) => layer === undefined || candidate.layer === layer,
        );
        if (!entry) {
            throw new Error(
                `No pending request${layer === undefined ? '' : ` on the ${layer} layer`}.`,
            );
        }
        this.#finish(entry, outcome);
    }

    #finish(entry: Pending, outcome: Outcome): void {
        this.#pending.splice(this.#pending.indexOf(entry), 1);
        entry.stop();
        entry.done(outcome);
    }
}
