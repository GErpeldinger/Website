import type { BehaviourKind, GameEvents } from '../events/game_events';
import type { LineParams } from '../lines/format';
import type { SayOptions } from '../lines/speaker';
import type { MotorRequest, Outcome } from '../ports/motor';

export type Kind = BehaviourKind;

// The events a behaviour can be started by: every event on the bus.
export type TriggerName = Extract<keyof GameEvents, string>;

// The event that started a behaviour, narrowed by `name`.
export type Trigger = {
    [Name in TriggerName]: {
        readonly name: Name;
        readonly payload: GameEvents[Name];
    };
}[TriggerName];

// What the world says, by field. A source of context (the environment, the scene, the visitor, the
// time of day) adds its own fields here with a module augmentation, next to the function that
// reads them: `declare module '.../brain/behaviour' { interface ContextFields { ... } }`. The
// Brain never lists them, so a new field changes nothing in it.
export interface ContextFields {
    readonly reducedMotion: boolean;
}

// What `canStart` and `run` read. A field is absent when no source gives it (in a test, say), so a
// condition on one fails closed.
export type Context = Readonly<Partial<ContextFields>> & {
    readonly actor: string;
    // Game time, in ms.
    readonly now: number;
    // Absent for a behaviour started on its own: ambient time, the director panel.
    readonly trigger?: Trigger;
};

// Reads some fields of the world; the Brain merges the sources it was given at each decision.
export type ContextSource = () => Readonly<Partial<ContextFields>>;

// A pause inside `run`, kept by the Brain itself: no Motor has to know how to wait.
export interface Wait {
    readonly type: 'wait';
    readonly ms: number;
}

export const wait = (ms: number): Wait => ({ type: 'wait', ms });

// What `run` yields: a request for the actor's Motor, or a pause.
export type Step<Request extends MotorRequest = MotorRequest> = Request | Wait;

export const isWait = (step: Step): step is Wait => step.type === 'wait';

// What `run` can do besides asking the Motor.
export interface Act {
    // Says a line of a declared key; false when the speech cooldown held it back.
    say(key: string, params?: LineParams, options?: SayOptions): boolean;
    // The world now, with the trigger the behaviour started on: `run`'s own context is a snapshot.
    context(): Context;
}

// The steps of a behaviour. The generator yields each request and is given the outcome of the last.
export type Run<Request extends MotorRequest = MotorRequest> = Generator<
    Step<Request>,
    void,
    Outcome
>;

// What a behaviour file declares. Its id is its path (see the registry), so two cannot clash.
export interface BehaviourSpec<Request extends MotorRequest = MotorRequest> {
    readonly actor: string;
    readonly kind: Kind;
    // Higher wins. Between activities it decides who interrupts and who waits; among the
    // behaviours an event could start of one kind, only the highest priority is considered.
    readonly priority: number;
    // The events that can start it. Empty for a behaviour only started on its own.
    readonly triggers: readonly TriggerName[];
    // Among the behaviours of equal priority that an event could start, the odds of this one
    // against the others' (1 by default): that is how variants of one behaviour are written.
    readonly weight?: number;
    // Game time, in ms, before it can start again.
    readonly cooldown?: number;
    // An activity cut short by a stronger one picks up where it was once that one ends, instead
    // of being dropped. The request it was in is asked again.
    readonly resumes?: boolean;
    // Every line key `run` may say: a test checks them against the catalogues.
    readonly lines?: readonly string[];
    canStart(context: Context): boolean;
    run(context: Context, act: Act): Run<Request>;
}

export interface Behaviour<
    Request extends MotorRequest = MotorRequest,
> extends BehaviourSpec<Request> {
    readonly id: string;
}

// The default export of a behaviour file. It only gives the types a place to meet.
export const defineBehaviour = <Request extends MotorRequest = MotorRequest>(
    spec: BehaviourSpec<Request>,
): BehaviourSpec<Request> => spec;
