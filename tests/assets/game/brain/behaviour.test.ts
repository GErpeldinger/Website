import { describe, expect, it } from 'vitest';
import {
    defineBehaviour,
    isWait,
    wait,
    type BehaviourSpec,
} from '../../../../assets/game/brain/behaviour';

describe('wait', () => {
    it('is a request the Brain keeps itself', () => {
        expect(wait(250)).toEqual({ type: 'wait', ms: 250 });
        expect(isWait(wait(0))).toBe(true);
        expect(isWait({ type: 'walk' })).toBe(false);
    });
});

describe('defineBehaviour', () => {
    it('hands the declaration back as it is', () => {
        const spec: BehaviourSpec = {
            actor: 'monkey',
            kind: 'reflex',
            priority: 1,
            triggers: ['item.hit'],
            canStart: () => true,
            *run() {
                yield wait(1);
            },
        };

        expect(defineBehaviour(spec)).toBe(spec);
    });
});
