import { expect, it } from 'vitest';
import {
    eventSamples,
    requestSamples,
} from '../../../../assets/game/director/samples';

it('has a payload for every event, that survives a trip through JSON', () => {
    const names = Object.keys(eventSamples);

    expect(names).toContain('item.freed');
    expect(names).toContain('line.said');
    for (const sample of Object.values(eventSamples)) {
        if (sample !== undefined) {
            expect(JSON.parse(JSON.stringify(sample))).toEqual(sample);
        }
    }
});

it('has no payload for an event that carries none', () => {
    expect(eventSamples['tornado.ended']).toBeUndefined();
});

it('has a request for each of the monkey’s, that survives a trip through JSON', () => {
    const requests = requestSamples.monkey ?? {};

    expect(Object.keys(requests).sort()).toEqual([
        'carry',
        'drop',
        'enter',
        'face',
        'mood',
        'place',
        'pose',
        'stand',
        'stop',
        'walk',
    ]);
    for (const [type, request] of Object.entries(requests)) {
        expect(request.type).toBe(type);
        expect(JSON.parse(JSON.stringify(request))).toEqual(request);
    }
});
