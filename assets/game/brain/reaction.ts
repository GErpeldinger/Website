import type { GameEvents } from '../events/game_events';
import type { LineParams } from '../lines/format';
import type {
    Behaviour,
    Context,
    ContextFields,
    Run,
    Act,
    TriggerName,
} from './behaviour';
import { matches, type Match } from './match';

// An actor that says a line when an event happens, written as data. It is a line behaviour
// without the code: the Brain runs it like any other.
export interface Reaction<Name extends TriggerName = TriggerName> {
    readonly actor: string;
    readonly on: Name;
    // The pool of lines it draws from: a key of the translation catalogue.
    readonly line: string;
    // Conditions on the event's payload and on the context, as data.
    readonly where?: Match<GameEvents[Name]>;
    readonly when?: Match<ContextFields>;
    // Parameters for the line's ICU message, read from the context (the trigger included).
    readonly params?: (context: Context) => LineParams;
    // Among the reactions to one event, the highest priority speaks: put the specific case
    // above the general one.
    readonly priority?: number;
    readonly weight?: number;
    readonly cooldown?: number;
    // Plays whatever the speech cooldown says.
    readonly force?: boolean;
}

// Each reaction is checked against the payload of its own event.
export type AnyReaction = {
    [Name in TriggerName]: Reaction<Name>;
}[TriggerName];

// The default export of a reactions file.
export const defineReactions = (
    reactions: readonly AnyReaction[],
): readonly AnyReaction[] => reactions;

export const reactionBehaviour = (
    reaction: AnyReaction,
    id: string,
): Behaviour => {
    const { actor, on, line, where, when, params, force } = reaction;
    return {
        id,
        actor,
        kind: 'line',
        priority: reaction.priority ?? 0,
        weight: reaction.weight,
        cooldown: reaction.cooldown,
        triggers: [on],
        lines: [line],
        canStart: ({ trigger, ...context }) =>
            trigger?.name === on &&
            matches(trigger.payload ?? {}, where ?? {}) &&
            matches(context, when ?? {}),
        // Says the line, with no step to wait for.
        // eslint-disable-next-line require-yield
        *run(context, act: Act): Run {
            act.say(line, params?.(context), { force });
        },
    };
};
