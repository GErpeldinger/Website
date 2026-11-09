import { defineBehaviour } from '../../brain/behaviour';
import type { MonkeyRequest } from '../../ports/monkey';
import { isLazy } from './rebuild/state';

// The visitor takes a piece while he tidies slowly: he gives up, sulking. An activity, so that it
// takes the body from the lazy rebuild, which is not resumed.
export default defineBehaviour<MonkeyRequest>({
    actor: 'monkey',
    kind: 'activity',
    priority: 60,
    triggers: ['item.grabbed'],
    canStart: isLazy,
    lines: ['lazyStop'],
    *run(_context, act) {
        act.say('lazyStop', undefined, { force: true });
        yield { type: 'mood', mood: 'cross', ms: 1400 };
    },
});
