import { describe, expect, it } from 'vitest';
import { poseGroups } from '../../../../assets/game/director/poses';

describe('the pose buttons', () => {
    it('has a group of poses, of moods and of walks', () => {
        expect(poseGroups.map(({ name }) => name)).toEqual([
            'Poses',
            'Moods',
            'Walks',
        ]);
        expect(
            poseGroups.map(({ buttons }) => buttons.map(({ label }) => label)),
        ).toEqual([
            ['Stand', 'Smoke', 'Talk', 'Light'],
            ['Calm', 'Scared', 'Cross', 'Proud', 'Burnt'],
            [
                'Walk left',
                'Walk right',
                'Run left',
                'Run right',
                'Chase left',
                'Chase right',
            ],
        ]);
    });

    it('asks for what its label says, and walks near the edges of the page', () => {
        const requests = poseGroups.flatMap(({ buttons }) =>
            buttons.map(({ request }) => request(1000)),
        );

        expect(requests).toContainEqual({
            type: 'pose',
            pose: 'smoke',
            ms: 3000,
        });
        expect(requests).toContainEqual({
            type: 'pose',
            pose: 'light',
            ms: 3000,
        });
        expect(requests).toContainEqual({
            type: 'mood',
            mood: 'proud',
            ms: 3000,
        });
        expect(requests).toContainEqual({
            type: 'mood',
            mood: 'burnt',
            ms: 3000,
        });
        expect(requests).toContainEqual({ type: 'walk', x: 80, pace: 'run' });
        expect(requests).toContainEqual({ type: 'walk', x: 920, pace: 'walk' });
    });
});
