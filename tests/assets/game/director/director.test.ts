import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    wait,
    type Behaviour,
    type Run,
} from '../../../../assets/game/brain/behaviour';
import { Engine } from '../../../../assets/game/brain/engine';
import { Clock } from '../../../../assets/game/clock/clock';
import { mountDirector } from '../../../../assets/game/director/director';
import {
    eventSamples,
    requestSamples,
} from '../../../../assets/game/director/samples';
import { EventBus } from '../../../../assets/game/events/event_bus';
import type { GameEvents } from '../../../../assets/game/events/game_events';
import { FakeMotor } from '../../../../assets/game/ports/fake_motor';
import { select } from '../dom';

const flee: Behaviour = {
    id: 'monkey/flee',
    actor: 'monkey',
    kind: 'activity',
    priority: 5,
    triggers: ['bomb.placed'],
    canStart: () => true,
    *run(): Run {
        yield wait(1000);
    },
};

const flinch: Behaviour = {
    id: 'monkey/flinch',
    actor: 'monkey',
    kind: 'reflex',
    priority: 1,
    triggers: [],
    canStart: () => true,
    *run(): Run {
        yield wait(100);
    },
};

const hover: Behaviour = {
    id: 'drone/hover',
    actor: 'drone',
    kind: 'ambient',
    priority: 0,
    triggers: [],
    lines: ['hum'],
    canStart: () => true,
    *run(_, act): Run {
        act.say('hum');
        yield wait(100);
    },
};

const setup = (
    behaviours: Behaviour[] = [flee, flinch, hover],
): {
    game: { events: EventBus<GameEvents>; engine: Engine };
    clock: Clock;
    unmount: () => void;
} => {
    const events = new EventBus<GameEvents>();
    const clock = new Clock({ maxStep: 100_000 });
    const engine = new Engine({
        events,
        clock,
        random: (): number => 0,
        lines: { locale: 'en', pools: { hum: ['Bzzz'] } },
        behaviours,
        onError: (error): void => {
            throw error as Error;
        },
    });
    const game = { events, engine };
    return { game, clock, unmount: mountDirector(game) };
};

const panel = (): HTMLElement => select('[data-director]');
const form = (): HTMLFormElement => select('form') as HTMLFormElement;
const eventField = (): HTMLSelectElement =>
    select('select[name="event"]') as HTMLSelectElement;
const payloadField = (): HTMLTextAreaElement =>
    select('textarea[name="payload"]') as HTMLTextAreaElement;
const error = (): HTMLElement => select('[data-error]');
const ticker = (): string[] =>
    [...document.querySelectorAll('[data-ticker] li')].map(
        (item) => item.textContent,
    );
const current = (actor: string): string =>
    select(`[data-actor="${actor}"] [data-current]`).textContent;

const fire = (name: string, payload: string): void => {
    eventField().value = name;
    eventField().dispatchEvent(new Event('change'));
    payloadField().value = payload;
    form().dispatchEvent(new Event('submit', { cancelable: true }));
};

afterEach(() => {
    document.body.innerHTML = '';
});

describe('mounting', () => {
    it('adds the panel to the page, and removes it when told to', () => {
        const { unmount } = setup();

        expect(document.body.contains(panel())).toBe(true);
        expect(document.querySelectorAll('[data-director]')).toHaveLength(1);

        unmount();

        expect(document.querySelector('[data-director]')).toBeNull();
    });

    it('goes into the element it is given', () => {
        const host = document.createElement('div');
        document.body.append(host);
        const events = new EventBus<GameEvents>();
        const engine = new Engine({
            events,
            clock: new Clock(),
            random: (): number => 0,
            lines: { locale: 'en', pools: {} },
            behaviours: [],
            onError: (): void => undefined,
        });

        mountDirector({ events, engine }, host);

        expect(host.querySelector('[data-director]')).not.toBeNull();
    });

    it('stops listening once removed', () => {
        const { game, unmount } = setup();
        unmount();

        game.events.emit('gravity.changed', { zero: true });

        expect(document.body.textContent).toBe('');
    });

    it('is labelled as a development tool', () => {
        setup();

        expect(panel().getAttribute('aria-label')).toBe(
            'Director panel (development only)',
        );
    });
});

