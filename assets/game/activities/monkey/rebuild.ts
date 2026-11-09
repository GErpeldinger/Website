import { defineBehaviour } from '../../brain/behaviour';
import type { MonkeyRequest } from '../../ports/monkey';
import { hasWork, isHurrying, isLazy } from './rebuild/state';
import { tidy } from './rebuild/tidy';

// The prototype said a word about the work on the third piece, then on every seventh after it.
const SAYS_BUILD_EVERY = 7;
const SAYS_BUILD_AT = 3;

// Stronger than smoking and the lazy rebuild, weaker than fleeing a bomb, which it resumes after.
export default defineBehaviour<MonkeyRequest>({
    actor: 'monkey',
    kind: 'activity',
    priority: 50,
    triggers: ['rebuild.requested'],
    resumes: true,
    // `monkey/hurry` takes the request when he is already tidying, slowly. With nothing to bring home
    // it would only say `back` and `done`.
    canStart: (context) =>
        hasWork(context) && !isLazy(context) && !isHurrying(context),
    lines: ['back', 'build', 'done'],
    *run(_context, act) {
        act.say('back', undefined, { force: true });
        yield* tidy(act, {
            pace: 'run',
            pause: (placed) =>
                placed % SAYS_BUILD_EVERY === SAYS_BUILD_AT
                    ? { line: 'build' }
                    : undefined,
        });
        act.say('done', undefined, { force: true });
    },
});
