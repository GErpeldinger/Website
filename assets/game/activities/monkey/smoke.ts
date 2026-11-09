import { defineBehaviour } from '../../brain/behaviour';
import type { MonkeyRequest } from '../../ports/monkey';

// A timed pose is a game timer, not a frame request: the loop sleeps through it, though the
// Brain is busy.
const SMOKE_MS = 6000;

export default defineBehaviour<MonkeyRequest>({
    actor: 'monkey',
    kind: 'ambient',
    priority: 0,
    triggers: [],
    canStart: () => true,
    *run() {
        yield { type: 'pose', pose: 'smoke', ms: SMOKE_MS };
    },
});