describe('the actors', () => {
    it('lists each actor with a button to start each of its behaviours', () => {
        setup();

        const actors = [...document.querySelectorAll('[data-actor]')].map(
            (actor) => actor.getAttribute('data-actor'),
        );
        const buttons = [...document.querySelectorAll('button[data-start]')];

        expect(actors).toEqual(['monkey', 'drone']);
        expect(
            buttons.map((button) => button.getAttribute('data-start')),
        ).toEqual(['monkey/flee', 'monkey/flinch', 'drone/hover']);
        expect(buttons.map((button) => button.textContent)).toEqual([
            'flee (activity, 5)',
            'flinch (reflex, 1)',
            'hover (ambient, 0)',
        ]);
    });

    it('gives a body to an actor that has none, and keeps the one it has', () => {
        const events = new EventBus<GameEvents>();
        const engine = new Engine({
            events,
            clock: new Clock(),
            random: (): number => 0,
            lines: { locale: 'en', pools: {} },
            behaviours: [flee, hover],
            onError: (): void => undefined,
        });
        const motor = new FakeMotor();
        const own = engine.attach('monkey', motor);

        mountDirector({ events, engine });

        expect(engine.brain('monkey')).toBe(own);
        expect(engine.brain('drone')).toBeDefined();
    });

    it('starts a behaviour on its button, and shows what each actor is doing', () => {
        const { clock } = setup();
        expect(current('monkey')).toBe('idle');
        expect(current('drone')).toBe('idle');

        select('button[data-start="monkey/flee"]').click();
        expect(current('monkey')).toBe('monkey/flee');
        expect(current('drone')).toBe('idle');

        select('button[data-start="monkey/flinch"]').click();
        expect(current('monkey')).toBe('monkey/flee · overlay: monkey/flinch');

        clock.tick(100_000);
        expect(current('monkey')).toBe('idle');
    });

    it('shows the activities that wait', () => {
        setup([flee, { ...flee, id: 'monkey/hide', priority: 1 }]);

        select('button[data-start="monkey/flee"]').click();
        select('button[data-start="monkey/hide"]').click();

        expect(current('monkey')).toBe('monkey/flee · waiting: monkey/hide');
    });

    it('shows the activities that were interrupted', () => {
        setup([
            { ...flee, resumes: true, priority: 1 },
            { ...flee, id: 'monkey/hide', priority: 9 },
        ]);

        select('button[data-start="monkey/flee"]').click();
        select('button[data-start="monkey/hide"]').click();

        expect(current('monkey')).toBe('monkey/hide · suspended: monkey/flee');
    });

    it('says when a behaviour did not start', () => {
        setup();
        select('button[data-start="monkey/flee"]').click();
        expect(error().hidden).toBe(true);

        select('button[data-start="monkey/flee"]').click();

        expect(error().hidden).toBe(false);
        expect(error().textContent).toBe('monkey/flee did not start.');
    });

    it('lets the actors say their lines, whatever the actor', () => {
        const { game } = setup();
        const said = vi.fn();
        game.events.on('line.said', said);

        select('button[data-start="drone/hover"]').click();

        expect(said).toHaveBeenCalledExactlyOnceWith(
            { actor: 'drone', key: 'hum', text: 'Bzzz' },
            'game',
        );
    });
});

