import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    monkeyAt,
    scenarios,
    type ScenarioGame,
} from '../../../../assets/game/director/scenarios';
import type { Engine } from '../../../../assets/game/brain/engine';
import { EventBus } from '../../../../assets/game/events/event_bus';
import type { GameEvents } from '../../../../assets/game/events/game_events';
import { rect } from '../dom';

// The Brain of the monkey, which the scenarios start behaviours on; `starts` is what it answers.
const setup = (
    starts = true,
): {
    game: ScenarioGame;
    events: EventBus<GameEvents>;
    start: ReturnType<typeof vi.fn>;
} => {
    const events = new EventBus<GameEvents>();
    const start = vi.fn(() => starts);
    return {
        events,
        start,
        game: {
            events,
            engine: {
                brain: (actor: string) =>
                    actor === 'monkey' ? { start } : undefined,
            } as unknown as Engine,
            bomb: vi.fn(),
            tornado: vi.fn(),
            setZeroGravity: vi.fn(),
            rebuild: vi.fn(),
        },
    };
};

// His picture, 56 by 72, with its centre at the page point given (the page not scrolled).
const monkeyAtCentre = (x: number, y: number): void => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.dataset.pose = 'stand';
    svg.getBoundingClientRect = (): DOMRect => rect(x - 28, y - 36, 56, 72);
    document.body.append(svg);
};

const run = (label: string, game: ScenarioGame): string | undefined => {
    const scenario = scenarios.find((each) => each.label === label);
    if (!scenario) {
        throw new Error(`No scenario ${label}.`);
    }
    return scenario.run(game);
};

const pageWidth = (width: number): void => {
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(
        width,
    );
};

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('where the monkey is', () => {
    it('is the centre of his picture, in page coordinates', () => {
        monkeyAtCentre(300, 650);
        vi.stubGlobal('scrollX', 10);
        vi.stubGlobal('scrollY', 200);

        expect(monkeyAt()).toEqual({ x: 310, y: 850 });
    });

    it('is unknown when his picture is not on the page', () => {
        expect(monkeyAt()).toBeUndefined();
    });
});

describe('the scenarios that place something by him', () => {
    it('drops a bomb on him', () => {
        const { game } = setup();
        monkeyAtCentre(300, 650);

        expect(run('Bomb on him', game)).toBeUndefined();

        expect(game.bomb).toHaveBeenCalledExactlyOnceWith({ x: 300, y: 650 });
    });

    it('drops a bomb at the far edge when he is in the left half', () => {
        const { game } = setup();
        pageWidth(1000);
        monkeyAtCentre(499, 650);

        run('Bomb far from him', game);

        expect(game.bomb).toHaveBeenCalledExactlyOnceWith({ x: 920, y: 650 });
    });

    it('drops it at the near edge when he is in the right half, or in the middle', () => {
        const { game } = setup();
        pageWidth(1000);
        monkeyAtCentre(500, 650);

        run('Bomb far from him', game);

        expect(game.bomb).toHaveBeenCalledExactlyOnceWith({ x: 80, y: 650 });
    });

    it('raises a tornado over him', () => {
        const { game } = setup();
        monkeyAtCentre(300, 650);

        run('Tornado over him', game);

        expect(game.tornado).toHaveBeenCalledExactlyOnceWith({
            x: 300,
            y: 650,
        });
    });

    // Plays the scenario with the frames run by hand: the press on his picture, then what the
    // window gets, as [type, clientX, clientY].
    const thrown = (
        label: string,
    ): { press: [number, number][]; rest: [string, number, number][] } => {
        const { game } = setup();
        const frames: (() => void)[] = [];
        vi.stubGlobal('requestAnimationFrame', (callback: () => void) =>
            frames.push(callback),
        );
        const stop = new AbortController();
        const press: [number, number][] = [];
        const rest: [string, number, number][] = [];
        document.querySelector('svg')?.addEventListener(
            'pointerdown',
            (event) => {
                expect(event.bubbles).toBe(true);
                // A touch would wait for a long press: the hand has to see a mouse.
                expect(event.pointerType).toBe('mouse');
                press.push([event.clientX, event.clientY]);
            },
            { signal: stop.signal },
        );
        for (const type of ['pointermove', 'pointerup']) {
            window.addEventListener(
                type,
                (event) => {
                    rest.push([
                        type,
                        (event as PointerEvent).clientX,
                        (event as PointerEvent).clientY,
                    ]);
                },
                { signal: stop.signal },
            );
        }

        expect(run(label, game)).toBeUndefined();
        expect(rest).toEqual([]);
        while (frames.length > 0) {
            frames.shift()?.();
        }
        stop.abort();
        return { press, rest };
    };

    it('throws him up with the hand: a press on him, eight moves of 70 px, a release', () => {
        monkeyAtCentre(300, 650);

        const { press, rest } = thrown('Fling him off the top');

        expect(press).toEqual([[300, 650]]);
        expect(rest).toEqual([
            ...Array.from({ length: 8 }, (_, i): [string, number, number] => [
                'pointermove',
                300,
                650 - 70 * (i + 1),
            ]),
            ['pointerup', 300, 90],
        ]);
    });

    it('throws him sideways towards the nearer edge: ten moves of 140 px', () => {
        pageWidth(1000);
        monkeyAtCentre(499, 650);
        const left = thrown('Fling him off a side');
        expect(left.press).toEqual([[499, 650]]);
        expect(left.rest).toHaveLength(11);
        expect(left.rest[0]).toEqual(['pointermove', 499 - 140, 650]);
        expect(left.rest.at(-1)).toEqual(['pointerup', 499 - 1400, 650]);

        document.body.innerHTML = '';
        monkeyAtCentre(500, 650);
        const right = thrown('Fling him off a side');
        expect(right.rest[0]).toEqual(['pointermove', 640, 650]);
        expect(right.rest.at(-1)).toEqual(['pointerup', 1900, 650]);
    });

    it.each([
        'Bomb on him',
        'Bomb far from him',
        'Fling him off the top',
        'Fling him off a side',
        'Tornado over him',
    ])('says so, and does nothing, when %s cannot find him', (label) => {
        const { game } = setup();

        expect(run(label, game)).toBe('The monkey is not on the page.');

        expect(game.bomb).not.toHaveBeenCalled();
        expect(game.tornado).not.toHaveBeenCalled();
    });
});

