import { defineBehaviour } from '../../brain/behaviour';
import type { MonkeyRequest } from '../../ports/monkey';

// How far he walks in from the edge he came back by.
const WALK_IN = 90;

// He was out of the page for a while: he says where he has been and is put back. An activity,
// since it asks the body; above the flee (80), as a bomb is no reason to run from where he is
// not. What he was doing (the rebuild resumes) goes on afterwards.
export default defineBehaviour<MonkeyRequest>({
    actor: 'monkey',
    kind: 'activity',
    priority: 90,
    triggers: ['monkey.left'],
    canStart: ({ trigger }) => trigger?.name === 'monkey.left',
    lines: ['backTop', 'backSide'],
    *run({ trigger }, act) {
        if (trigger?.name !== 'monkey.left') {
            return;
        }
        const { side } = trigger.payload;
        act.say(side === 'top' ? 'backTop' : 'backSide', undefined, {
            force: true,
        });
        yield { type: 'enter', from: side };
        if (side === 'top') {
            return;
        }
        // The context read now, not the one the behaviour started with: he was elsewhere then.
        const { monkeyX } = act.context();
        if (monkeyX !== undefined) {
            yield {
                type: 'walk',
                x: monkeyX + (side === 'left' ? WALK_IN : -WALK_IN),
            };
        }
    },
});
