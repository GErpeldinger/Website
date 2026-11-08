export type Listener<Payload> = (payload: Payload) => void;

// A plain typed emitter, not an EventTarget: the no-DOM project compiles everything the Brain imports.
// `Events` maps each event name to its payload. An interface, not a Record: an index signature
// would make any name valid.
export class EventBus<Events extends object> {
    // A Set, so the same listener twice on one event is one subscription.
    readonly #listeners = new Map<string, Set<Listener<never>>>();

    // Returns the function that removes the subscription.
    on<Name extends keyof Events & string>(
        name: Name,
        listener: Listener<Events[Name]>,
    ): () => void {
        let listeners = this.#listeners.get(name);
        if (!listeners) {
            listeners = new Set();
            this.#listeners.set(name, listeners);
        }
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }

    // Delivers to the listeners subscribed now: one added or removed by a listener changes the next
    // emit, not this one. A throwing listener does not stop the others; the errors are rethrown after.
    emit<Name extends keyof Events & string>(
        name: Name,
        payload: Events[Name],
    ): void {
        const errors: unknown[] = [];
        for (const listener of [...(this.#listeners.get(name) ?? [])]) {
            try {
                (listener as Listener<Events[Name]>)(payload);
            } catch (error) {
                errors.push(error);
            }
        }
        if (errors.length === 0) {
            return;
        }
        throw errors.length === 1
            ? errors[0]
            : new AggregateError(
                  errors,
                  `${String(errors.length)} listeners of "${name}" threw.`,
              );
    }
}
