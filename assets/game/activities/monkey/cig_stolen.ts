import { defineBehaviour } from '../../brain/behaviour';
import type { MonkeyRequest } from '../../ports/monkey';

// From the prototype: cross for 2.5 s when the visitor takes the cigarette.
const CROSS_MS = 2500;

// A reflex of its own, not part of `cig_face`: the visitor often takes it while it falls, with the
// fall's face still on, and a trigger is dropped while its behaviour runs. The words are forced.
export default defineBehaviour<MonkeyRequest>({
    actor: 'monkey',
    kind: 'reflex',
    priority: 20,
    triggers: ['cig.grabbed'],
    canStart: ({ trigger }) => trigger?.name === 'cig.grabbed',
    lines: ['stolen'],
    *run(_context, act) {
        act.say('stolen', undefined, { force: true });
        yield { type: 'mood', mood: 'cross', ms: CROSS_MS };
    },
});