describe('the scenarios that act on the world', () => {
    it('turns the gravity off, and on again', () => {
        const { game } = setup();

        expect(run('Zero gravity on', game)).toBeUndefined();
        expect(game.setZeroGravity).toHaveBeenLastCalledWith(true);
        expect(run('Zero gravity off', game)).toBeUndefined();

        expect(game.setZeroGravity).toHaveBeenNthCalledWith(1, true);
        expect(game.setZeroGravity).toHaveBeenNthCalledWith(2, false);
    });

    it('wrecks the page: zero gravity off, on, then off', () => {
        const { game } = setup();

        expect(run('Wreck the page', game)).toBeUndefined();

        expect(game.setZeroGravity).toHaveBeenCalledTimes(3);
        expect(game.setZeroGravity).toHaveBeenNthCalledWith(1, false);
        expect(game.setZeroGravity).toHaveBeenNthCalledWith(2, true);
        expect(game.setZeroGravity).toHaveBeenNthCalledWith(3, false);
    });

    it('asks for the rebuild', () => {
        const { game } = setup();

        expect(run('Rebuild', game)).toBeUndefined();

        expect(game.rebuild).toHaveBeenCalledOnce();
    });
});

describe('the scenarios that fire an event', () => {
    it('fires visitor.idle, as the director’s, for the lazy rebuild', () => {
        const { game, events } = setup();
        const heard = vi.fn();
        events.on('visitor.idle', heard);

        expect(run('Lazy rebuild now', game)).toBeUndefined();

        expect(heard).toHaveBeenCalledExactlyOnceWith(undefined, 'director');
    });

    it('fires monkey.hit against a piece, as a stand-in for a throw', () => {
        const { game, events } = setup();
        const heard = vi.fn();
        events.on('monkey.hit', heard);

        expect(run('Piece hits him', game)).toBeUndefined();

        expect(heard).toHaveBeenCalledExactlyOnceWith(
            { speed: 9, against: 'piece' },
            'director',
        );
    });
});

