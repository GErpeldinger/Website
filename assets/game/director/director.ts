import '../../styles/blocks/director.css';
import type { TriggerName } from '../brain/behaviour';
import type { Brain, BrainSnapshot } from '../brain/brain';
import type { GameEvents } from '../events/game_events';
import type { Game } from '../game';
import { FakeMotor } from '../ports/fake_motor';
import { eventSamples } from './samples';

// What the panel needs of the game.
export type DirectedGame = Pick<Game, 'events' | 'engine'>;

const TICKER_LENGTH = 40;

const element = <Name extends keyof HTMLElementTagNameMap>(
    name: Name,
    text = '',
): HTMLElementTagNameMap[Name] => {
    const created = document.createElement(name);
    created.textContent = text;
    return created;
};

const describe = ({
    body,
    overlays,
    suspended,
    waiting,
}: BrainSnapshot): string =>
    [
        body ?? 'idle',
        ...(overlays.length > 0 ? [`overlay: ${overlays.join(', ')}`] : []),
        ...(suspended.length > 0 ? [`suspended: ${suspended.join(', ')}`] : []),
        ...(waiting.length > 0 ? [`waiting: ${waiting.join(', ')}`] : []),
    ].join(' · ');

// The development panel (docs/architecture.md, The behaviour engine): fires any event on the bus,
// starts any behaviour of any actor, and shows what each actor is doing and what happens on the
// bus. It is not part of the production bundle: only the Stimulus controller loads it, behind
// `import.meta.env.DEV`. Returns the function that removes it.
export const mountDirector = (
    { events, engine }: DirectedGame,
    host: HTMLElement = document.body,
): (() => void) => {
    // This assumes every real Motor was attached synchronously in `startGame`, before the panel
    // loads: an actor still without a Brain here has none coming, and gets the fake one.
    // An actor whose Motor is not built still takes part, with a body that only takes a moment,
    // and a voice so its lines show on the bus.
    const brains = new Map<string, Brain>();
    for (const actor of engine.actors()) {
        brains.set(
            actor,
            engine.brain(actor) ??
                engine.attach(actor, new FakeMotor({ clock: engine.clock }), {
                    speaks: true,
                }),
        );
    }

    const abort = new AbortController();
    const { signal } = abort;
    const panel = element('aside');
    panel.className = 'director';
    panel.dataset.director = '';
    panel.setAttribute('aria-label', 'Director panel (development only)');
    panel.append(element('h2', 'Director'));

    const message = element('p');
    message.dataset.error = '';
    message.setAttribute('role', 'alert');
    message.hidden = true;
    const report = (text: string): void => {
        message.textContent = text;
        message.hidden = text === '';
    };

    // Fire an event.
    const form = element('form');
    const choice = element('select');
    choice.name = 'event';
    choice.setAttribute('aria-label', 'Event');
    for (const name of Object.keys(eventSamples)) {
        const option = element('option', name);
        option.value = name;
        choice.append(option);
    }
    const payload = element('textarea');
    payload.name = 'payload';
    payload.rows = 5;
    payload.setAttribute('aria-label', 'Payload (JSON)');
    const sample = (): void => {
        const value = eventSamples[choice.value as TriggerName];
        payload.value =
            value === undefined ? '' : JSON.stringify(value, null, 2);
    };
    sample();
    choice.addEventListener('change', sample, { signal });
    form.append(choice, payload, element('button', 'Fire'));
    form.addEventListener(
        'submit',
        (event) => {
            event.preventDefault();
            try {
                const text = payload.value.trim();
                const body: unknown =
                    text === '' ? undefined : JSON.parse(text);
                events.emit(
                    choice.value as TriggerName,
                    body as GameEvents[TriggerName],
                    'director',
                );
                report('');
            } catch (error) {
                report(
                    error instanceof SyntaxError
                        ? `Invalid JSON: ${error.message}`
                        : String(error),
                );
            }
        },
        { signal },
    );

    // Each actor: what it is doing, and a button for each behaviour.
    const outputs = new Map<Brain, HTMLElement>();
    const refresh = (): void => {
        for (const [brain, output] of outputs) {
            output.textContent = describe(brain.snapshot());
        }
    };
    const actors = element('div');
    for (const [actor, brain] of brains) {
        const section = element('section');
        section.dataset.actor = actor;
        const current = element('output');
        current.dataset.current = '';
        outputs.set(brain, current);
        section.append(element('h3', `${actor}: `), current);
        const list = element('ul');
        for (const { id, kind, priority } of engine.behaviours(actor)) {
            const start = element(
                'button',
                `${id.slice(actor.length + 1)} (${kind}, ${String(priority)})`,
            );
            start.type = 'button';
            start.dataset.start = id;
            start.addEventListener(
                'click',
                () => {
                    report(brain.start(id) ? '' : `${id} did not start.`);
                    // A queued activity says nothing on the bus.
                    refresh();
                },
                { signal },
            );
            const item = element('li');
            item.append(start);
            list.append(item);
        }
        section.append(list);
        actors.append(section);
    }
    refresh();

    // The events, newest first.
    const ticker = element('ol');
    ticker.dataset.ticker = '';
    ticker.setAttribute('aria-label', 'Events');
    const stopListening = events.onAny((name, body, origin) => {
        const item = element(
            'li',
            [
                `${(engine.clock.now() / 1000).toFixed(1)}s`,
                name,
                body === undefined ? '' : JSON.stringify(body),
                origin === 'director' ? '(director)' : '',
            ]
                .filter((part) => part !== '')
                .join(' '),
        );
        item.dataset.origin = origin;
        ticker.prepend(item);
        while (ticker.children.length > TICKER_LENGTH) {
            ticker.lastElementChild?.remove();
        }
        refresh();
    });

    panel.append(form, message, actors, ticker);
    host.append(panel);
    return (): void => {
        stopListening();
        abort.abort();
        panel.remove();
    };
};
