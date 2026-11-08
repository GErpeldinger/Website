import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../../assets/game/events/event_bus';

interface Events {
    'item.freed': { id: number };
    'visitor.idle': undefined;
}

const bus = (): EventBus<Events> => new EventBus<Events>();

describe('delivery', () => {
    it('gives the payload to the listeners of that event only', () => {
        const events = bus();
        const freed = vi.fn();
        const idle = vi.fn();
        events.on('item.freed', freed);
        events.on('visitor.idle', idle);

        events.emit('item.freed', { id: 7 });

        expect(freed).toHaveBeenCalledExactlyOnceWith({ id: 7 }, 'game');
        expect(idle).not.toHaveBeenCalled();
    });

    it('delivers every emit, to every listener, in subscription order', () => {
        const events = bus();
        const order: string[] = [];
        events.on('visitor.idle', () => order.push('first'));
        events.on('visitor.idle', () => order.push('second'));

        events.emit('visitor.idle', undefined);
        events.emit('visitor.idle', undefined);

        expect(order).toEqual(['first', 'second', 'first', 'second']);
    });

    it('does nothing when nobody listens', () => {
        expect(() => {
            bus().emit('item.freed', { id: 1 });
        }).not.toThrow();
    });
});

describe('origin', () => {
    it('tells the listeners where an event came from, the game by default', () => {
        const events = bus();
        const listener = vi.fn();
        events.on('visitor.idle', listener);

        events.emit('visitor.idle', undefined);
        events.emit('visitor.idle', undefined, 'director');

        expect(listener).toHaveBeenNthCalledWith(1, undefined, 'game');
        expect(listener).toHaveBeenNthCalledWith(2, undefined, 'director');
    });
});

