import type { ClockView } from '../clock/clock';
import type { EventBus } from '../events/event_bus';
import type { Box, GameEvents, Point } from '../events/game_events';
import { Look } from '../look/look';
import { MonkeyMotor } from '../motor/monkey_motor';
import { scrollOffset } from '../page/page';
import type { MonkeyBody } from '../physics/monkey_body';
import type { PhysicsWorld } from '../physics/world';
import { Voice, LINE_TIME } from '../voice/voice';

export interface MonkeyOptions {
    // The scene: the picture and the bubble go into it, outside the content the shake moves.
    host: HTMLElement;
    // The page's physics and his body in it, asked each time: they are built again when the page
    // is measured again.
    world: () => PhysicsWorld;
    body: () => MonkeyBody;
    events: EventBus<GameEvents>;
    clock: ClockView;
    // Every listener carries it.
    signal: AbortSignal;
    // Under reduced motion his eyes stay still.
    reducedMotion: boolean;
    viewport: () => Box;
    // Something needs the loop: a request from outside the game's own events.
    wake: () => void;
    scroll?: () => Point;
}

// The talk lasts with the line, never past its bubble.
const talkTime = (text: string): number =>
    Math.min(LINE_TIME, 600 + 40 * text.length);

// The monkey as a whole: his picture (Look), his bubble (Voice) and his body's driver (Motor),
// wired to each other and to the page. What he does is the Brain's: this only gives it a body.
export class Monkey {
    readonly look: Look;
    readonly motor: MonkeyMotor;
    readonly #voice: Voice;
    readonly #options: MonkeyOptions;
    readonly #unsubscribe: () => void;

    constructor(options: MonkeyOptions) {
        this.#options = options;
        const { host, world, body, events, clock, signal, viewport } = options;
        this.look = new Look(host);
        this.motor = new MonkeyMotor({
            world,
            body,
            look: this.look,
            clock,
            wake: options.wake,
        });
        this.#voice = new Voice({
            host,
            events,
            clock,
            actor: 'monkey',
            anchor: (): Point => body().position,
            viewport,
        });
        // He talks while the line is up: a gesture over whatever he is doing.
        this.#unsubscribe = events.on('line.said', ({ actor, text }) => {
            if (actor === 'monkey') {
                this.motor.perform(
                    { type: 'pose', pose: 'talk', ms: talkTime(text) },
                    () => undefined,
                    'overlay',
                );
            }
        });
        if (!options.reducedMotion) {
            window.addEventListener(
                'pointermove',
                (event) => {
                    const scroll = (options.scroll ?? scrollOffset)();
                    this.look.lookAt({
                        x: event.clientX + scroll.x,
                        y: event.clientY + scroll.y,
                    });
                },
                { signal },
            );
        }
        // The bubble stays inside what the visitor sees.
        window.addEventListener(
            'scroll',
            () => {
                this.#voice.place();
            },
            { signal },
        );
        window.addEventListener(
            'resize',
            () => {
                this.#voice.place(true);
            },
            { signal },
        );
    }

    // The Motor has requests to follow frame by frame.
    get busy(): boolean {
        return this.motor.busy;
    }

    // Once per frame, after the world's step.
    step(elapsed: number): void {
        this.motor.step(elapsed);
        const body = this.#options.body();
        this.look.place(body.position, body.angle);
        this.#voice.place();
    }

    stop(): void {
        this.#unsubscribe();
        this.#voice.stop();
        this.look.remove();
    }
}
