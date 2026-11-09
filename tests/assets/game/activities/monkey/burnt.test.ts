import { describe, expect, it } from 'vitest';
import burnt, {
    BURNT,
} from '../../../../../assets/game/activities/monkey/burnt';
import flee from '../../../../../assets/game/activities/monkey/flee';
import flinch from '../../../../../assets/game/activities/monkey/flinch';
import { stage, type LiveContext } from './stage';

describe('the monkey caught in a blast', () => {
    it('has the id the behaviours that give way to it look for', () => {
        const { log, events } = stage({ burnt });

        events.emit('monkey.blasted', { bomb: 1 });

        expect(log).toContain(`+${BURNT}`);
        expect(BURNT).toBe('monkey/burnt');
    });

    it('says a line, even just after another, and looks burnt on the overlay for a few seconds', () => {
        const { events, motor, log } = stage(
            { burnt, flee },
            { context: { pageWidth: 1000, monkeyX: 300 } },
        );
        // He ran from the bomb a moment ago, saying so: the Speaker holds back an ordinary line.
        events.emit('bomb.placed', { id: 3, at: { x: 500, y: 600 } });

        events.emit('monkey.blasted', { bomb: 3 });

        expect(log).toEqual(['+monkey/flee', 'run', '+monkey/burnt', 'burnt']);
        expect(motor.requests.at(-1)).toEqual({
            type: 'mood',
            mood: 'burnt',
            ms: 3500,
        });
        expect(motor.layers.at(-1)).toBe('overlay');

        motor.finish('done', 'overlay');
        expect(log.at(-1)).toBe('-monkey/burnt:done');
    });

    it('ignores what is not a blast on him', () => {
        const { events, motor } = stage({ burnt });

        events.emit('bomb.exploded', {
            id: 1,
            at: { x: 0, y: 0 },
            radius: 100,
            freed: [],
        });

        expect(motor.requests).toEqual([]);
        expect(burnt.canStart({ actor: 'monkey', now: 0 })).toBe(false);
    });

    it('is not cut short by the flinch of the same blast', () => {
        const context: LiveContext = {};
        const { events, motor } = stage({ burnt, flinch }, { context });

        events.emit('monkey.blasted', { bomb: 1 });
        // What the game's activity source reports from `behaviour.started`.
        context.running = [BURNT];
        events.emit('monkey.hit', { speed: 9, against: 'floor' });

        expect(motor.requests).toEqual([
            { type: 'mood', mood: 'burnt', ms: 3500 },
        ]);
    });
});
