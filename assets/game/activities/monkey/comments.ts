import { defineReactions } from '../../brain/reaction';

// The prototype said the kind's own line 60% of the time and the general one otherwise: weights 3
// and 2 between reactions of the same priority.
export default defineReactions([
    { actor: 'monkey', on: 'item.grabbed', line: 'grab' },
    {
        actor: 'monkey',
        on: 'item.grabbed',
        where: { kind: 'letter' },
        line: 'letter',
        priority: 1,
        weight: 3,
    },
    {
        actor: 'monkey',
        on: 'item.grabbed',
        where: { kind: 'link' },
        line: 'link',
        priority: 1,
        weight: 3,
    },
    {
        actor: 'monkey',
        on: 'item.grabbed',
        where: { kind: ['letter', 'link'] },
        line: 'grab',
        priority: 1,
        weight: 2,
    },
    { actor: 'monkey', on: 'item.thrown', line: 'drop' },
    { actor: 'monkey', on: 'monkey.grabbed', line: 'me', force: true },
    {
        actor: 'monkey',
        on: 'tool.selected',
        where: { tool: 'bomb' },
        line: 'bombTool',
    },
    { actor: 'monkey', on: 'tornado.started', line: 'stormTool' },
    {
        actor: 'monkey',
        on: 'gravity.changed',
        where: { zero: true },
        line: 'float',
    },
]);
