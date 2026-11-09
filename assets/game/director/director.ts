import '../../styles/blocks/director.css';
import type { TriggerName } from '../brain/behaviour';
import type { Brain, BrainSnapshot } from '../brain/brain';
import type { GameEvents } from '../events/game_events';
import type { Game } from '../game';
import { FakeMotor } from '../ports/fake_motor';
import type { Layer, Motor, MotorRequest } from '../ports/motor';
import { poseGroups } from './poses';
import { eventSamples, requestSamples } from './samples';
import { scenarios, type ScenarioGame } from './scenarios';
import { tabs } from './tabs';

// What the panel needs of the game: the engine, and the actions the scenarios play.
export type DirectedGame = Pick<Game, 'engine'> & ScenarioGame;

const TICKER_LENGTH = 40;
const OPEN_KEY = 'director.open';

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

// Whether the panel was left open. The storage can be refused (private window, blocked site
// data): the panel then starts closed and forgets.
const wasOpen = (): boolean => {
    try {
        return localStorage.getItem(OPEN_KEY) === '1';
    } catch {
        return false;
    }
};

const remember = (open: boolean): void => {
    try {
        localStorage.setItem(OPEN_KEY, open ? '1' : '0');
    } catch {
        // Nothing to keep it in: it starts closed next time.
    }
};

// Runs an action and tells what went wrong, so a bad payload or a Motor that refuses never
// reaches the page.
const attempt = (report: (text: string) => void, action: () => void): void => {
    try {
        action();
    } catch (error) {
        report(
            error instanceof SyntaxError
                ? `Invalid JSON: ${error.message}`
                : String(error),
        );
    }
};

// Sends one request straight to an actor's Motor, the Brain not being asked, and tells how it
// ended.
const send = (
    actor: string,
    motor: Motor,
    request: MotorRequest,
    layer: Layer,
    report: (text: string) => void,
): void => {
    report('');
    motor.perform(
        request,
        (outcome) => {
            report(`${actor} ${request.type}: ${outcome}`);
        },
        layer,
    );
};

// A form that sends one request, written as JSON, to an actor's Motor, on either layer.
const motorForm = (
    actor: string,
    motor: Motor,
    requests: Record<string, MotorRequest>,
    report: (text: string) => void,
    signal: AbortSignal,
): HTMLFormElement => {
    const form = element('form');
    form.dataset.motor = actor;
    const choice = element('select');
    choice.name = 'request';
    choice.setAttribute('aria-label', `${actor} request`);
    for (const type of Object.keys(requests)) {
        const option = element('option', type);
        option.value = type;
        choice.append(option);
    }
    const layer = element('select');
    layer.name = 'layer';
    layer.setAttribute('aria-label', `${actor} layer`);
    for (const name of ['body', 'overlay']) {
        const option = element('option', name);
        option.value = name;
        layer.append(option);
    }
    const payload = element('textarea');
    payload.name = 'payload';
    payload.rows = 3;
    payload.setAttribute('aria-label', `${actor} request (JSON)`);
    const sample = (): void => {
        payload.value = JSON.stringify(requests[choice.value]);
    };
    sample();
    choice.addEventListener('change', sample, { signal });
    const submit = element('button', 'Send');
    form.append(choice, layer, payload, submit);
    form.addEventListener(
        'submit',
        (event) => {
            event.preventDefault();
            attempt(report, () => {
                send(
                    actor,
                    motor,
                    JSON.parse(payload.value) as MotorRequest,
                    layer.value === 'overlay' ? 'overlay' : 'body',
                    report,
                );
            });
        },
        { signal },
    );
    return form;
};

// A button that does something when pressed.
const action = (
    text: string,
    run: () => void,
    signal: AbortSignal,
): HTMLButtonElement => {
    const button = element('button', text);
    button.type = 'button';
    button.addEventListener('click', run, { signal });
    return button;
};

// A list of items, one per line of the panel.
const listOf = (...items: HTMLElement[]): HTMLUListElement => {
    const list = element('ul');
    for (const item of items) {
        const line = element('li');
        line.append(item);
        list.append(line);
    }
    return list;
};

