import { describe, expect, it } from 'vitest';
import { BURNT } from '../../../../../assets/game/activities/monkey/burnt';
import flinch from '../../../../../assets/game/activities/monkey/flinch';
import loseCig from '../../../../../assets/game/activities/monkey/lose_cig';
import type {
    GameEvents,
    HitAgainst,
} from '../../../../../assets/game/events/game_events';
import { stage, type LiveContext } from './stage';

// He has it lit, is free, and the dice are on the table.
const free = (over: LiveContext = {}): LiveContext => ({
    hasCigarette: true,
    free: true,
    roll: 0,
    running: [],
    ...over,
});

const hit = (against: HitAgainst): GameEvents['monkey.hit'] => ({
    speed: 9,
    against,
});

describe('a hit that knocks the cigarette off', () => {
    it('is a reflex that makes it fall, asked of the body’s overlay', () => {
        const { events, motor, log } = stage(
            { lose_cig: loseCig },
            { context: free() },
        );

        events.emit('monkey.hit', hit('piece'));

        expect(log).toEqual(['+monkey/lose_cig']);
        expect(motor.requests).toEqual([{ type: 'lose', cause: 'hit' }]);
        expect(motor.layers).toEqual(['overlay']);
    });

    it('takes the place of the flinch, which would have run on the same hit', () => {
        const { events, motor, log } = stage(
            { lose_cig: loseCig, flinch },
            { context: free() },
        );

        events.emit('monkey.hit', hit('floor'));

        expect(log).toEqual(['+monkey/lose_cig']);
        expect(motor.requests).toEqual([{ type: 'lose', cause: 'hit' }]);
    });

    it('leaves the flinch to a hit that does not', () => {
        const { events, motor, log } = stage(
            { lose_cig: loseCig, flinch },
            { context: free({ roll: 0.9 }) },
        );

        events.emit('monkey.hit', hit('piece'));

        expect(log).toEqual(['+monkey/flinch', 'hurt']);
        expect(motor.requests).toEqual([
            { type: 'mood', mood: 'scared', ms: 900 },
        ]);
    });

    it('falls half the time to a piece: the dice below 0.5', () => {
        const at = (roll: number): boolean =>
            loseCig.canStart({
                actor: 'monkey',
                now: 0,
                ...free({ roll }),
                trigger: { name: 'monkey.hit', payload: hit('piece') },
            });
        expect(at(0.499)).toBe(true);
        expect(at(0.5)).toBe(false);
    });

    it('falls six times in ten to the floor: the dice below 0.6', () => {
        const at = (roll: number): boolean =>
            loseCig.canStart({
                actor: 'monkey',
                now: 0,
                ...free({ roll }),
                trigger: { name: 'monkey.hit', payload: hit('floor') },
            });

        expect(at(0.599)).toBe(true);
        expect(at(0.6)).toBe(false);
    });

    it('does not fall to a bomb, the monkey or anything else', () => {
        for (const against of ['bomb', 'monkey', 'wall'] as const) {
            const { events, motor } = stage(
                { lose_cig: loseCig },
                { context: free() },
            );

            events.emit('monkey.hit', hit(against));

            expect(motor.requests).toEqual([]);
        }
    });

    it('does not fall without the dice being told', () => {
        const { events, motor } = stage(
            { lose_cig: loseCig },
            { context: { hasCigarette: true, free: true } },
        );

        events.emit('monkey.hit', hit('piece'));

        expect(motor.requests).toEqual([]);
    });
});

describe('when he cannot lose it', () => {
    const stays = (over: LiveContext): void => {
        const { events, motor } = stage(
            { lose_cig: loseCig },
            { context: free(over) },
        );

        events.emit('monkey.hit', hit('piece'));

        expect(motor.requests).toEqual([]);
    };

    it('has it already on the floor, or being lit', () => {
        stays({ hasCigarette: false });
    });

    it('does not know whether he has it', () => {
        const without = free();
        delete without.hasCigarette;
        const { events, motor } = stage(
            { lose_cig: loseCig },
            { context: without },
        );

        events.emit('monkey.hit', hit('piece'));

        expect(motor.requests).toEqual([]);
    });

    it('is out of the page or in the visitor’s hand', () => {
        stays({ free: false });
    });

    it('does not know whether he is free', () => {
        const without = free();
        delete without.free;
        const { events, motor } = stage(
            { lose_cig: loseCig },
            { context: without },
        );

        events.emit('monkey.hit', hit('piece'));

        expect(motor.requests).toEqual([]);
    });

    it('is tidying up, whichever way', () => {
        stays({ running: ['monkey/rebuild'] });
        stays({ running: ['monkey/hurry'] });
        stays({ running: ['monkey/lazy_rebuild'] });
    });

    it('is burnt: a blast does not make him lose it', () => {
        stays({ running: [BURNT] });
    });

    it('loses it while something else runs, a flee for one', () => {
        const { events, motor } = stage(
            { lose_cig: loseCig },
            { context: free({ running: ['monkey/flee'] }) },
        );

        events.emit('monkey.hit', hit('floor'));

        expect(motor.requests).toEqual([{ type: 'lose', cause: 'hit' }]);
    });

    it('ignores what is not a hit', () => {
        const { events, motor } = stage(
            { lose_cig: loseCig },
            { context: free() },
        );

        events.emit('monkey.landed', { speed: 9 });

        expect(motor.requests).toEqual([]);
        expect(loseCig.canStart({ actor: 'monkey', now: 0, ...free() })).toBe(
            false,
        );
    });
});
