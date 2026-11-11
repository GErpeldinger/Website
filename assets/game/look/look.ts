import '../../styles/blocks/monkey.css';
import type { Point } from '../events/game_events';
import type { CigaretteLook, Facing, Mood, Pace, Pose } from '../ports/monkey';
import art from './monkey.svg?raw';

// What the art shows, one data attribute each (docs/monkey-art.md): the CSS does the rest.
export interface Appearance {
    pose: Pose;
    mood: Mood;
    facing: Facing;
    // How his legs step, whatever the upper body does; none when he stands.
    gait: Pace | undefined;
    // The visitor has him in hand.
    held: boolean;
    cigarette: CigaretteLook;
}

// The art is drawn in a 56 x 72 frame shown at that size in CSS pixels, so a position in the
// frame is a position on the page.
const FRAME = { width: 56, height: 72 };
// How far the glow of his eyes moves towards the pointer, in the art's units.
const GLANCE = 3;

// The monkey's picture: the SVG, placed on the page and set to a pose, a mood and a way of facing,
// with his eyes on the pointer. It decides none of them: the Motor does.
export class Look {
    readonly element: SVGSVGElement;
    readonly #pupils: SVGElement[];
    #at: Point | undefined;
    #target: Point | undefined;
    #facing: Facing = 'right';

    // The picture is parsed from `source`, the art of the monkey unless a test brings its own.
    constructor(host: HTMLElement, source: string = art) {
        const template = document.createElement('template');
        template.innerHTML = source;
        const element = template.content.querySelector('svg');
        if (!element) {
            throw new Error('The monkey art has no <svg>.');
        }
        this.element = element;
        this.#pupils = [...element.querySelectorAll<SVGElement>('.pupil')];
        this.show({
            pose: 'stand',
            mood: 'calm',
            facing: 'right',
            gait: undefined,
            held: false,
            cigarette: 'lit',
        });
        host.append(element);
    }

    show({ pose, mood, facing, gait, held, cigarette }: Appearance): void {
        const { dataset } = this.element;
        dataset.pose = pose;
        dataset.mood = mood;
        dataset.facing = facing;
        dataset.state = held ? 'held' : 'free';
        if (cigarette === 'lit') {
            delete dataset.cigarette;
        } else {
            dataset.cigarette = cigarette;
        }
        if (gait) {
            dataset.walking = gait;
        } else {
            delete dataset.walking;
        }
        this.#facing = facing;
        this.#glance();
    }

    // His centre on the page, and how far he is turned.
    place(at: Point, angle: number): void {
        this.#at = at;
        this.element.style.transform = `translate(${(at.x - FRAME.width / 2).toFixed(1)}px, ${(at.y - FRAME.height / 2).toFixed(1)}px) rotate(${angle.toFixed(3)}rad)`;
        this.#glance();
    }

    // Where the pointer is, on the page; undefined when his eyes should rest.
    lookAt(target: Point | undefined): void {
        this.#target = target;
        this.#glance();
    }

    contains(target: EventTarget | null): boolean {
        return target instanceof Node && this.element.contains(target);
    }

    remove(): void {
        this.element.remove();
    }

    // The eye glow moves towards the target, mirrored when he faces left (the art is flipped).
    #glance(): void {
        const at = this.#at;
        const target = this.#target;
        for (const pupil of this.#pupils) {
            if (!at || !target) {
                pupil.removeAttribute('transform');
                continue;
            }
            const dx = target.x - at.x;
            const dy = target.y - (at.y - 4);
            const distance = Math.hypot(dx, dy) || 1;
            const sideways = (dx / distance) * GLANCE;
            const down = (dy / distance) * GLANCE;
            pupil.setAttribute(
                'transform',
                `translate(${(this.#facing === 'left' ? -sideways : sideways).toFixed(1)} ${down.toFixed(1)})`,
            );
        }
    }
}