// The development panel (docs/architecture.md, The director panel): plays scenarios through the
// game, sends poses to the monkey's body, starts any behaviour of any actor, fires any event,
// and shows what each actor is doing and what happens on the bus. It is not part of the
// production bundle: only the Stimulus controller loads it, behind `import.meta.env.DEV`.
// Returns the function that removes it.
export const mountDirector = (
    game: DirectedGame,
    host: HTMLElement = document.body,
): (() => void) => {
    const { events, engine } = game;
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
    panel.id = 'director';
    panel.dataset.director = '';
    panel.setAttribute('aria-label', 'Director panel (development only)');

    const toggle = element('button', 'Director');
    toggle.type = 'button';
    toggle.className = 'director-toggle';
    toggle.setAttribute('aria-controls', panel.id);
    const show = (open: boolean): void => {
        panel.hidden = !open;
        toggle.dataset.open = String(open);
        toggle.setAttribute('aria-expanded', String(open));
    };
    show(wasOpen());
    toggle.addEventListener(
        'click',
        () => {
            const open = panel.hidden !== false;
            show(open);
            remember(open);
        },
        { signal },
    );
    const close = (): void => {
        show(false);
        remember(false);
        toggle.focus();
    };
    panel.addEventListener(
        'keydown',
        (event) => {
            if (event.key === 'Escape') {
                close();
            }
        },
        { signal },
    );

    const message = element('p');
    message.dataset.error = '';
    message.setAttribute('role', 'alert');
    message.hidden = true;
    const report = (text: string): void => {
        message.textContent = text;
        message.hidden = text === '';
    };

    // The header: what each actor is doing, always in view.
    const outputs = new Map<Brain, HTMLElement>();
    const refresh = (): void => {
        for (const [brain, output] of outputs) {
            output.textContent = describe(brain.snapshot());
        }
    };
    const header = element('header');
    const closer = action('✕', close, signal);
    closer.setAttribute('aria-label', 'Close the director');
    closer.dataset.close = '';
    header.append(element('h2', 'Director'), closer);
    const statuses = element('div');
    for (const [actor, brain] of brains) {
        const status = element('p');
        status.dataset.actor = actor;
        const current = element('output');
        current.dataset.current = '';
        outputs.set(brain, current);
        status.append(element('strong', `${actor}: `), current);
        statuses.append(status);
    }
    refresh();

    // Scenarios: real game actions.
    const scenarioTab = element('div');
    scenarioTab.dataset.tab = 'scenarios';
    scenarioTab.append(
        listOf(
            ...scenarios.map(({ label, note, run }) => {
                const item = element('span');
                item.append(
                    action(
                        label,
                        () => {
                            attempt(report, () => {
                                report(run(game) ?? '');
                            });
                        },
                        signal,
                    ),
                );
                if (note !== undefined) {
                    item.append(element('small', note));
                }
                return item;
            }),
        ),
    );

    // Poses: straight to the monkey's Motor.
    const poseTab = element('div');
    poseTab.dataset.tab = 'poses';
    for (const { name, buttons } of poseGroups) {
        const section = element('section');
        section.append(
            element('h3', name),
            listOf(
                ...buttons.map(({ label, request }) =>
                    action(
                        label,
                        () => {
                            const motor = engine.motor('monkey');
                            attempt(report, () => {
                                if (!motor) {
                                    throw new Error('The monkey has no body.');
                                }
                                send(
                                    'monkey',
                                    motor,
                                    request(
                                        document.documentElement.clientWidth,
                                    ),
                                    'body',
                                    report,
                                );
                            });
                        },
                        signal,
                    ),
                ),
            ),
        );
        poseTab.append(section);
    }

    // Behaviours: a button for each, by the usual rules of priority.
    const behaviourTab = element('div');
    behaviourTab.dataset.tab = 'behaviours';
    for (const [actor, brain] of brains) {
        const section = element('section');
        section.dataset.behaviours = actor;
        section.append(
            element('h3', actor),
            listOf(
                ...engine.behaviours(actor).map(({ id, kind, priority }) => {
                    const start = action(
                        id.slice(actor.length + 1),
                        () => {
                            report(
                                brain.start(id) ? '' : `${id} did not start.`,
                            );
                            // A queued activity says nothing on the bus.
                            refresh();
                        },
                        signal,
                    );
                    start.dataset.start = id;
                    start.append(
                        element('small', ` (${kind}, ${String(priority)})`),
                    );
                    return start;
                }),
            ),
        );
        behaviourTab.append(section);
    }

    // Raw: any event, any request, as JSON.
    const rawTab = element('div');
    rawTab.dataset.tab = 'raw';
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
            attempt(report, () => {
                const text = payload.value.trim();
                const body: unknown =
                    text === '' ? undefined : JSON.parse(text);
                events.emit(
                    choice.value as TriggerName,
                    body as GameEvents[TriggerName],
                    'director',
                );
                report('');
            });
        },
        { signal },
    );
    rawTab.append(form);
    for (const actor of brains.keys()) {
        const requests = requestSamples[actor];
        const motor = engine.motor(actor);
        if (requests && motor) {
            rawTab.append(motorForm(actor, motor, requests, report, signal));
        }
    }

    // The events, newest first, folded away.
    const ticker = element('ol');
    ticker.dataset.ticker = '';
    ticker.setAttribute('aria-label', 'Events');
    const log = element('details');
    log.append(element('summary', 'Event log'), ticker);
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

    panel.append(
        header,
        statuses,
        message,
        tabs(
            [
                { id: 'scenarios', label: 'Scenarios', panel: scenarioTab },
                { id: 'poses', label: 'Poses', panel: poseTab },
                { id: 'behaviours', label: 'Behaviours', panel: behaviourTab },
                { id: 'raw', label: 'Raw', panel: rawTab },
            ],
            signal,
        ),
        scenarioTab,
        poseTab,
        behaviourTab,
        rawTab,
        log,
    );
    host.append(toggle, panel);
    return (): void => {
        stopListening();
        abort.abort();
        panel.remove();
        toggle.remove();
    };
};
