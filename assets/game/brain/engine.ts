import type { ClockView } from '../clock/clock';
import type { EventBus } from '../events/event_bus';
import type { GameEvents } from '../events/game_events';
import { Speaker, type LineBook } from '../lines/speaker';
import type { Motor, MotorRequest } from '../ports/motor';
import type { Behaviour, ContextSource } from './behaviour';
import { Brain } from './brain';

export interface EngineOptions {
    events: EventBus<GameEvents>;
    clock: ClockView;
    random: () => number;
    // Every registered behaviour, of every actor.
    behaviours: readonly Behaviour[];
    // The lines of the page's language, for the actors that speak.
    lines: LineBook;
    sources?: readonly ContextSource[];
    idleDelay?: number;
    onError: (error: unknown, source: string) => void;
}

export interface AttachOptions {
    // Gives the actor a voice of its own, with its own cooldown. Only the monkey has one.
    speaks?: boolean;
}

// The actors of the game, each with its own Brain and its own behaviours. An actor takes part
// once it has a body: whoever builds the Motor attaches it, and the Brain starts listening.
export class Engine {
    readonly clock: ClockView;
    readonly #options: EngineOptions;
    readonly #brains = new Map<string, Brain>();

    constructor(options: EngineOptions) {
        this.#options = options;
        this.clock = options.clock;
    }

    // The actors that have behaviours, in the order the registry lists them.
    actors(): string[] {
        return [...new Set(this.#options.behaviours.map(({ actor }) => actor))];
    }

    behaviours(actor: string): readonly Behaviour[] {
        return this.#options.behaviours.filter(
            (behaviour) => behaviour.actor === actor,
        );
    }

    // The Brain of an actor that has a body, once attached.
    brain(actor: string): Brain | undefined {
        return this.#brains.get(actor);
    }

    // True while any Brain runs, plays or has something waiting: the loop must go on.
    get busy(): boolean {
        return [...this.#brains.values()].some(({ busy }) => busy);
    }

    attach<Request extends MotorRequest>(
        actor: string,
        motor: Motor<Request>,
        { speaks = false }: AttachOptions = {},
    ): Brain {
        if (this.#brains.has(actor)) {
            throw new Error(`The ${actor} already has a body.`);
        }
        const { lines, clock } = this.#options;
        const brain = new Brain({
            ...this.#options,
            actor,
            // The behaviours are typed by their own file: the Motor of an actor is the one its
            // behaviours were written for, which no glob can check.
            behaviours: this.behaviours(actor) as Behaviour<Request>[],
            motor,
            speaker: speaks ? new Speaker({ book: lines, clock }) : undefined,
        });
        this.#brains.set(actor, brain);
        return brain;
    }

    stop(): void {
        for (const brain of this.#brains.values()) {
            brain.stop();
        }
        this.#brains.clear();
    }
}
