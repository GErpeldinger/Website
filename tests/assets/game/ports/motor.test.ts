import { describe, expect, expectTypeOf, it } from 'vitest';
import { FakeMotor } from '../../../../assets/game/ports/fake_motor';
import type {
    Layer,
    Motor,
    MotorRequest,
    MotorTask,
    Outcome,
} from '../../../../assets/game/ports/motor';

// The port has no code: these are its contract, checked by the compiler.
describe('the Motor port', () => {
    it('asks for a request, a way to hear the end, and a layer, and gives back a task to cancel', () => {
        expectTypeOf<Motor['perform']>().parameters.toEqualTypeOf<
            [MotorRequest, (outcome: Outcome) => void, Layer]
        >();
        expectTypeOf<Motor['perform']>().returns.toEqualTypeOf<MotorTask>();
        expectTypeOf<MotorTask['cancel']>().toEqualTypeOf<() => void>();
        expectTypeOf<Outcome>().toEqualTypeOf<'done' | 'failed'>();
        expectTypeOf<Layer>().toEqualTypeOf<'body' | 'overlay'>();
    });

    it('is satisfied by the fake one, and by a Motor of one actor’s own requests', () => {
        interface Hop extends MotorRequest {
            type: 'hop';
            height: number;
        }
        const fake: Motor = new FakeMotor();
        const hopper: Motor<Hop> = {
            perform: (request, done): MotorTask => {
                expectTypeOf(request).toEqualTypeOf<Hop>();
                done('done');
                return { cancel: (): void => undefined };
            },
        };
        // Where requests are not told apart, such a Motor stands in.
        const anywhere: Motor = hopper;

        expect(fake).toBeInstanceOf(FakeMotor);
        expect(anywhere).toBe(hopper);
    });
});
