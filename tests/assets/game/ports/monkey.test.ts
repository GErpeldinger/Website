import { describe, expectTypeOf, it } from 'vitest';
import type { MotorRequest } from '../../../../assets/game/ports/motor';
import type {
    ChosenPose,
    Facing,
    Mood,
    MonkeyRequest,
    MonkeyRequestType,
    Pace,
    Pose,
} from '../../../../assets/game/ports/monkey';

// The monkey's requests have no code: this is their contract, checked by the compiler.
describe('the monkey requests', () => {
    it('name the poses, moods and directions the Look can show', () => {
        expectTypeOf<Pose>().toEqualTypeOf<
            'stand' | 'smoke' | 'talk' | 'carry' | 'tumble'
        >();
        expectTypeOf<Mood>().toEqualTypeOf<
            'calm' | 'scared' | 'cross' | 'proud'
        >();
        expectTypeOf<Facing>().toEqualTypeOf<'left' | 'right'>();
        expectTypeOf<Pace>().toEqualTypeOf<'walk' | 'run'>();
    });

    it('leave the poses that follow the body to the body', () => {
        expectTypeOf<ChosenPose>().toEqualTypeOf<'stand' | 'smoke' | 'talk'>();
    });

    it('are the nine the Motor understands', () => {
        expectTypeOf<MonkeyRequestType>().toEqualTypeOf<
            | 'walk'
            | 'face'
            | 'stand'
            | 'stop'
            | 'pose'
            | 'mood'
            | 'carry'
            | 'place'
            | 'drop'
        >();
    });

    it('are the requests of a Motor of the monkey', () => {
        expectTypeOf<MonkeyRequest>().toExtend<MotorRequest>();
        expectTypeOf<Extract<MonkeyRequest, { type: 'walk' }>>().toEqualTypeOf<{
            type: 'walk';
            x: number;
            pace?: Pace;
        }>();
        expectTypeOf<
            Extract<MonkeyRequest, { type: 'carry' }>
        >().toEqualTypeOf<{
            type: 'carry';
            piece: number;
            pace?: Pace;
        }>();
    });
});
