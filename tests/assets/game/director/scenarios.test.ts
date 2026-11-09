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

    it.each(['Bomb on him', 'Bomb far from him', 'Tornado over him'])(
        'says so, and does nothing, when %s cannot find him',
        (label) => {
            const { game } = setup();

            expect(run(label, game)).toBe('The monkey is not on the page.');

            expect(game.bomb).not.toHaveBeenCalled();
            expect(game.tornado).not.toHaveBeenCalled();
        },
    );
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
            ['Tornado over him', false],
            ['Zero gravity on', false],
            ['Zero gravity off', false],
            ['Wreck the page', true],
            ['Rebuild', false],
            ['Lazy rebuild now', true],
            ['Piece hits him', true],
        ]);
        expect(scenarios.flatMap(({ note }) => (note ? [note] : []))).toEqual([
            'Zero gravity off, on, then off: every piece is freed and falls.',
            'Fires visitor.idle instead of waiting 15 s.',
            'Stand-in: fires monkey.hit, there is no way to throw a piece at him.',
        ]);
    });
});
