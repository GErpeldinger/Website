import {
    defineBehaviour,
    wait,
    type Act,
    type Context,
    type Run,
} from '../../brain/behaviour';
import type { Point } from '../../events/game_events';
import {
    WALL_MARGIN,
    type Facing,
    type MonkeyRequest,
} from '../../ports/monkey';
import { withinReach } from '../../ports/monkey_cigarette';
import { jumpFor } from './search/jump';

// The prototype's timings and distances. Times are in ms of game time, distances in px.
const NOTICE = 700;
const NOTICE_AFTER_SNEEZE = 900;
const LOOK = 1500;
const TURN = 380;
const TURNS = Math.ceil(LOOK / TURN);
const WRONG_WAY = 110;
const MARGIN = 40;
const REACHED = 10;
const HIGH = 6;
const JUMP_RANGE = 90;
const JUMP_EVERY = 700;
// Under a cigarette he cannot reach yet, he looks again this often.
const WAIT_UNDER = 100;
const GIVE_UP_AFTER = 12_000;
const LIGHT_MS = 1900;
// Held by the visitor, it is snatched once it comes this close to his head, and he walks after it
// this far at a time, to read where it went again.
const SNATCH = 30;
const CHASE_STEP = 40;
// This behaviour's id (a behaviour's id is its path), for the time it spent suspended.
const SEARCH = 'monkey/search';

// What the search needs to see of the world. Absent when the cigarette is no longer on the floor
// (the page was measured again and gave it back) or the world does not say.
interface Sight {
    cigarette: Point;
    monkeyX: number;
    monkeyTop: number;
    onFloor: boolean;
    pageWidth: number;
    // The visitor has it in hand.
    held: boolean;
}

const sight = ({
    cigarette,
    cigaretteHeld,
    monkeyX,
    monkeyTop,
    onFloor,
    pageWidth,
}: Context): Sight | undefined =>
    cigarette !== undefined &&
    monkeyX !== undefined &&
    monkeyTop !== undefined &&
    onFloor !== undefined &&
    pageWidth !== undefined
        ? {
              cigarette,
              monkeyX,
              monkeyTop,
              onFloor,
              pageWidth,
              held: cigaretteHeld === true,
          }
        : undefined;

const clamp = (value: number, least: number, most: number): number =>
    Math.max(least, Math.min(most, value));

const other = (facing: Facing): Facing =>
    facing === 'left' ? 'right' : 'left';

// What he does with the cigarette: he finds it on the floor, snatches it from the visitor's hand
// (the world lets it go; `cig.snatched` makes him say so) or gives up on it. Then he lights the
// one in his mouth with the lighter. Each step asks again if he is cut short here and resumes.
type Taking = 'found' | 'snatched' | 'gave up';

function* light(act: Act, taking: Taking): Run<MonkeyRequest> {
    const taken = yield { type: taking === 'gave up' ? 'discard' : 'pickup' };
    if (taken === 'failed') {
        return;
    }
    if (taking === 'gave up') {
        act.say('giveUp');
    } else if (taking === 'found') {
        act.say('found', undefined, { force: true });
    }
    yield { type: 'pose', pose: 'light', ms: LIGHT_MS };
    yield { type: 'relight' };
}

