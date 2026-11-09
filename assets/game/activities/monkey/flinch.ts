import { defineBehaviour } from '../../brain/behaviour';
import type { MonkeyRequest } from '../../ports/monkey';

// The prototype's hurt face lasted 900 ms.
const SCARED_MS = 900;

export default defineBehaviour<MonkeyRequest>({
    actor: 'monkey',
    kind: 'reflex',
    priority: 10,
    triggers: ['monkey.hit'],
    canStart: ({ trigger }) => trigger?.name === 'monkey.hit',
    lines: ['hurt'],
    *run(_context, act) {
        act.say('hurt');
        yield { type: 'mood', mood: 'scared', ms: SCARED_MS };
    },
});
