import type { Point } from '../events/game_events';
import type { Game } from '../game';
import { EDGE } from './poses';

// What the scenarios call: the game's own actions, so the whole chain runs (physics, events,
// Brain, look).
export type ScenarioGame = Pick<
    Game,
    'events' | 'bomb' | 'tornado' | 'setZeroGravity' | 'rebuild'
>;

export interface Scenario {
    label: string;
    // Said under the label when the scenario is not what it says (a stand-in).
    note?: string;
    run: (game: ScenarioGame) => string | undefined;
}

// The Brain's context holds his position, but nothing outside a behaviour can read it, and the
// game has no accessor for the panel's sake: his picture is on the page, so ask the page.
export const monkeyAt = (): Point | undefined => {
    const box = document
        .querySelector('svg[data-pose]')
        ?.getBoundingClientRect();
    return box
        ? {
              x: window.scrollX + box.left + box.width / 2,
              y: window.scrollY + box.top + box.height / 2,
          }
        : undefined;
};

const NOT_FOUND = 'The monkey is not on the page.';

// Bombs and tornadoes are placed relative to him; they say so when they cannot find him.
const nearHim =
    (act: (game: ScenarioGame, at: Point) => void) =>
    (game: ScenarioGame): string | undefined => {
        const at = monkeyAt();
        if (!at) {
            return NOT_FOUND;
        }
        act(game, at);
        return undefined;
    };

export const scenarios: readonly Scenario[] = [
    {
        label: 'Bomb on him',
        run: nearHim((game, at) => {
            game.bomb(at);
        }),
    },
    {
        label: 'Bomb far from him',
        run: nearHim((game, at) => {
            const width = document.documentElement.clientWidth;
            game.bomb({
                x: at.x < width / 2 ? width - EDGE : EDGE,
                y: at.y,
            });
        }),
    },
    {
        label: 'Tornado over him',
        run: nearHim((game, at) => {
            game.tornado(at);
        }),
    },
    {
        label: 'Zero gravity on',
        run: (game): undefined => {
            game.setZeroGravity(true);
            return undefined;
        },
    },
    {
        label: 'Zero gravity off',
        run: (game): undefined => {
            game.setZeroGravity(false);
            return undefined;
        },
    },
    {
        label: 'Wreck the page',
        note: 'Zero gravity off, on, then off: every piece is freed and falls.',
        run: (game): undefined => {
            // `true` does nothing when it is already on: start from off.
            game.setZeroGravity(false);
            game.setZeroGravity(true);
            game.setZeroGravity(false);
            return undefined;
        },
    },
    {
        label: 'Rebuild',
        run: (game): undefined => {
            game.rebuild();
            return undefined;
        },
    },
    {
        label: 'Lazy rebuild now',
        note: 'Fires visitor.idle instead of waiting 15 s.',
        run: ({ events }): undefined => {
            events.emit('visitor.idle', undefined, 'director');
            return undefined;
        },
    },
    {
        label: 'Piece hits him',
        note: 'Stand-in: fires monkey.hit, there is no way to throw a piece at him.',
        run: ({ events }): undefined => {
            events.emit(
                'monkey.hit',
                { speed: 9, against: 'piece' },
                'director',
            );
            return undefined;
        },
    },
];
