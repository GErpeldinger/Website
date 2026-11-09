import { defineBehaviour } from '../../brain/behaviour';
import type { MonkeyRequest } from '../../ports/monkey';
import { isLazy } from './rebuild/state';
import { tidy } from './rebuild/tidy';

// Rebuild pressed while he dawdles: he takes the work over, at a run, and goes on after a bomb.
// It is the rebuild's variant for that moment: it interrupts the lazy one, whose state only
// `canStart` can still read.
export default defineBehaviour<MonkeyRequest>({
    actor: 'monkey',
    kind: 'activity',
    priority: 50,
    triggers: ['rebuild.requested'],
    resumes: true,
    canStart: isLazy,
    lines: ['hurry', 'done'],
    *run(_context, act) {
        act.say('hurry', undefined, { force: true });
        yield* tidy(act, { pace: 'run', pause: () => undefined });
        act.say('done', undefined, { force: true });
    },
});
