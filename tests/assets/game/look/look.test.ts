import { afterEach, describe, expect, it } from 'vitest';
import { Look, type Appearance } from '../../../../assets/game/look/look';
import type { Mood } from '../../../../assets/game/ports/monkey';

const hosts: HTMLElement[] = [];

const mount = (source?: string): { look: Look; host: HTMLElement } => {
    const host = document.createElement('div');
    document.body.append(host);
    hosts.push(host);
    return { look: new Look(host, source), host };
};

afterEach(() => {
    for (const host of hosts.splice(0)) {
        host.remove();
    }
});

const calm: Appearance = {
    pose: 'stand',
    mood: 'calm',
    facing: 'right',
    gait: undefined,
    held: false,
};

const pupils = (look: Look): SVGElement[] => [
    ...look.element.querySelectorAll<SVGElement>('.pupil'),
];

describe('the art', () => {
    it('goes into the host, hidden from assistive technology: it is no content', () => {
        const { look, host } = mount();

        expect(host.firstElementChild).toBe(look.element);
        expect(look.element.tagName.toLowerCase()).toBe('svg');
        expect(look.element.classList.contains('monkey')).toBe(true);
        expect(look.element.getAttribute('aria-hidden')).toBe('true');
        expect(look.element.getAttribute('focusable')).toBe('false');
        expect(look.element.getAttribute('viewBox')).toBe('0 0 56 72');
    });

    it('is made of the parts the stylesheet moves', () => {
        const { look } = mount();
        const parts = [
            '.flip .pose .breath .tail',
            '.leg-a',
            '.leg-b',
            '.arms-up',
            '.head',
            '.eyes-white',
            '.eyes-red .iris',
            '.eyes-red .brows',
            '.shades .pupil',
            '.flip > .speed path',
            '.cig .ember',
            '.cig-smoke .puff',
            '.exhale circle',
            '.arm-l .upper .fore',
            '.arm-r .upper .fore .cig-hand',
        ];

        for (const part of parts) {
            expect(look.element.querySelector(part), part).not.toBeNull();
        }
        expect(look.element.querySelectorAll('.cig-smoke .puff')).toHaveLength(
            3,
        );
        expect(look.element.querySelectorAll('.exhale circle')).toHaveLength(4);
    });

    it('has a mouth for each mood, and the one for talking', () => {
        const { look } = mount();
        const moods = {
            calm: 0,
            scared: 0,
            cross: 0,
            proud: 0,
        } satisfies Record<Mood, number>;

        for (const mood of Object.keys(moods)) {
            expect(
                look.element.querySelector(`.mouth-${mood}`),
                mood,
            ).not.toBeNull();
        }
        expect(look.element.querySelector('.mouth-talk')).not.toBeNull();
    });

    it('has the two white dots of the eyes’ glow on the glasses, and no more', () => {
        const { look } = mount();

        expect(pupils(look)).toHaveLength(2);
        for (const pupil of pupils(look)) {
            expect(pupil.closest('.shades')).not.toBeNull();
        }
    });

    it('is refused, with a reason, when the art holds no picture', () => {
        expect(() => mount('<p>no picture</p>')).toThrow(
            'The monkey art has no <svg>.',
        );
    });
});

describe('what it shows', () => {
    it('starts standing, calm, facing right, on his feet', () => {
        const { look } = mount();
        const { dataset } = look.element;

        expect(dataset.pose).toBe('stand');
        expect(dataset.mood).toBe('calm');
        expect(dataset.facing).toBe('right');
        expect(dataset.state).toBe('free');
        expect(look.element.hasAttribute('data-walking')).toBe(false);
    });

    it('writes the pose, the mood and the way he faces as data attributes', () => {
        const { look } = mount();

        look.show({
            pose: 'carry',
            mood: 'scared',
            facing: 'left',
            gait: undefined,
            held: false,
        });

        expect(look.element.dataset.pose).toBe('carry');
        expect(look.element.dataset.mood).toBe('scared');
        expect(look.element.dataset.facing).toBe('left');
    });

    it('says how his legs step, and when they stop', () => {
        const { look } = mount();

        look.show({ ...calm, gait: 'walk' });
        expect(look.element.getAttribute('data-walking')).toBe('walk');

        look.show({ ...calm, gait: 'run' });
        expect(look.element.getAttribute('data-walking')).toBe('run');

        look.show(calm);
        expect(look.element.hasAttribute('data-walking')).toBe(false);
    });

    it('says when the visitor has him in hand, and when he is let go', () => {
        const { look } = mount();

        look.show({ ...calm, held: true });
        expect(look.element.dataset.state).toBe('held');

        look.show(calm);
        expect(look.element.dataset.state).toBe('free');
    });
});

