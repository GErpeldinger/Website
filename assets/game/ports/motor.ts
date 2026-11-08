// What an actor's body is asked to do. Each actor defines its own requests (the monkey walks, the
// drone hovers); the Brain only needs to tell them apart and to wait for them.
export interface MotorRequest {
    readonly type: string;
}

// `failed` is a request the body could not carry out (a path blocked, a piece out of reach): the
// behaviour that asked decides what that means.
export type Outcome = 'done' | 'failed';

// The body does one thing at a time. An overlay (a reflex's flinch, a scared face) plays on top of
// it without stopping it.
export type Layer = 'body' | 'overlay';

export interface MotorTask {
    // Stops the request where it is. Harmless once it finished or was cancelled.
    cancel(): void;
}

// Implemented by `motor` (the monkey's, later the drone's) and by FakeMotor in tests. A method, not
// a property, so the Motor of one actor's requests stands in where requests are not told apart.
export interface Motor<Request extends MotorRequest = MotorRequest> {
    // `done` is called once, when the request ends, unless the task was cancelled first. A request
    // that never ends keeps the loop awake (the Brain stays busy): it must end, or be cancelled.
    // The Brain cancels the task it gets back if the request was cut while `perform` ran.
    perform(
        request: Request,
        done: (outcome: Outcome) => void,
        layer: Layer,
    ): MotorTask;
}
