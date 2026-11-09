import { defineBehaviour } from '../../brain/behaviour';
import type { MonkeyRequest } from '../../ports/monkey';
import { isLazy } from './rebuild/state';

// How long after a piece is put home that breaking another is wrecking his work: he rebuilds one
// piece every few seconds, so this covers the rebuild itself and a moment after it.
const WINDOW_MS = 10_000;

// A reflex: he is cross while he goes on. During a lazy rebuild the visitor's grab is for
// `lazy_stop` to answer. Not more than once in a while, as a bomb frees several pieces at once.
export default defineBehaviour<MonkeyRequest>({
    actor: 'monkey',
    kind: 'reflex',
    priority: 10,
    triggers: ['item.freed'],
    cooldown: 4000,
    canStart: (context) => {
        const { trigger, restoredAt, now } = context;
        const grabbed =
            trigger?.name === 'item.freed' && trigger.payload.by === 'grab';
        return (
            !(grabbed && isLazy(context)) &&
            restoredAt !== undefined &&
            now - restoredAt <= WINDOW_MS
        );
    },
    lines: ['cancel'],
    *run(_context, act) {
        act.say('cancel', undefined, { force: true });
        yield { type: 'mood', mood: 'cross', ms: 2000 };
    },
});
