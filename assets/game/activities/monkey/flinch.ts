import { defineBehaviour } from '../../brain/behaviour';
import type { MonkeyRequest } from '../../ports/monkey';
import { BURNT } from './burnt';

// The prototype's hurt face lasted 900 ms.
const SCARED_MS = 900;

export default defineBehaviour<MonkeyRequest>({
    actor: 'monkey',
    kind: 'reflex',
    priority: 10,
    triggers: ['monkey.hit'],
    // The blast that burnt him also throws him into the floor: that hit is part of it.
    canStart: ({ trigger, running }) =>
        trigger?.name === 'monkey.hit' && !running?.includes(BURNT),
    lines: ['hurt'],
    *run(_context, act) {
        act.say('hurt');
        yield { type: 'mood', mood: 'scared', ms: SCARED_MS };
    },
});
