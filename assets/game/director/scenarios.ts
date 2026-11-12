import type { Point } from '../events/game_events';
import type { Game } from '../game';
import { EDGE } from './poses';

// What the scenarios call: the game's own actions, so the whole chain runs (physics, events,
// Brain, look).
export type ScenarioGame = Pick<
    Game,
    'events' | 'engine' | 'bomb' | 'tornado' | 'setZeroGravity' | 'rebuild'
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

// A real pointer moves once per browser frame, and the hand reads its speed from their times: the
// game clock cannot pace this, and the panel is development only.
const nextFrame = (callback: () => void): void => {
    // eslint-disable-next-line no-restricted-globals -- see above
    requestAnimationFrame(callback);
};

// A mouse event of the hand at a point of the screen.
const fire = (target: EventTarget, type: string, { x, y }: Point): void => {
    target.dispatchEvent(
        new PointerEvent(type, {
            bubbles: true,
            pointerId: 1,
            pointerType: 'mouse',
            button: 0,
            clientX: x,
            clientY: y,
        }),
    );
};

const centre = (element: Element): Point => {
    const box = element.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
};

// Throws him with the hand, as the visitor's pointer would: a press on him, `moves` moves of
// (dx, dy), one per animation frame, then a release. The hand takes him whatever tool is chosen.
const fling =
    (direction: () => Point, moves: number) => (): string | undefined => {
        const element = document.querySelector('svg[data-pose]');
        if (!element) {
            return NOT_FOUND;
        }
        const { x: dx, y: dy } = direction();
        const at = centre(element);
        fire(element, 'pointerdown', at);
        let done = 0;
        const step = (): void => {
            if (done === moves) {
                fire(window, 'pointerup', at);
                return;
            }
            done++;
            at.x += dx;
            at.y += dy;
            fire(window, 'pointermove', at);
            nextFrame(step);
        };
        nextFrame(step);
        return undefined;
    };

// The time the dropped cigarette is given to fall and settle, and the most the hand holds it.
const SETTLE_MS = 700;
const HOLD_MS = 15_000;
// How high above his head (30 px over his centre) the hand holds it, and how fast it rises and
// moves away, in px per ms: 20 and 1 px per frame at 60 Hz, whatever the screen's rate.
const HOLD_ABOVE = 120;
const HEAD = 30;
const RISE = 1.2;
const DRIFT = 0.06;

// The browser's clock, for a hand that does not follow the game's (see `nextFrame`).
const now = (): number => {
    // eslint-disable-next-line no-restricted-globals -- see `nextFrame`
    return performance.now();
};

// The visitor takes the cigarette he dropped, with the hand: knocked off, left to land, then
// pressed on, raised above his head and held there, moving slowly away, until it is no longer on
// the page (he snatched it, or gave up on it) or the hand tires.
const stealCigarette = (game: ScenarioGame): string | undefined => {
    if (!monkeyAt()) {
        return NOT_FOUND;
    }
    const refusal = knockOff(game);
    if (refusal !== undefined) {
        return refusal;
    }
    const grab = (): void => {
        const cigarette = document.querySelector('svg.lost-cigarette');
        const monkey = document.querySelector('svg[data-pose]');
        if (!cigarette || !monkey) {
            return;
        }
        const at = centre(cigarette);
        const him = centre(monkey);
        const aim = { x: at.x, y: him.y - HEAD - HOLD_ABOVE };
        const away = at.x < him.x ? -DRIFT : DRIFT;
        fire(cigarette, 'pointerdown', at);
        const start = now();
        let last = start;
        const step = (): void => {
            const time = now();
            if (!cigarette.isConnected || time - start >= HOLD_MS) {
                fire(window, 'pointerup', at);
                return;
            }
            const rise = aim.y - at.y;
            const lift = Math.min(RISE * (time - last), Math.abs(rise));
            at.y += Math.sign(rise) * lift;
            at.x += at.y === aim.y ? away * (time - last) : 0;
            last = time;
            fire(window, 'pointermove', at);
            nextFrame(step);
        };
        nextFrame(step);
    };
    const since = now();
    const wait = (): void => {
        if (now() - since >= SETTLE_MS) {
            grab();
            return;
        }
        nextFrame(wait);
    };
    nextFrame(wait);
    return undefined;
};

// Starts one of his behaviours by the usual rules of priority, as the Behaviours tab does, and
// says why when it does not start.
const makeHim =
    (id: string, refusal: string) =>
    (game: ScenarioGame): string | undefined =>
        game.engine.brain('monkey')?.start(id) === true ? undefined : refusal;

const startKnock = makeHim(
    'monkey/lose_cig',
    'He has no Brain, or the reflex is already running.',
);

// His picture says when the cigarette is not lit in his mouth (`data-cigarette`): nothing to knock
// off then, and the reflex would report success all the same.
const knockOff = (game: ScenarioGame): string | undefined =>
    document.querySelector<SVGElement>('svg[data-pose]')?.dataset.cigarette ===
    undefined
        ? startKnock(game)
        : 'He has no lit cigarette to lose.';

const UP: Point = { x: 0, y: -70 };
const SIDEWAYS = 140;

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
        label: 'Fling him off the top',
        note: 'Real throw with the hand: eight moves up, then a release.',
        run: fling(() => UP, 8),
    },
    {
        label: 'Fling him off a side',
        note: 'Real throw with the hand towards the nearer edge: ten moves, then a release.',
        run: fling(() => {
            const at = monkeyAt();
            const left =
                at !== undefined &&
                at.x < document.documentElement.clientWidth / 2;
            return { x: left ? -SIDEWAYS : SIDEWAYS, y: 0 };
        }, 10),
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
        label: 'Knock his cigarette off',
        note: 'Starts the reflex that makes it fall, ignoring the dice and the conditions.',
        run: knockOff,
    },
    {
        label: 'Sneeze now',
        note: 'Starts the sneeze: it only fills idle time (smoking is), so he must not be doing anything else.',
        run: makeHim(
            'monkey/sneeze',
            'He is busy: a sneeze only comes in idle time.',
        ),
    },
    {
        label: 'Cigarette up high',
        note: 'Knocks it off, then a tornado over him sweeps it up for 5 s, so he jumps for it while it flies. The pieces fly too.',
        run: (game): string | undefined => {
            const at = monkeyAt();
            if (!at) {
                return NOT_FOUND;
            }
            const refusal = knockOff(game);
            if (refusal === undefined) {
                game.tornado(at);
            }
            return refusal;
        },
    },
    {
        label: 'Steal his cigarette',
        note: 'Knocks it off, then grabs it with the hand and holds it 120 px above his head, moving slowly away: he chases it, jumps and snatches it.',
        run: stealCigarette,
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
