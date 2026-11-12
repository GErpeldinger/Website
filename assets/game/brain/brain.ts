import type { ClockView } from '../clock/clock';
import type { EventBus } from '../events/event_bus';
import type { BehaviourKind, EndedBy, GameEvents } from '../events/game_events';
import type { Speaker } from '../lines/speaker';
import type {
    Layer,
    Motor,
    MotorRequest,
    MotorTask,
    Outcome,
} from '../ports/motor';
import {
    isWait,
    type Act,
    type Behaviour,
    type Context,
    type ContextSource,
    type Run,
    type Step,
    type Trigger,
    type TriggerName,
} from './behaviour';
import { choose } from './choose';

export interface BrainOptions<Request extends MotorRequest> {
    actor: string;
    // Every behaviour of this actor, and only these.
    behaviours: readonly Behaviour<Request>[];
    motor: Motor<Request>;
    events: EventBus<GameEvents>;
    clock: ClockView;
    random: () => number;
    // Read at each decision and merged, in order, into the context.
    sources?: readonly ContextSource[];
    // Only an actor with a voice has one; the others cannot say lines.
    speaker?: Speaker;
    // How long the body stays free, in ms of game time, before an ambient behaviour fills it.
    idleDelay?: number;
    // A behaviour that fails must not take the game down: it ends, and this hears why.
    // `source` is the id of the behaviour, or the actor's when it was not a behaviour's own.
    onError: (error: unknown, source: string) => void;
}

export interface BrainSnapshot {
    // The activity or ambient behaviour holding the body.
    body: string | undefined;
    // Reflexes and lines playing.
    overlays: string[];
    // Interrupted activities that will resume, the latest last.
    suspended: string[];
    // Activities waiting for the body, in order.
    waiting: string[];
}

interface Running<Request extends MotorRequest> {
    readonly behaviour: Behaviour<Request>;
    readonly generator: Run<Request>;
    readonly layer: Layer;
    // Names the step in flight: a Motor or timer answer for an older one is stale.
    step: symbol;
    // The step in flight, asked again if the activity is cut short and resumes.
    current: Step<Request> | undefined;
    stop: (() => void) | undefined;
    live: boolean;
    suspended: boolean;
    // True while the generator itself runs: it cannot be closed from inside.
    inside: boolean;
}

interface Waiting<Request extends MotorRequest> {
    readonly behaviour: Behaviour<Request>;
    readonly trigger: Trigger | undefined;
}

const KINDS: readonly BehaviourKind[] = [
    'reflex',
    'activity',
    'ambient',
    'line',
];

const assertNumber = (
    what: string,
    id: string,
    value: number,
    ok: (value: number) => boolean,
    expected: string,
): void => {
    if (!Number.isFinite(value) || !ok(value)) {
        throw new RangeError(
            `The ${what} of "${id}" must be ${expected}, got ${String(value)}.`,
        );
    }
};

// The mind of one actor: which of its behaviours runs, which waits and which gives way
// (docs/architecture.md, The behaviour engine). It knows its body only as a Motor and its
// voice only as a Speaker, and keeps time on the game clock.
export class Brain<Request extends MotorRequest = MotorRequest> {
    readonly #options: BrainOptions<Request>;
    readonly #behaviours: readonly Behaviour<Request>[];
    readonly #readyAt = new Map<string, number>();
    readonly #overlays = new Set<Running<Request>>();
    readonly #suspended: Running<Request>[] = [];
    readonly #waiting: Waiting<Request>[] = [];
    readonly #unsubscribe: (() => void)[] = [];
    #body: Running<Request> | undefined;
    #cancelIdle: (() => void) | undefined;
    #stopped = false;

