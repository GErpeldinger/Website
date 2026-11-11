import { describe, expect, expectTypeOf, it } from 'vitest';
import { MONKEY_WIDTH } from '../../../../assets/game/physics/bodies';
import type { MotorRequest } from '../../../../assets/game/ports/motor';
import {
    WALL_MARGIN,
    type ChosenPose,
    type Facing,
    type Mood,
    type MonkeyRequest,
    type MonkeyRequestType,
    type Pace,
    type Pose,
} from '../../../../assets/game/ports/monkey';

// The monkey's requests have no code: this is their contract, checked by the compiler.
describe('the monkey requests', () => {
    it('name the poses, moods and directions the Look can show', () => {
        expectTypeOf<Pose>().toEqualTypeOf<
            'stand' | 'smoke' | 'talk' | 'light' | 'carry' | 'tumble'
        >();
        expectTypeOf<Mood>().toEqualTypeOf<
            'calm' | 'scared' | 'cross' | 'proud' | 'burnt'
        >();
        expectTypeOf<Facing>().toEqualTypeOf<'left' | 'right'>();
        expectTypeOf<Pace>().toEqualTypeOf<'walk' | 'run'>();
    });

    it('leave the poses that follow the body to the body', () => {
        expectTypeOf<ChosenPose>().toEqualTypeOf<
            'stand' | 'smoke' | 'talk' | 'light'
        >();
    });

    it('are the fifteen the Motor understands', () => {
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
            | 'enter'
            | 'lose'
            | 'jump'
            | 'pickup'
            | 'discard'
            | 'relight'
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
        expectTypeOf<Extract<MonkeyRequest, { type: 'jump' }>>().toEqualTypeOf<{
            type: 'jump';
            vx: number;
            vy: number;
        }>();
    });
});

describe('the wall margin', () => {
    it('is half his width: the body cannot go nearer a wall', () => {
        expect(WALL_MARGIN).toBe(MONKEY_WIDTH / 2);
    });
});
