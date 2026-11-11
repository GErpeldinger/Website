import { defineBehaviour } from '../../brain/behaviour';
import type { MonkeyRequest } from '../../ports/monkey';

// An ambient behaviour, since it fills idle time and nothing else: while he tidies, searches,
// flees or is held, nothing is idle. Stronger than smoking (0), which it takes the turn from
// when a sneeze is due. The cry, the fear and the search follow from the cigarette's fall.
export default defineBehaviour<MonkeyRequest>({
    actor: 'monkey',
    kind: 'ambient',
    priority: 5,
    triggers: [],
    canStart: ({ sneezeDue, hasCigarette, grounded, free }) =>
        sneezeDue === true &&
        hasCigarette === true &&
        grounded === true &&
        free === true,
    *run() {
        yield { type: 'lose', cause: 'sneeze' };
    },
});
