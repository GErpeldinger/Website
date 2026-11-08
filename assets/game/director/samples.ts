// Stryker disable all: development fixtures, checked by the compiler against the payloads.
import type { GameEvents } from '../events/game_events';

// A payload for each event, to start the director panel's form from. Typed against the event
// list, so a new event cannot be added without one.
export const eventSamples: { [Name in keyof GameEvents]: GameEvents[Name] } = {
    'item.freed': { id: 0, kind: 'block', by: 'impact' },
    'item.grabbed': { id: 0, kind: 'block', at: { x: 500, y: 300 } },
    'item.dropped': { id: 0, kind: 'block' },
    'item.thrown': { id: 0, kind: 'block', speed: 12 },
    'item.hit': { id: 0, kind: 'block', speed: 9, against: 'floor' },
    'item.restored': { id: 0, kind: 'block' },
    'bomb.placed': { id: 1, at: { x: 500, y: 300 } },
    'bomb.cancelled': { id: 1 },
    'bomb.exploded': { id: 1, at: { x: 500, y: 300 }, radius: 260, freed: [0] },
    'tornado.started': { x: 500 },
    'tornado.ended': undefined,
    'gravity.changed': { zero: true },
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
