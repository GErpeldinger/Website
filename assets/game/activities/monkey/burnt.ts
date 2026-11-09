import { defineBehaviour } from '../../brain/behaviour';
import type { MonkeyRequest } from '../../ports/monkey';

// This behaviour's id (a behaviour's id is its path), for those that give way to it.
export const BURNT = 'monkey/burnt';

// The soot stays long enough for the workbench's cough, which comes every 3.2 s.
const BURNT_MS = 3500;

// A reflex: he goes on with whatever he was doing (fleeing, mostly), looking burnt. The line is
// forced: the flee's was said a moment before the bomb went off.
export default defineBehaviour<MonkeyRequest>({
    actor: 'monkey',
    kind: 'reflex',
    priority: 20,
    triggers: ['monkey.blasted'],
    canStart: ({ trigger }) => trigger?.name === 'monkey.blasted',
    lines: ['burnt'],
    *run(_context, act) {
        act.say('burnt', undefined, { force: true });
        yield { type: 'mood', mood: 'burnt', ms: BURNT_MS };
    },
});
