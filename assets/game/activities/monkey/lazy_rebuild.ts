import { defineBehaviour } from '../../brain/behaviour';
import type { MonkeyRequest } from '../../ports/monkey';
import { hasWork } from './rebuild/state';
import { tidy } from './rebuild/tidy';

// He rests (and grumbles) after every second piece, for as long as the prototype's pauses
// lasted on average.
const REST_EVERY = 2;
const REST_MS = 2200;

// Left alone with broken pieces, he tidies up by himself, slowly. Weaker than a pressed Rebuild,
// which makes him hurry, and than the visitor touching a piece, which stops him.
export default defineBehaviour<MonkeyRequest>({
    actor: 'monkey',
    kind: 'activity',
    priority: 40,
    triggers: ['visitor.idle'],
    canStart: (context) => hasWork(context) && context.reducedMotion !== true,
    lines: ['lazyBack', 'lazy', 'lazyDone'],
    *run(_context, act) {
        act.say('lazyBack', undefined, { force: true });
        yield* tidy(act, {
            pace: 'walk',
            pause: (placed) =>
                placed % REST_EVERY === 0
                    ? { line: 'lazy', ms: REST_MS }
                    : undefined,
        });
        act.say('lazyDone', undefined, { force: true });
    },
});
