import { defineBehaviour, type Context } from '../../brain/behaviour';
import type { HitAgainst } from '../../events/game_events';
import type { MonkeyRequest } from '../../ports/monkey';
import { BURNT } from './burnt';
import { isRebuilding } from './rebuild/state';

// The odds that a hit makes the cigarette fall, by what he hit, from the prototype: a piece
// thrown at him faster than 7, a fall onto the floor faster than 10 (the world only says
// `monkey.hit` from there). A bomb or anything else does not.
const CHANCES: Partial<Record<HitAgainst, number>> = {
    piece: 0.5,
    floor: 0.6,
};

const knocksItOff = (context: Context): boolean => {
    const { trigger, roll, hasCigarette, free, running } = context;
    return (
        trigger?.name === 'monkey.hit' &&
        roll !== undefined &&
        roll < (CHANCES[trigger.payload.against] ?? 0) &&
        hasCigarette === true &&
        // Out of the page or in the visitor's hand, there is nothing to lose it from.
        free === true &&
        !isRebuilding(context) &&
        // The blast that burnt him also throws him into the floor: it leaves him his stub.
        running?.includes(BURNT) !== true
    );
};

// A reflex stronger than the flinch (10), which a hit that loses the cigarette replaces: one
// event starts one reflex, and the fear and the cry of losing it say more than a plain "Ouch!".
// The world hears the fall, and the search, the face and the words follow from that.
export default defineBehaviour<MonkeyRequest>({
    actor: 'monkey',
    kind: 'reflex',
    priority: 15,
    triggers: ['monkey.hit'],
    canStart: knocksItOff,
    *run() {
        yield { type: 'lose', cause: 'hit' };
    },
});