// Priority 60 and it resumes: why is in docs/architecture.md, Decisions. A cigarette lying
// against a wall is reached from the wall (WALL_MARGIN), the nearest he can stand.
export default defineBehaviour<MonkeyRequest>({
    actor: 'monkey',
    kind: 'activity',
    priority: 60,
    triggers: ['cig.lost'],
    resumes: true,
    canStart: ({ trigger, cigarette }) =>
        trigger?.name === 'cig.lost' && cigarette !== undefined,
    lines: ['search', 'jump', 'found', 'giveUp'],
    *run({ trigger }, act) {
        const sneezed =
            trigger?.name === 'cig.lost' && trigger.payload.cause === 'sneeze';

        // The visitor taking the cigarette ends the notice and the look: he goes for it.
        const taken = (): boolean => act.context().cigaretteHeld === true;

        // Knocked over, he gets on his feet first, then notices, standing still.
        yield { type: 'stand' };
        if (!taken()) {
            yield wait(sneezed ? NOTICE_AFTER_SNEEZE : NOTICE);
        }

        // He looks about, turning the other way every so often.
        if (!taken()) {
            act.say('search', undefined, { force: true });
            let facing = other(act.context().facing ?? 'right');
            for (let turn = 0; turn < TURNS && !taken(); turn++) {
                yield { type: 'face', direction: facing };
                facing = other(facing);
                yield wait(Math.min(TURN, LOOK - turn * TURN));
            }
        }

        // He looks the wrong way first.
        const first = sight(act.context());
        if (!first) {
            return;
        }
        const away = first.cigarette.x > first.monkeyX ? -1 : 1;
        const started = act.context();
        // The 12 s are counted from here, and again from each time the visitor takes the
        // cigarette or lets it go; the time spent suspended (a flee) is not counted.
        let since = started.now;
        let awayThen = started.away?.[SEARCH] ?? 0;
        if (!taken()) {
            yield {
                type: 'walk',
                x: clamp(
                    first.monkeyX + away * WRONG_WAY,
                    MARGIN,
                    first.pageWidth - MARGIN,
                ),
            };
            act.say('search');
        }

        let jumpedAt = -Infinity;
        let wasHeld = false;
        for (;;) {
            // The context read again at each step: the cigarette rolls, and so does he.
            const context = act.context();
            const seen = sight(context);
            if (!seen) {
                return;
            }
            const { now } = context;
            if (seen.held !== wasHeld) {
                wasHeld = seen.held;
                since = now;
                awayThen = context.away?.[SEARCH] ?? 0;
            }
            const x = clamp(
                seen.cigarette.x,
                WALL_MARGIN,
                seen.pageWidth - WALL_MARGIN,
            );
            const dx = x - seen.monkeyX;
            const above = seen.monkeyTop - seen.cigarette.y;
            const high = above > HIGH;
            // On the floor, not on text above it: the cigarette is always on the floor.
            // Lit again, the loop ends on the next turn (no cigarette on the floor); if it lies
            // there still (lost again while the search was suspended), he looks for it again.
            if (
                seen.held &&
                withinReach(
                    seen.cigarette,
                    { x: seen.monkeyX, y: seen.monkeyTop },
                    SNATCH,
                )
            ) {
                // In the visitor's hand but within reach of his head: he takes it.
                yield* light(act, 'snatched');
                yield wait(WAIT_UNDER);
            } else if (
                !seen.held &&
                Math.abs(dx) <= REACHED &&
                !high &&
                seen.onFloor
            ) {
                yield* light(act, 'found');
                yield wait(WAIT_UNDER);
            } else if (
                now - since - ((context.away?.[SEARCH] ?? 0) - awayThen) >=
                GIVE_UP_AFTER
            ) {
                // Out of reach, after 12 s of searching (not of waiting for a flee) or of the
                // visitor holding it: it is gone, a puff of smoke, and he lights another.
                yield* light(act, 'gave up');
                yield wait(WAIT_UNDER);
            } else if (
                // Above his head, he walks under it and jumps just high enough, now and then.
                high &&
                seen.onFloor &&
                Math.abs(dx) < JUMP_RANGE &&
                now - jumpedAt >= JUMP_EVERY
            ) {
                act.say('jump');
                jumpedAt = now;
                yield {
                    type: 'jump',
                    ...jumpFor(above, dx),
                    // Held, it can be snatched in the air as well as on the ground.
                    ...(seen.held ? { reach: SNATCH } : {}),
                };
            } else if (seen.held && Math.abs(dx) > REACHED) {
                yield {
                    type: 'walk',
                    x: seen.monkeyX + clamp(dx, -CHASE_STEP, CHASE_STEP),
                    pace: 'chase',
                };
            } else if (Math.abs(dx) > REACHED) {
                yield { type: 'walk', x };
            } else {
                yield wait(WAIT_UNDER);
            }
        }
    },
});