    constructor(options: BrainOptions<Request>) {
        this.#options = options;
        this.#behaviours = options.behaviours;
        const ids = new Set<string>();
        for (const {
            id,
            actor,
            priority,
            weight,
            cooldown,
        } of options.behaviours) {
            if (actor !== options.actor) {
                throw new Error(
                    `The behaviour "${id}" belongs to the ${actor}, not to the ${options.actor}.`,
                );
            }
            if (ids.has(id)) {
                throw new Error(`Two behaviours are called "${id}".`);
            }
            ids.add(id);
            assertNumber('priority', id, priority, () => true, 'a number');
            assertNumber('weight', id, weight ?? 1, (n) => n > 0, 'above 0');
            assertNumber(
                'cooldown',
                id,
                cooldown ?? 0,
                (n) => n >= 0,
                'at least 0',
            );
        }
        const names = new Set<TriggerName>(
            options.behaviours.flatMap(({ triggers }) => triggers),
        );
        for (const name of names) {
            this.#unsubscribe.push(
                options.events.on(name, (payload) => {
                    this.#onEvent({ name, payload } as Trigger);
                }),
            );
        }
        this.#scheduleIdle();
    }

    // A waiting activity implies a body that holds it up.
    get busy(): boolean {
        return this.#body !== undefined || this.#overlays.size > 0;
    }

    snapshot(): BrainSnapshot {
        return {
            body: this.#body?.behaviour.id,
            overlays: [...this.#overlays].map(({ behaviour }) => behaviour.id),
            suspended: this.#suspended.map(({ behaviour }) => behaviour.id),
            waiting: this.#waiting.map(({ behaviour }) => behaviour.id),
        };
    }

    // Starts a behaviour on its own, whatever its canStart and its cooldown say, and by the
    // usual rules of priority: the director panel's way in. False when nothing started or queued.
    start(id: string): boolean {
        const behaviour = this.#behaviours.find(
            (candidate) => candidate.id === id,
        );
        return (
            !this.#stopped &&
            behaviour !== undefined &&
            !this.#isActive(behaviour) &&
            this.#offer(behaviour, undefined)
        );
    }

    // Ends everything and stops listening. The Brain is not meant to be used after.
    stop(): void {
        this.#stopped = true;
        for (const off of this.#unsubscribe) {
            off();
        }
        this.#cancelIdle?.();
        this.#waiting.length = 0;
        for (const run of this.#suspended.splice(0)) {
            this.#release(run);
        }
        for (const run of [this.#body, ...this.#overlays]) {
            if (run) {
                this.#close(run, 'stopped');
            }
        }
    }

    #onEvent(trigger: Trigger): void {
        if (this.#stopped) {
            return;
        }
        const context = this.#context(trigger);
        for (const kind of KINDS) {
            const picked = choose(
                this.#behaviours.filter(
                    (behaviour) =>
                        behaviour.kind === kind &&
                        behaviour.triggers.includes(trigger.name) &&
                        this.#canBegin(behaviour, context),
                ),
                this.#options.random,
            );
            if (picked) {
                this.#offer(picked, trigger);
            }
        }
    }

    // Not already there, off cooldown, and willing.
    #canBegin(behaviour: Behaviour<Request>, context: Context): boolean {
        return (
            !this.#isActive(behaviour) &&
            this.#options.clock.now() >=
                (this.#readyAt.get(behaviour.id) ?? 0) &&
            this.#canStart(behaviour, context)
        );
    }

    #canStart(behaviour: Behaviour<Request>, context: Context): boolean {
        try {
            return behaviour.canStart(context);
        } catch (error) {
            this.#options.onError(error, behaviour.id);
            return false;
        }
    }

    #isActive({ id }: Behaviour<Request>): boolean {
        return (
            [this.#body, ...this.#overlays, ...this.#suspended].some(
                (run) => run?.behaviour.id === id,
            ) || this.#waiting.some(({ behaviour }) => behaviour.id === id)
        );
    }

    // Applies the rules of the kinds. True when the behaviour started or was queued.
    #offer(
        behaviour: Behaviour<Request>,
        trigger: Trigger | undefined,
    ): boolean {
        const body = this.#body;
        switch (behaviour.kind) {
            case 'reflex':
            case 'line':
                this.#begin(behaviour, trigger);
                return true;
            case 'ambient':
                // It fills idle time only: whatever holds the body is more important, an ambient
                // behaviour of its own weight or more included.
                if (
                    body &&
                    (body.behaviour.kind !== 'ambient' ||
                        behaviour.priority <= body.behaviour.priority)
                ) {
                    return false;
                }
                if (body) {
                    this.#giveWay(body, false);
                }
                this.#begin(behaviour, trigger);
                return true;
            case 'activity':
                if (body && body.behaviour.kind !== 'ambient') {
                    if (behaviour.priority <= body.behaviour.priority) {
                        this.#waiting.push({ behaviour, trigger });
                        return true;
                    }
                    this.#giveWay(body, true);
                } else if (body) {
                    this.#giveWay(body, false);
                }
                this.#begin(behaviour, trigger);
                return true;
        }
    }

    // The body is taken from `run`: it is kept to resume only if it asks to and may.
    #giveWay(run: Running<Request>, mayResume: boolean): void {
        this.#body = undefined;
        if (mayResume && run.behaviour.resumes === true) {
            run.stop?.();
            run.stop = undefined;
            run.step = Symbol('step');
            run.suspended = true;
            this.#suspended.push(run);
            this.#emit('behaviour.ended', {
                ...this.#identity(run),
                by: 'interrupted',
            });
        } else {
            this.#close(run, 'interrupted');
        }
    }

    #begin(behaviour: Behaviour<Request>, trigger: Trigger | undefined): void {
        const context = this.#context(trigger);
        const isBody =
            behaviour.kind === 'activity' || behaviour.kind === 'ambient';
        this.#readyAt.set(
            behaviour.id,
            this.#options.clock.now() + (behaviour.cooldown ?? 0),
        );
        let generator: Run<Request>;
        try {
            generator = behaviour.run(context, this.#act(behaviour, trigger));
        } catch (error) {
            this.#options.onError(error, behaviour.id);
            if (isBody) {
                this.#next();
            }
            return;
        }
        const run: Running<Request> = {
            behaviour,
            generator,
            layer: isBody ? 'body' : 'overlay',
            step: Symbol('step'),
            current: undefined,
            stop: undefined,
            live: true,
            suspended: false,
            // Stryker disable next-line BooleanLiteral: a generator that has not started has nothing to clean up
            inside: false,
        };
        if (isBody) {
            this.#cancelIdle?.();
            this.#cancelIdle = undefined;
            this.#body = run;
        } else {
            this.#overlays.add(run);
        }
        this.#emit('behaviour.started', {
            ...this.#identity(run),
            resumed: false,
        });
        this.#proceed(run);
    }

    #resume(run: Running<Request>): void {
        run.suspended = false;
        this.#cancelIdle?.();
        this.#cancelIdle = undefined;
        this.#body = run;
        this.#emit('behaviour.started', {
            ...this.#identity(run),
            resumed: true,
        });
        this.#proceed(run);
    }

    // Goes on with a behaviour that was just started or resumed: from its first step, or by
    // asking again for the one that was cut short. A listener of the started event may already
    // have taken it over.
    #proceed(run: Running<Request>): void {
        if (!run.live || run.suspended) {
            return;
        }
        if (run.current === undefined) {
            this.#advance(run);
        } else {
            this.#perform(run, run.current);
        }
    }

    // Runs the generator to its next step. Any answer to the last one comes in `outcome`.
    #advance(run: Running<Request>, outcome: Outcome = 'done'): void {
        run.inside = true;
        let result: IteratorResult<Step<Request>, void>;
        try {
            result = run.generator.next(outcome);
        } catch (error) {
            if (run.suspended) {
                this.#drop(run);
            } else if (run.live) {
                this.#close(run, 'failed', error);
                return;
            }
            // Suspended, or ended or cut short while it ran: it already ended once, say nothing more.
            this.#options.onError(error, run.behaviour.id);
            return;
        } finally {
            run.inside = false;
        }
        if (!run.live) {
            // Ended or taken over while it ran: it could not be closed from inside.
            this.#release(run);
            return;
        }
        if (result.done === true) {
            if (run.suspended) {
                this.#drop(run);
            } else {
                this.#close(run, 'done');
            }
            return;
        }
        run.current = result.value;
        if (!run.suspended) {
            this.#perform(run, result.value);
        }
    }

    #perform(run: Running<Request>, step: Step<Request>): void {
        const token = Symbol('step');
        run.step = token;
        // An object: the compiler can't see the callback set it.
        const progress = { answered: false };
        const answer = (outcome: Outcome): void => {
            progress.answered = true;
            if (run.live && run.step === token) {
                run.stop = undefined;
                this.#advance(run, outcome);
            }
        };
        if (isWait(step)) {
            run.stop = this.#options.clock.after(step.ms, () => {
                answer('done');
            });
            return;
        }
        if (run.behaviour.kind === 'line') {
            this.#close(
                run,
                'failed',
                new Error(`The line "${run.behaviour.id}" can only wait.`),
            );
            return;
        }
        let task: MotorTask;
        try {
            task = this.#options.motor.perform(step, answer, run.layer);
        } catch (error) {
            this.#close(run, 'failed', error);
            return;
        }
        if (run.live && run.step === token) {
            run.stop = (): void => {
                task.cancel();
            };
        } else if (!progress.answered) {
            // The activity was cut while the Motor was starting the request (it emitted an event
            // that started a stronger one): nobody would cancel it any more.
            task.cancel();
        }
    }

    // A suspended activity that ended by itself, or failed: it already said it was interrupted.
    // Its generator is finished, so there is nothing to release.
    #drop(run: Running<Request>): void {
        const at = this.#suspended.indexOf(run);
        // Stryker disable next-line all: only suspended runs come here; the guard is defensive
        if (at >= 0) {
            this.#suspended.splice(at, 1);
        }
    }

    // The behaviour is over: `by` says how. If it held the body, the next one takes it.
    #close(run: Running<Request>, by: EndedBy, error?: unknown): void {
        run.live = false;
        run.stop?.();
        run.stop = undefined;
        this.#overlays.delete(run);
        const wasBody = this.#body === run;
        if (wasBody) {
            this.#body = undefined;
        }
        this.#release(run);
        if (error !== undefined) {
            this.#options.onError(error, run.behaviour.id);
        }
        this.#emit('behaviour.ended', { ...this.#identity(run), by });
        if (wasBody && !this.#stopped) {
            this.#next();
        }
    }

    // Lets the generator run its cleanup, unless it is running: it is released when it yields.
    // A cleanup that throws is reported, not raised.
    #release(run: Running<Request>): void {
        if (run.inside) {
            return;
        }
        try {
            run.generator.return();
        } catch (error) {
            this.#options.onError(error, run.behaviour.id);
        }
    }

    // The body is free: resume or start the most important of what was interrupted or waiting,
    // else wait for idle time.
    #next(): void {
        const options = [
            // Each one interrupted a weaker one: the stack's priorities only go up.
            ...this.#suspended.map((run) => ({
                priority: run.behaviour.priority,
                run,
            })),
            ...this.#waiting.map((waiting) => ({
                priority: waiting.behaviour.priority,
                waiting,
            })),
        ].sort((a, b) => b.priority - a.priority);
        for (const option of options) {
            if ('run' in option) {
                this.#suspended.splice(this.#suspended.indexOf(option.run), 1);
                this.#resume(option.run);
                return;
            }
            this.#waiting.splice(this.#waiting.indexOf(option.waiting), 1);
            const { behaviour, trigger } = option.waiting;
            if (this.#canStart(behaviour, this.#context(trigger))) {
                this.#begin(behaviour, trigger);
                return;
            }
        }
        this.#scheduleIdle();
    }

    #scheduleIdle(): void {
        this.#cancelIdle?.();
        this.#cancelIdle = this.#options.clock.after(
            this.#options.idleDelay ?? 5000,
            () => {
                this.#cancelIdle = undefined;
                this.#fillIdle();
            },
        );
    }

    #fillIdle(): void {
        const context = this.#context(undefined);
        const picked = choose(
            this.#behaviours.filter(
                (behaviour) =>
                    behaviour.kind === 'ambient' &&
                    this.#canBegin(behaviour, context),
            ),
            this.#options.random,
        );
        if (picked) {
            this.#begin(picked, undefined);
        } else {
            this.#scheduleIdle();
        }
    }

    #context(trigger: Trigger | undefined): Context {
        const fields = Object.assign(
            {},
            ...(this.#options.sources ?? []).map((source) => source()),
        ) as object;
        return {
            ...fields,
            actor: this.#options.actor,
            now: this.#options.clock.now(),
            trigger,
        };
    }

    #act(behaviour: Behaviour<Request>, trigger: Trigger | undefined): Act {
        const { actor, speaker } = this.#options;
        return {
            say: (key, params, options): boolean => {
                if (behaviour.lines?.includes(key) !== true) {
                    throw new Error(
                        `${behaviour.id} says "${key}" without declaring it in lines.`,
                    );
                }
                if (!speaker) {
                    throw new Error(`${actor} has no voice.`);
                }
                const text = speaker.say(key, params, options);
                if (text === undefined) {
                    return false;
                }
                this.#emit('line.said', { actor, key, text });
                return true;
            },
            context: () => this.#context(trigger),
        };
    }

    #identity(run: Running<Request>): {
        actor: string;
        id: string;
        kind: BehaviourKind;
    } {
        return {
            actor: this.#options.actor,
            id: run.behaviour.id,
            kind: run.behaviour.kind,
        };
    }

    // An event is the world's business: a listener that throws must not break the Brain.
    #emit<Name extends 'behaviour.started' | 'behaviour.ended' | 'line.said'>(
        name: Name,
        payload: GameEvents[Name],
    ): void {
        try {
            this.#options.events.emit(name, payload);
        } catch (error) {
            this.#options.onError(error, this.#options.actor);
        }
    }
}
