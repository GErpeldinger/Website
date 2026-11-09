import { defineBehaviour, type Context } from '../../brain/behaviour';
import type { MonkeyRequest } from '../../ports/monkey';

// How far from the page's edge he stops, as in the prototype.
const MARGIN = 40;

// The edge to run for: the one on the side away from the bomb. Undefined when the event is not a
// bomb or the world does not say where he is and how wide the page is.
const refuge = ({
    trigger,
    pageWidth,
    monkeyX,
}: Context): number | undefined =>
    trigger?.name === 'bomb.placed' &&
    pageWidth !== undefined &&
    monkeyX !== undefined
        ? trigger.payload.at.x > monkeyX ||
          (trigger.payload.at.x === monkeyX && monkeyX >= pageWidth / 2)
            ? MARGIN
            : pageWidth - MARGIN
        : undefined;

export default defineBehaviour<MonkeyRequest>({
    actor: 'monkey',
    kind: 'activity',
    priority: 80,
    triggers: ['bomb.placed'],
    canStart: (context) => refuge(context) !== undefined,
    lines: ['run'],
    *run(context, act) {
        const x = refuge(context);
        if (x === undefined) {
            return;
        }
        act.say('run', undefined, { force: true });
        // However the walk ends, so does he: a blocked way is not tried again.
        yield { type: 'walk', x, pace: 'run' };
    },
});
