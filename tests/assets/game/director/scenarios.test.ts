import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    monkeyAt,
    scenarios,
    type ScenarioGame,
} from '../../../../assets/game/director/scenarios';
import { EventBus } from '../../../../assets/game/events/event_bus';
import type { GameEvents } from '../../../../assets/game/events/game_events';
import { rect } from '../dom';

const setup = (): {
    game: ScenarioGame;
    events: EventBus<GameEvents>;
} => {
    const events = new EventBus<GameEvents>();
    return {
        events,
        game: {
            events,
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
            ['Piece hits him', true],
        ]);
        expect(scenarios.flatMap(({ note }) => (note ? [note] : []))).toEqual([
            'Real throw with the hand: eight moves up, then a release.',
            'Real throw with the hand towards the nearer edge: ten moves, then a release.',
            'Zero gravity off, on, then off: every piece is freed and falls.',
            'Fires visitor.idle instead of waiting 15 s.',
            'Stand-in: fires monkey.hit, there is no way to throw a piece at him.',
        ]);
    });
});
