// Stryker disable all: development fixtures, checked by the compiler against the payloads.
import type { GameEvents } from '../events/game_events';
import type { MonkeyRequest, MonkeyRequestType } from '../ports/monkey';
import type { MotorRequest } from '../ports/motor';

// A payload for each event, to start the director panel's form from. Typed against the event
// list, so a new event cannot be added without one.
export const eventSamples: { [Name in keyof GameEvents]: GameEvents[Name] } = {
    'item.freed': { id: 0, kind: 'block', by: 'impact' },
    'item.grabbed': { id: 0, kind: 'block', at: { x: 500, y: 300 } },
    'item.dropped': { id: 0, kind: 'block' },
    'item.thrown': { id: 0, kind: 'block', speed: 12 },
    'item.hit': { id: 0, kind: 'block', speed: 9, against: 'floor' },
    'item.restored': { id: 0, kind: 'block' },
    'monkey.grabbed': { at: { x: 300, y: 650 } },
    'monkey.dropped': undefined,
    'monkey.thrown': { speed: 12 },
    'monkey.landed': { speed: 8 },
    'monkey.hit': { speed: 9, against: 'piece' },
    'monkey.left': { side: 'top' },
    'monkey.blasted': { bomb: 1 },
    'cig.lost': { cause: 'hit', at: { x: 500, y: 690 } },
    'cig.discarded': { at: { x: 500, y: 690 } },
    'cig.lit': undefined,
    'tool.selected': { tool: 'bomb' },
    'bomb.placed': { id: 1, at: { x: 500, y: 300 } },
    'bomb.cancelled': { id: 1 },
    'bomb.exploded': { id: 1, at: { x: 500, y: 300 }, radius: 260, freed: [0] },
    'tornado.started': { x: 500 },
    'tornado.ended': undefined,
    'gravity.changed': { zero: true },
    'rebuild.requested': undefined,
    'visitor.idle': undefined,
    'behaviour.started': {
        actor: 'monkey',
        id: 'monkey/example',
        kind: 'activity',
        resumed: false,
    },
    'behaviour.ended': {
        actor: 'monkey',
        id: 'monkey/example',
        kind: 'activity',
        by: 'done',
    },
    'line.said': { actor: 'monkey', key: 'example', text: 'An example.' },
};

// A request for each of the monkey's, typed against the list so that a new request cannot be
// added without one.
const monkeySamples: {
    [Type in MonkeyRequestType]: Extract<MonkeyRequest, { type: Type }>;
} = {
    walk: { type: 'walk', x: 600, pace: 'walk' },
    face: { type: 'face', direction: 'left' },
    stand: { type: 'stand' },
    stop: { type: 'stop' },
    pose: { type: 'pose', pose: 'smoke', ms: 4000 },
    mood: { type: 'mood', mood: 'scared', ms: 1500 },
    carry: { type: 'carry', piece: 0, pace: 'walk' },
    place: { type: 'place', piece: 0, pace: 'walk' },
    drop: { type: 'drop' },
    enter: { type: 'enter', from: 'top' },
    lose: { type: 'lose', cause: 'hit' },
    jump: { type: 'jump', vx: 2, vy: -10 },
    pickup: { type: 'pickup' },
    discard: { type: 'discard' },
    relight: { type: 'relight' },
};

// The requests of each actor whose Motor the panel can drive, by the name the actor goes by.
export const requestSamples: Record<string, Record<string, MotorRequest>> = {
    monkey: monkeySamples,
};