describe('the event form', () => {
    it('offers every event of the bus, starting with a payload for the first', () => {
        setup();

        const names = [...eventField().options].map((option) => option.value);

        expect(names).toEqual(Object.keys(eventSamples));
        expect(eventField().value).toBe(names[0]);
        expect(JSON.parse(payloadField().value)).toEqual(
            eventSamples[names[0] as keyof GameEvents],
        );
    });

    it('fills the payload with a sample when the event changes, an empty one for no payload', () => {
        setup();

        eventField().value = 'bomb.placed';
        eventField().dispatchEvent(new Event('change'));
        expect(payloadField().value).toBe(
            JSON.stringify(eventSamples['bomb.placed'], null, 2),
        );

        eventField().value = 'tornado.ended';
        eventField().dispatchEvent(new Event('change'));
        expect(payloadField().value).toBe('');
    });

    it('fires the event on the bus, marked as the director’s', () => {
        const { game } = setup();
        const heard = vi.fn();
        game.events.on('item.thrown', heard);

        fire('item.thrown', '{"id": 3, "kind": "link", "speed": 20}');

        expect(heard).toHaveBeenCalledExactlyOnceWith(
            { id: 3, kind: 'link', speed: 20 },
            'director',
        );
        expect(error().hidden).toBe(true);
    });

    it('fires an event with no payload when the field is empty', () => {
        const { game } = setup();
        const heard = vi.fn();
        game.events.on('tornado.ended', heard);

        fire('tornado.ended', '   ');

        expect(heard).toHaveBeenCalledExactlyOnceWith(undefined, 'director');
    });

    it('does not submit the page', () => {
        setup();
        eventField().value = 'tornado.ended';
        const submit = new Event('submit', { cancelable: true });

        form().dispatchEvent(submit);

        expect(submit.defaultPrevented).toBe(true);
    });

    it('starts the behaviours the event can trigger, as if it were real', () => {
        setup();

        fire('bomb.placed', '{"id": 1, "at": {"x": 1, "y": 2}}');

        expect(current('monkey')).toBe('monkey/flee');
    });

    it('says when the payload is not JSON, and fires nothing', () => {
        const { game } = setup();
        const heard = vi.fn();
        game.events.on('item.thrown', heard);

        fire('item.thrown', '{"id": ');

        expect(error().hidden).toBe(false);
        expect(error().textContent).toMatch(/^Invalid JSON: /u);
        expect(heard).not.toHaveBeenCalled();
    });

    it('says when a listener of the event throws', () => {
        const { game } = setup();
        game.events.on('gravity.changed', () => {
            throw new Error('a listener broke');
        });

        fire('gravity.changed', '{"zero": true}');

        expect(error().textContent).toBe('Error: a listener broke');
    });

    it('hides the message again on the next success', () => {
        setup();
        fire('item.thrown', '{');
        expect(error().hidden).toBe(false);

        fire('gravity.changed', '{"zero": true}');

        expect(error().hidden).toBe(true);
        expect(error().textContent).toBe('');
    });
});

describe('the ticker', () => {
    it('lists the events as they happen, the latest first, with their time', () => {
        const { game, clock } = setup();
        game.events.emit('gravity.changed', { zero: true });
        clock.tick(1500);
        game.events.emit('tornado.ended', undefined);

        expect(ticker().slice(0, 2)).toEqual([
            '1.5s tornado.ended',
            '0.0s gravity.changed {"zero":true}',
        ]);
    });

    it('marks what the director fired', () => {
        const { game } = setup();
        game.events.emit('gravity.changed', { zero: true });
        fire('gravity.changed', '{"zero": false}');

        const items = [...document.querySelectorAll('[data-ticker] li')];

        expect(items[0]?.textContent).toBe(
            '0.0s gravity.changed {"zero":false} (director)',
        );
        expect(items[0]?.getAttribute('data-origin')).toBe('director');
        expect(items[1]?.getAttribute('data-origin')).toBe('game');
    });

    it('shows the Brain’s own events, which wake nothing', () => {
        setup();

        select('button[data-start="monkey/flee"]').click();

        expect(ticker()[0]).toBe(
            '0.0s behaviour.started {"actor":"monkey","id":"monkey/flee","kind":"activity","resumed":false}',
        );
    });

    it('keeps the last 40 only', () => {
        const { game } = setup();
        for (let id = 0; id < 45; id++) {
            game.events.emit('bomb.cancelled', { id });
        }

        const lines = ticker();

        expect(lines).toHaveLength(40);
        expect(lines[0]).toContain('"id":44');
        expect(lines.at(-1)).toContain('"id":5}');
    });
});

describe('its markup', () => {
    it('names the panel and its parts, for the style and for assistive technology', () => {
        setup();

        expect(panel().tagName).toBe('ASIDE');
        expect(panel().className).toBe('director');
        expect(panel().getAttribute('data-director')).toBe('');
        expect(panel().querySelector('h2')?.textContent).toBe('Director');
        expect(eventField().getAttribute('aria-label')).toBe('Event');
        expect(payloadField().getAttribute('aria-label')).toBe(
            'Payload (JSON)',
        );
        expect(form().querySelector('button')?.textContent).toBe('Fire');
        expect(error().getAttribute('data-error')).toBe('');
        expect(error().getAttribute('role')).toBe('alert');
        expect(error().hidden).toBe(true);
        expect(error().textContent).toBe('');
        expect(select('[data-ticker]').tagName).toBe('OL');
        expect(select('[data-ticker]').getAttribute('data-ticker')).toBe('');
        expect(select('[data-ticker]').getAttribute('aria-label')).toBe(
            'Events',
        );
        expect(
            select('[data-actor="monkey"] [data-current]').getAttribute(
                'data-current',
            ),
        ).toBe('');
        expect(select('[data-actor="monkey"] h3').textContent).toBe('monkey: ');
        expect(select('[data-start="monkey/flee"]').getAttribute('type')).toBe(
            'button',
        );
    });

    it('holds no stray text: only its leaves have any', () => {
        setup();

        const containers = panel().querySelectorAll(
            'aside, div, section, ul, ol, li, form',
        );
        const strays = [panel(), ...containers].flatMap((container) =>
            [...container.childNodes].filter((node) => node.nodeType === 3),
        );

        expect(strays).toEqual([]);
    });
});