describe('the cigarette scenarios', () => {
    it('knocks his cigarette off by starting the reflex on his Brain', () => {
        const { game, start } = setup();

        expect(run('Knock his cigarette off', game)).toBeUndefined();

        expect(start).toHaveBeenCalledExactlyOnceWith('monkey/lose_cig');
    });

    it('says when the reflex did not start', () => {
        const { game } = setup(false);

        expect(run('Knock his cigarette off', game)).toBe(
            'He has no Brain, or the reflex is already running.',
        );
    });

    it('says when he has no Brain at all', () => {
        const { game } = setup();
        const lonely = {
            ...game,
            engine: { brain: () => undefined } as unknown as Engine,
        };

        expect(run('Knock his cigarette off', lonely)).toBe(
            'He has no Brain, or the reflex is already running.',
        );
    });

    it('says he has no lit cigarette to lose, and starts nothing, when his picture says so', () => {
        for (const state of ['lost', 'unlit']) {
            const { game, start } = setup();
            monkeyAtCentre(300, 650);
            document
                .querySelector('svg')
                ?.setAttribute('data-cigarette', state);

            expect(run('Knock his cigarette off', game)).toBe(
                'He has no lit cigarette to lose.',
            );

            expect(start).not.toHaveBeenCalled();
            document.body.innerHTML = '';
        }
    });

    it('raises no tornado for the cigarette up high when he has none to lose', () => {
        const { game } = setup();
        monkeyAtCentre(300, 650);
        document.querySelector('svg')?.setAttribute('data-cigarette', 'lost');

        expect(run('Cigarette up high', game)).toBe(
            'He has no lit cigarette to lose.',
        );

        expect(game.tornado).not.toHaveBeenCalled();
    });

    it('sneezes by starting the ambient behaviour, which only fills idle time', () => {
        const { game, start } = setup();

        expect(run('Sneeze now', game)).toBeUndefined();

        expect(start).toHaveBeenCalledExactlyOnceWith('monkey/sneeze');
    });

    it('says he is busy when the sneeze did not start', () => {
        const { game } = setup(false);

        expect(run('Sneeze now', game)).toBe(
            'He is busy: a sneeze only comes in idle time.',
        );
    });

    it('sweeps the cigarette up with a tornado over him once it has fallen', () => {
        const { game, start } = setup();
        monkeyAtCentre(300, 650);

        expect(run('Cigarette up high', game)).toBeUndefined();

        expect(start).toHaveBeenCalledExactlyOnceWith('monkey/lose_cig');
        expect(game.tornado).toHaveBeenCalledExactlyOnceWith({
            x: 300,
            y: 650,
        });
    });

    it('raises no tornado when the cigarette did not fall', () => {
        const { game } = setup(false);
        monkeyAtCentre(300, 650);

        expect(run('Cigarette up high', game)).toBe(
            'He has no Brain, or the reflex is already running.',
        );

        expect(game.tornado).not.toHaveBeenCalled();
    });

    it('says when he is not on the page, and does nothing', () => {
        const { game, start } = setup();

        expect(run('Cigarette up high', game)).toBe(
            'The monkey is not on the page.',
        );

        expect(start).not.toHaveBeenCalled();
        expect(game.tornado).not.toHaveBeenCalled();
    });
});

describe('the list', () => {
    it('labels every scenario, and says which are not what they seem', () => {
        expect(
            scenarios.map(({ label, note }) => [label, note !== undefined]),
        ).toEqual([
            ['Bomb on him', false],
            ['Bomb far from him', false],
            ['Fling him off the top', true],
            ['Fling him off a side', true],
            ['Tornado over him', false],
            ['Zero gravity on', false],
            ['Zero gravity off', false],
            ['Wreck the page', true],
            ['Rebuild', false],
            ['Lazy rebuild now', true],
            ['Knock his cigarette off', true],
            ['Sneeze now', true],
            ['Cigarette up high', true],
            ['Piece hits him', true],
        ]);
        expect(scenarios.flatMap(({ note }) => (note ? [note] : []))).toEqual([
            'Real throw with the hand: eight moves up, then a release.',
            'Real throw with the hand towards the nearer edge: ten moves, then a release.',
            'Zero gravity off, on, then off: every piece is freed and falls.',
            'Fires visitor.idle instead of waiting 15 s.',
            'Starts the reflex that makes it fall, ignoring the dice and the conditions.',
            'Starts the sneeze: it only fills idle time, so he must be doing nothing.',
            'Knocks it off, then a tornado over him sweeps it up for 5 s, so he jumps for it while it flies. The pieces fly too.',
            'Stand-in: fires monkey.hit, there is no way to throw a piece at him.',
        ]);
    });
});
