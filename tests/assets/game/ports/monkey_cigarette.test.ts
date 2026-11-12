import { describe, expect, it } from 'vitest';
import { EventBus } from '../../../../assets/game/events/event_bus';
import type { GameEvents } from '../../../../assets/game/events/game_events';
import {
    SNEEZE_LEAST,
    SNEEZE_SPREAD,
    monkeyCigarette,
    withinReach,
    type CigaretteSource,
    type MonkeyCigarette,
} from '../../../../assets/game/ports/monkey_cigarette';

interface Setup {
    events: EventBus<GameEvents>;
    time: { now: number };
    world: MonkeyCigarette;
    cigarette: CigaretteSource;
}

const setup = (draw = 0.5): Setup => {
    const events = new EventBus<GameEvents>();
    const time = { now: 1000 };
    const world: MonkeyCigarette = {
        lit: true,
        lying: undefined,
        held: false,
    };
    const cigarette = monkeyCigarette(
        events,
        () => time.now,
        () => draw,
        () => world,
    );
    return { events, time, world, cigarette };
};

describe('his cigarette, as a context source', () => {
    it('says whether it is lit in his mouth, and where the dropped one lies', () => {
        const { world, cigarette } = setup();
        expect(cigarette.source()).toMatchObject({ hasCigarette: true });

        world.lit = false;
        world.lying = { x: 400, y: 690 };

        expect(cigarette.source()).toMatchObject({
            hasCigarette: false,
            cigarette: { x: 400, y: 690 },
        });
    });

    it('says whether the visitor holds the dropped one', () => {
        const { world, cigarette } = setup();
        expect(cigarette.source().cigaretteHeld).toBe(false);

        world.held = true;

        expect(cigarette.source().cigaretteHeld).toBe(true);
    });

    it('has no cigarette field when he has it in his mouth', () => {
        const { cigarette } = setup();

        expect(Object.keys(cigarette.source()).sort()).toEqual([
            'cigaretteHeld',
            'hasCigarette',
            'sneezeDue',
        ]);
    });
});

describe('the sneeze', () => {
    it('is not due in the first interval, 45 s plus the draw of 30 s from the start', () => {
        const { time, cigarette } = setup(0.5);
        const due = 1000 + SNEEZE_LEAST + 0.5 * SNEEZE_SPREAD;

        time.now = due - 1;
        expect(cigarette.source().sneezeDue).toBe(false);
        time.now = due;
        expect(cigarette.source().sneezeDue).toBe(true);
    });

    it('is due from 45 s at the soonest and 75 s at the latest', () => {
        const soon = setup(0);
        soon.time.now = 1000 + SNEEZE_LEAST;
        expect(soon.cigarette.source().sneezeDue).toBe(true);

        const late = setup(1);
        late.time.now = 1000 + SNEEZE_LEAST + SNEEZE_SPREAD - 1;
        expect(late.cigarette.source().sneezeDue).toBe(false);
        late.time.now = 1000 + SNEEZE_LEAST + SNEEZE_SPREAD;
        expect(late.cigarette.source().sneezeDue).toBe(true);
    });

    it('starts a new interval at every loss', () => {
        const { events, time, cigarette } = setup(0);
        time.now = 1000 + SNEEZE_LEAST;
        expect(cigarette.source().sneezeDue).toBe(true);

        events.emit('cig.lost', { cause: 'hit', at: { x: 0, y: 0 } });

        expect(cigarette.source().sneezeDue).toBe(false);
        time.now += SNEEZE_LEAST - 1;
        expect(cigarette.source().sneezeDue).toBe(false);
        time.now += 1;
        expect(cigarette.source().sneezeDue).toBe(true);
    });

    it('is no longer moved by losses once stopped', () => {
        const { events, time, cigarette } = setup(0);
        cigarette.stop();
        time.now = 1000 + SNEEZE_LEAST;

        events.emit('cig.lost', { cause: 'hit', at: { x: 0, y: 0 } });

        expect(cigarette.source().sneezeDue).toBe(true);
    });
});

describe('the reach of his head', () => {
    const head = { x: 300, y: 600 };

    it('is the straight distance, less than the reach', () => {
        expect(withinReach({ x: 329, y: 600 }, head, 30)).toBe(true);
        expect(withinReach({ x: 330, y: 600 }, head, 30)).toBe(false);
        expect(withinReach({ x: 300, y: 571 }, head, 30)).toBe(true);
        expect(withinReach({ x: 300, y: 570 }, head, 30)).toBe(false);
        expect(withinReach({ x: 300, y: 629 }, head, 30)).toBe(true);
        expect(withinReach({ x: 270, y: 600 }, head, 30)).toBe(false);
    });

    it('is across and up together: 18 and 24 are 30 away', () => {
        expect(withinReach({ x: 318, y: 576 }, head, 30)).toBe(false);
        expect(withinReach({ x: 317, y: 576 }, head, 30)).toBe(true);
    });
});