describe('listening to everything', () => {
    it('hears every event with its name, payload and origin, after the listeners of that event', () => {
        const events = bus();
        const heard: unknown[] = [];
        events.onAny((name, payload, origin) => {
            heard.push([name, payload, origin]);
        });
        events.on('item.freed', () => heard.push('specific'));

        events.emit('item.freed', { id: 3 });
        events.emit('visitor.idle', undefined, 'director');

        expect(heard).toEqual([
            'specific',
            ['item.freed', { id: 3 }, 'game'],
            ['visitor.idle', undefined, 'director'],
        ]);
    });

    it('stops hearing once unsubscribed, and twice is harmless', () => {
        const events = bus();
        const listener = vi.fn();
        const unsubscribe = events.onAny(listener);
        events.onAny(vi.fn());

        unsubscribe();
        unsubscribe();
        events.emit('visitor.idle', undefined);

        expect(listener).not.toHaveBeenCalled();
    });

    it('counts the same listener once', () => {
        const events = bus();
        const listener = vi.fn();
        events.onAny(listener);
        events.onAny(listener);

        events.emit('visitor.idle', undefined);

        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('does not stop the others when it throws', () => {
        const events = bus();
        const after = vi.fn();
        const error = new Error('boom');
        events.onAny(() => {
            throw error;
        });
        events.on('visitor.idle', after);

        expect(() => {
            events.emit('visitor.idle', undefined);
        }).toThrow(error);
        expect(after).toHaveBeenCalledTimes(1);
    });

    it('counts its errors with the specific listeners in the aggregate', () => {
        const events = bus();
        events.onAny(() => {
            throw new Error('any');
        });
        events.on('visitor.idle', () => {
            throw new Error('specific');
        });

        let thrown: unknown;
        try {
            events.emit('visitor.idle', undefined);
        } catch (error) {
            thrown = error;
        }

        expect((thrown as AggregateError).errors).toHaveLength(2);
    });
});

describe('typing', () => {
    it('rejects an unknown event name and a wrong payload at compile time', () => {
        // Never called: tsc is the test.
        const misuse = (events: EventBus<Events>): void => {
            // @ts-expect-error No such event.
            events.on('item.fred', vi.fn());
            // @ts-expect-error No such event.
            events.emit('item.fred', { id: 1 });
            // @ts-expect-error The payload of item.freed is an object with an id.
            events.emit('item.freed', 42);
        };

        expect(misuse).toBeTypeOf('function');
    });
});

describe('subscription', () => {
    it('stops delivering once unsubscribed', () => {
        const events = bus();
        const listener = vi.fn();
        const unsubscribe = events.on('visitor.idle', listener);

        unsubscribe();
        events.emit('visitor.idle', undefined);

        expect(listener).not.toHaveBeenCalled();
    });

    it('unsubscribes only its own listener, and twice is harmless', () => {
        const events = bus();
        const kept = vi.fn();
        const unsubscribe = events.on('visitor.idle', vi.fn());
        events.on('visitor.idle', kept);

        unsubscribe();
        unsubscribe();
        events.emit('visitor.idle', undefined);

        expect(kept).toHaveBeenCalledTimes(1);
    });

    it('keeps the listener on other events when it leaves one', () => {
        const events = bus();
        const listener = vi.fn();
        const unsubscribe = events.on('visitor.idle', listener);
        events.on('item.freed', listener);

        unsubscribe();
        events.emit('item.freed', { id: 1 });

        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('counts the same listener on the same event once', () => {
        const events = bus();
        const listener = vi.fn();
        events.on('visitor.idle', listener);
        const again = events.on('visitor.idle', listener);

        events.emit('visitor.idle', undefined);
        expect(listener).toHaveBeenCalledTimes(1);

        again();
        events.emit('visitor.idle', undefined);
        expect(listener).toHaveBeenCalledTimes(1);
    });
});

describe('an emit in progress', () => {
    it('does not call a listener added during it', () => {
        const events = bus();
        const added = vi.fn();
        events.on('visitor.idle', () => {
            events.on('visitor.idle', added);
        });

        events.emit('visitor.idle', undefined);
        expect(added).not.toHaveBeenCalled();

        events.emit('visitor.idle', undefined);
        expect(added).toHaveBeenCalledTimes(1);
    });

    it('still calls a listener removed during it', () => {
        const events = bus();
        const removed = vi.fn();
        let unsubscribe = (): void => {};
        events.on('visitor.idle', () => {
            unsubscribe();
        });
        unsubscribe = events.on('visitor.idle', removed);

        events.emit('visitor.idle', undefined);
        expect(removed).toHaveBeenCalledTimes(1);

        events.emit('visitor.idle', undefined);
        expect(removed).toHaveBeenCalledTimes(1);
    });

    it('delivers a nested emit completely before the outer one goes on', () => {
        const events = bus();
        const order: string[] = [];
        events.on('visitor.idle', () => {
            order.push('outer');
            events.emit('item.freed', { id: 1 });
        });
        events.on('visitor.idle', () => order.push('outer 2'));
        events.on('item.freed', () => order.push('inner'));

        events.emit('visitor.idle', undefined);

        expect(order).toEqual(['outer', 'inner', 'outer 2']);
    });
});

describe('a throwing listener', () => {
    it('does not stop the others, then rethrows its error itself', () => {
        const events = bus();
        const error = new Error('boom');
        const after = vi.fn();
        events.on('visitor.idle', () => {
            throw error;
        });
        events.on('visitor.idle', after);

        expect(() => {
            events.emit('visitor.idle', undefined);
        }).toThrow(error);
        expect(after).toHaveBeenCalledTimes(1);
    });

    it('rethrows an AggregateError of all the errors when several throw', () => {
        const events = bus();
        const first = new Error('first');
        const second = 'not an error object';
        events.on('visitor.idle', () => {
            throw first;
        });
        events.on('visitor.idle', () => {
            // eslint-disable-next-line @typescript-eslint/only-throw-error -- a listener can throw anything
            throw second;
        });
        events.on('visitor.idle', vi.fn());

        let thrown: unknown;
        try {
            events.emit('visitor.idle', undefined);
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeInstanceOf(AggregateError);
        const aggregate = thrown as AggregateError;
        expect(aggregate.errors).toEqual([first, second]);
        expect(aggregate.message).toBe('2 listeners of "visitor.idle" threw.');
    });
});