describe('placing him', () => {
    it('puts the middle of the frame on his centre, turned by the body’s angle', () => {
        const { look } = mount();

        look.place({ x: 300, y: 665 }, 0.12345);

        expect(look.element.style.transform).toBe(
            'translate(272.0px, 629.0px) rotate(0.123rad)',
        );
    });

    it('keeps one decimal of position and three of angle', () => {
        const { look } = mount();

        look.place({ x: 100.26, y: 200.74 }, -0.0004);

        expect(look.element.style.transform).toBe(
            'translate(72.3px, 164.7px) rotate(-0.000rad)',
        );
    });
});

describe('his eyes', () => {
    const glance = (look: Look): (string | null)[] =>
        pupils(look).map((pupil) => pupil.getAttribute('transform'));

    it('rest until he is placed and told where to look', () => {
        const { look } = mount();

        look.lookAt({ x: 500, y: 300 });
        expect(glance(look)).toEqual([null, null]);

        const other = mount().look;
        other.place({ x: 300, y: 665 }, 0);
        expect(glance(other)).toEqual([null, null]);
    });

    it('move 3 units towards the pointer, from a little above his centre', () => {
        const { look } = mount();
        look.place({ x: 300, y: 665 }, 0);

        look.lookAt({ x: 600, y: 661 });
        expect(glance(look)).toEqual([
            'translate(3.0 0.0)',
            'translate(3.0 0.0)',
        ]);

        look.lookAt({ x: 300, y: 0 });
        expect(glance(look)).toEqual([
            'translate(0.0 -3.0)',
            'translate(0.0 -3.0)',
        ]);

        look.lookAt({ x: 300, y: 1000 });
        expect(glance(look)).toEqual([
            'translate(0.0 3.0)',
            'translate(0.0 3.0)',
        ]);
    });

    it('go diagonally by the same distance', () => {
        const { look } = mount();
        look.place({ x: 300, y: 665 }, 0);

        look.lookAt({ x: 400, y: 761 });

        expect(glance(look)[0]).toBe('translate(2.1 2.1)');
    });

    it('turn the other way when he faces left, since the art is flipped', () => {
        const { look } = mount();
        look.place({ x: 300, y: 665 }, 0);
        look.lookAt({ x: 600, y: 661 });

        look.show({ ...calm, facing: 'left' });

        expect(glance(look)[0]).toBe('translate(-3.0 0.0)');

        look.show({ ...calm, facing: 'right' });
        expect(glance(look)[0]).toBe('translate(3.0 0.0)');
    });

    it('follow him when he moves, and the pointer when it does', () => {
        const { look } = mount();
        look.lookAt({ x: 600, y: 661 });

        look.place({ x: 300, y: 665 }, 0);
        expect(glance(look)[0]).toBe('translate(3.0 0.0)');

        look.place({ x: 900, y: 665 }, 0);
        expect(glance(look)[0]).toBe('translate(-3.0 0.0)');
    });

    it('do not blow up when the pointer is on the spot he looks from', () => {
        const { look } = mount();
        look.place({ x: 300, y: 665 }, 0);

        look.lookAt({ x: 300, y: 661 });

        expect(glance(look)[0]).toBe('translate(0.0 0.0)');
    });

    it('rest again when the pointer is gone', () => {
        const { look } = mount();
        look.place({ x: 300, y: 665 }, 0);
        look.lookAt({ x: 600, y: 661 });

        look.lookAt(undefined);

        expect(glance(look)).toEqual([null, null]);
    });
});

describe('the pointer on him', () => {
    it('is on him when it is on the picture or any part of it', () => {
        const { look } = mount();
        const part = look.element.querySelector('.head');

        expect(look.contains(look.element)).toBe(true);
        expect(look.contains(part)).toBe(true);
    });

    it('is not on him anywhere else', () => {
        const { look, host } = mount();

        expect(look.contains(host)).toBe(false);
        expect(look.contains(document.body)).toBe(false);
        expect(look.contains(null)).toBe(false);
        expect(look.contains(window)).toBe(false);
    });
});

describe('removing him', () => {
    it('takes the picture out of the page', () => {
        const { look, host } = mount();

        look.remove();

        expect(host.children).toHaveLength(0);
    });
});