describe('what it lists', () => {
    it('shows several overlays, waiting and interrupted behaviours, comma-separated', () => {
        const activity = (
            id: string,
            priority: number,
            resumes = false,
        ): Behaviour => ({
            ...flee,
            id,
            priority,
            resumes,
        });
        setup([
            { ...flinch, id: 'monkey/a' },
            { ...flinch, id: 'monkey/b' },
            activity('monkey/low', 1, true),
            activity('monkey/mid', 5, true),
            activity('monkey/high', 9),
            activity('monkey/wait-1', 1),
            activity('monkey/wait-2', 1),
        ]);
        for (const id of ['a', 'b', 'low', 'mid', 'high', 'wait-1', 'wait-2']) {
            select(`[data-start="monkey/${id}"]`).click();
        }

        expect(current('monkey')).toBe(
            'monkey/high · overlay: monkey/a, monkey/b · suspended: monkey/low, monkey/mid · waiting: monkey/wait-1, monkey/wait-2',
        );
    });

    it('gives each behaviour a body that moves on the game clock', () => {
        const hop: Behaviour = {
            ...flee,
            id: 'monkey/hop',
            *run(): Run {
                yield { type: 'hop' };
            },
        };
        const { clock } = setup([hop]);

        select('[data-start="monkey/hop"]').click();
        expect(current('monkey')).toBe('monkey/hop');
        clock.tick(399);
        expect(current('monkey')).toBe('monkey/hop');
        clock.tick(1);

        expect(current('monkey')).toBe('idle');
    });
});

describe('once removed', () => {
    it('leaves the page and the bus alone', () => {
        const { game, unmount } = setup();
        const choice = eventField();
        const fireForm = form();
        const start = select('[data-start="monkey/flee"]');
        const list = select('[data-ticker]');
        const payload = payloadField();
        const before = payload.value;
        const heard = vi.fn();
        game.events.on('tornado.ended', heard);
        unmount();

        choice.value = 'bomb.placed';
        choice.dispatchEvent(new Event('change'));
        choice.value = 'tornado.ended';
        fireForm.dispatchEvent(new Event('submit', { cancelable: true }));
        start.click();
        game.events.emit('gravity.changed', { zero: true });

        expect(payload.value).toBe(before);
        expect(heard).not.toHaveBeenCalled();
        expect(game.engine.brain('monkey')?.snapshot().body).toBeUndefined();
        expect(list.children).toHaveLength(0);
    });
});

