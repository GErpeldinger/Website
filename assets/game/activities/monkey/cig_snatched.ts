import { defineBehaviour } from '../../brain/behaviour';
import type { MonkeyRequest } from '../../ports/monkey';

// From the prototype: proud for 1.8 s when he takes the cigarette back.
const PROUD_MS = 1800;

// A reflex of its own, like `cig_stolen`: it may follow the theft within 2.5 s, while that is
// still running. The words are forced.
export default defineBehaviour<MonkeyRequest>({
    actor: 'monkey',
    kind: 'reflex',
    priority: 20,
    triggers: ['cig.snatched'],
    canStart: ({ trigger }) => trigger?.name === 'cig.snatched',
    lines: ['snatched'],
    *run(_context, act) {
        act.say('snatched', undefined, { force: true });
        yield { type: 'mood', mood: 'proud', ms: PROUD_MS };
    },
});
