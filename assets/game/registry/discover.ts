import type { Behaviour, BehaviourSpec } from '../brain/behaviour';
import { reactionBehaviour, type AnyReaction } from '../brain/reaction';

const isSpec = (value: unknown): value is BehaviourSpec =>
    typeof value === 'object' &&
    value !== null &&
    'run' in value &&
    typeof value.run === 'function';

// Turns the modules of the activities folder into behaviours. The file is the id: the actor's
// folder, then the file's name, so two behaviours cannot clash and a behaviour declares nothing
// twice. A file exports one behaviour by default, or a list of reactions.
export const discover = (
    modules: Readonly<Record<string, unknown>>,
): Behaviour[] =>
    Object.keys(modules)
        .sort()
        .flatMap((path) => {
            // The last folder and the file, without its extension.
            const id = /([^/]+\/[^/]+)\.ts$/u.exec(path)?.[1];
            if (id === undefined) {
                throw new Error(`${path} is not in an actor folder.`);
            }
            const exported = (
                modules[path] as { default?: unknown } | undefined
            )?.default;
            const declared = Array.isArray(exported)
                ? (exported as AnyReaction[]).map((reaction, index) => ({
                      actor: reaction.actor,
                      behaviour: reactionBehaviour(
                          reaction,
                          `${id}#${String(index)}`,
                      ),
                  }))
                : isSpec(exported)
                  ? [{ actor: exported.actor, behaviour: { ...exported, id } }]
                  : undefined;
            if (declared === undefined) {
                throw new Error(
                    `${path} must export a behaviour (defineBehaviour) or reactions (defineReactions) by default.`,
                );
            }
            return declared.map(({ actor, behaviour }) => {
                if (!id.startsWith(`${actor}/`)) {
                    throw new Error(
                        `${path} declares the actor "${actor}" but sits at "${id}": a behaviour lives in its actor's folder.`,
                    );
                }
                return behaviour;
            });
        });