describe('the motor console', () => {
    // A monkey with a body of its own, and a drone the panel gives a fake one.
    const mounted = (
        behaviours: Behaviour[] = [hover],
    ): {
        events: EventBus<GameEvents>;
        engine: Engine;
        motor: FakeMotor;
        unmount: () => void;
    } => {
        const events = new EventBus<GameEvents>();
        const engine = new Engine({
            events,
            clock: new Clock({ maxStep: 100_000 }),
            random: (): number => 0,
            lines: { locale: 'en', pools: {} },
            behaviours,
            onError: (error): void => {
                throw error as Error;
            },
        });
        const motor = new FakeMotor();
        engine.attach('monkey', motor);
        const unmount = mountDirector({ events, engine });
        return { events, engine, motor, unmount };
    };
    const consoleOf = (actor: string): HTMLFormElement =>
        select(`form[data-motor="${actor}"]`) as HTMLFormElement;
    const field = (name: string): HTMLSelectElement | HTMLTextAreaElement =>
        select(`form[data-motor="monkey"] [name="${name}"]`) as
            HTMLSelectElement | HTMLTextAreaElement;
    const send = (request: string, payload?: string, layer = 'body'): void => {
        field('request').value = request;
        field('request').dispatchEvent(new Event('change'));
        if (payload !== undefined) {
            field('payload').value = payload;
        }
        field('layer').value = layer;
        consoleOf('monkey').dispatchEvent(
            new Event('submit', { cancelable: true }),
        );
    };

    it('lists the actor that has a body and no behaviour, with a form for its requests', () => {
        mounted();

        const actors = [...document.querySelectorAll('[data-actor]')].map(
            (actor) => actor.getAttribute('data-actor'),
        );

        expect(actors).toEqual(['drone', 'monkey']);
        expect(consoleOf('monkey')).not.toBeNull();
    });

    it('has no form for an actor whose requests it does not know', () => {
        mounted();

        expect(document.querySelectorAll('form[data-motor]')).toHaveLength(1);
        expect(select('[data-actor="drone"]').querySelector('form')).toBeNull();
    });

    it('also has one for a monkey that has behaviours and no body, which the panel gives a fake one', () => {
        setup();

        expect(consoleOf('monkey')).not.toBeNull();
    });

    it('offers each request, starting from a sample of the first', () => {
        mounted();
        const request = field('request') as HTMLSelectElement;

        expect(
            [...request.options].map((option) => option.value).sort(),
        ).toEqual([
            'carry',
            'drop',
            'face',
            'mood',
            'place',
            'pose',
            'stand',
            'stop',
            'walk',
        ]);
        expect(JSON.parse(field('payload').value)).toEqual(
            requestSamples.monkey?.[request.value],
        );
        expect(request.getAttribute('aria-label')).toBe('monkey request');
        expect(field('payload').getAttribute('aria-label')).toBe(
            'monkey request (JSON)',
        );
        expect(field('layer').getAttribute('aria-label')).toBe('monkey layer');
    });

    it('offers the two layers', () => {
        mounted();

        expect(
            [...(field('layer') as HTMLSelectElement).options].map(
                (option) => option.value,
            ),
        ).toEqual(['body', 'overlay']);
    });

    it('fills the payload with the sample of the request chosen', () => {
        mounted();

        field('request').value = 'face';
        field('request').dispatchEvent(new Event('change'));

        expect(JSON.parse(field('payload').value)).toEqual({
            type: 'face',
            direction: 'left',
        });
    });

    it('sends the request to the Motor, on the body layer, and says how it ended', () => {
        const { motor } = mounted();

        send('walk', '{"type":"walk","x":700}');

        expect(motor.requests).toEqual([{ type: 'walk', x: 700 }]);
        expect(motor.layers).toEqual(['body']);
        expect(error().hidden).toBe(true);
        motor.finish('done');
        expect(error().hidden).toBe(false);
        expect(error().textContent).toBe('monkey walk: done');

        send('stop', '{"type":"stop"}');
        motor.finish('failed');
        expect(error().textContent).toBe('monkey stop: failed');
    });

    it('is a form with a button to send, which the browser does not submit', () => {
        mounted();
        const submit = new Event('submit', { cancelable: true });

        consoleOf('monkey').dispatchEvent(submit);

        expect(consoleOf('monkey').querySelector('button')?.textContent).toBe(
            'Send',
        );
        expect(submit.defaultPrevented).toBe(true);
    });

    it('sends it on the overlay layer when asked to', () => {
        const { motor } = mounted();

        send('mood', '{"type":"mood","mood":"scared","ms":500}', 'overlay');

        expect(motor.layers).toEqual(['overlay']);
    });

    it('clears the last message when it sends, then tells what comes', () => {
        const { motor } = mounted();
        send('walk', '{"type":"walk","x":700}');
        motor.finish('done');
        expect(error().hidden).toBe(false);

        send('walk', '{"type":"walk","x":100}');

        expect(error().hidden).toBe(true);
    });

    it('says when the payload is not JSON, and sends nothing', () => {
        const { motor } = mounted();

        send('walk', '{"type":');

        expect(error().textContent).toMatch(/^Invalid JSON: /);
        expect(motor.requests).toEqual([]);
    });

    it('says what a Motor that refuses a request throws', () => {
        const { engine } = mounted();
        vi.spyOn(
            engine.motor('monkey') as FakeMotor,
            'perform',
        ).mockImplementation(() => {
            throw new Error('No body.');
        });

        send('stop', '{"type":"stop"}');

        expect(error().textContent).toBe('Error: No body.');
    });

    it('is gone with the panel, and stops listening', () => {
        const { motor, unmount } = mounted();
        const consoleForm = consoleOf('monkey');
        const request = field('request');
        const payload = field('payload');
        const before = payload.value;
        unmount();

        request.value = 'face';
        request.dispatchEvent(new Event('change'));
        const after = payload.value;
        payload.value = '{"type":"stop"}';
        consoleForm.dispatchEvent(new Event('submit', { cancelable: true }));

        expect(after).toBe(before);
        expect(motor.requests).toEqual([]);
        expect(document.querySelector('form[data-motor]')).toBeNull();
    });
});
