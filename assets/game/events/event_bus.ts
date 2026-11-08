// Where an event came from. The development director panel marks what it fires, so a rule such as
// "never counted, never sent over the network" has something to test.
export type Origin = 'game' | 'director';

export type Listener<Payload> = (payload: Payload, origin: Origin) => void;

// Hears every event: the ticker and the wake-up of the loop need no list of names.
export type AnyListener<Events extends object> = <
    Name extends keyof Events & string,
>(
    name: Name,
    payload: Events[Name],
    origin: Origin,
) => void;

// A plain typed emitter, not an EventTarget: the no-DOM project compiles everything the Brain imports.
// `Events` maps each event name to its payload. An interface, not a Record: an index signature
// would make any name valid.
export class EventBus<Events extends object> {
    // A Set, so the same listener twice on one event is one subscription.
    readonly #listeners = new Map<string, Set<Listener<never>>>();
    readonly #any = new Set<AnyListener<Events>>();

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

    // Returns the function that removes the subscription.
    onAny(listener: AnyListener<Events>): () => void {
        this.#any.add(listener);
        return () => {
            this.#any.delete(listener);
        };
    }

    // Delivers to the listeners subscribed now: one added or removed by a listener changes the next
    // emit, not this one. The listeners of that event come first, then those of everything. A
    // throwing listener does not stop the others; the errors are rethrown after.
    emit<Name extends keyof Events & string>(
        name: Name,
        payload: Events[Name],
        origin: Origin = 'game',
    ): void {
        const errors: unknown[] = [];
        const deliveries = [
            ...[...(this.#listeners.get(name) ?? [])].map(
                (listener) => (): void => {
                    (listener as Listener<Events[Name]>)(payload, origin);
                },
            ),
            ...[...this.#any].map((listener) => (): void => {
                listener(name, payload, origin);
            }),
        ];
        for (const deliver of deliveries) {
            try {
                deliver();
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
