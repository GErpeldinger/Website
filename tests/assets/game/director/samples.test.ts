import { expect, it } from 'vitest';
import { eventSamples } from '../../../../assets/game/director/samples';

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
