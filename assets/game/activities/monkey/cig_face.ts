import { defineBehaviour } from '../../brain/behaviour';
import type { MonkeyRequest } from '../../ports/monkey';

// From the prototype: scared for 1.6 s when it falls, proud for 1.8 s once it is lit again.
const SCARED_MS = 1600;
const PROUD_MS = 1800;

// A reflex: the word and the face that go with losing the cigarette and lighting it again, over
// whatever he is doing (he searches, or flees, with that face). The words are forced: the moment
// is the point. The visitor taking it and his snatching it back are reflexes of their own
// (`cig_stolen`, `cig_snatched`): a trigger is dropped while its behaviour runs, and the fall's
// face lasts 1.6 s.
export default defineBehaviour<MonkeyRequest>({
    actor: 'monkey',
    kind: 'reflex',
    priority: 20,
    triggers: ['cig.lost', 'cig.lit'],
    canStart: ({ trigger }) =>
        trigger?.name === 'cig.lost' || trigger?.name === 'cig.lit',
    lines: ['lostCig', 'sneeze', 'lit'],
    *run({ trigger }, act) {
        if (trigger?.name === 'cig.lost') {
            act.say(
                trigger.payload.cause === 'sneeze' ? 'sneeze' : 'lostCig',
                undefined,
                { force: true },
            );
            yield { type: 'mood', mood: 'scared', ms: SCARED_MS };
        } else if (trigger?.name === 'cig.lit') {
            act.say('lit', undefined, { force: true });
            yield { type: 'mood', mood: 'proud', ms: PROUD_MS };
        }
    },
});
