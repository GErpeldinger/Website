# The monkey's art

The monkey is a small vector character: an SVG drawn in a 56 × 72 frame and shown 72 px tall, the prototype's monkey kept shape for shape with a new look. He has warm grey fur, a messy swept mop, a pointed goatee, a tail and a dark hoodie printed with `>_`. His sunglasses carry two white dots, the glow of his eyes behind them. A cigarette with a glowing ember sits in the corner of his mouth, and he lights it with a gold Zippo.

## Construction

- **Parts:** legs, two-part arms (shoulder, elbow, hand), the hoodie, a head group (ears, skull, hair, face, goatee, eyes, glasses, mouths, cigarette) and the tail. Props (laptop, hammer, Zippo, cape, energy beam) are hidden parts that a state shows.
- **States** in the workbench are classes on the root `svg` (`walk`, `smoking`, `carry`…) plus `data-mood` (`calm`, `scared`, `cross`, `proud`; the site adds `burnt`). In the site (`assets/game/look/monkey.svg`, `assets/styles/blocks/monkey.css`) they are data attributes: `data-pose` (`stand`, `smoke`, `talk`, `carry`, `tumble`), `data-mood`, `data-facing` (`left` or `right`), `data-walking` (his legs: absent when he stands, `walk` or `run`) and `data-state` (`held`). Every animation is CSS transforms on those parts, and none runs under reduced motion. Ported so far: standing, walking, running (the legs, arms, body lean, tail, smoke and the wind lines, `.speed`, which the workbench draws outside `.pose` and the site's art now has too), smoking, talking, carrying, tumbling, the four moods and burnt (soot on the fur, face and legs, frizzed hair, a cracked lens, a stub for the cigarette, and a cough with a puff of soot: a fifth mood, `data-mood='burnt'`, with the cross mouth, whatever the pose; the cough and the smoulder are off under reduced motion); the rest comes with the behaviours that need it. The eyes' white dots follow the pointer from the Look.
- **The workbench**, [design/monkey/index.html](../design/monkey/index.html), shows every state grouped by the moment that triggers it, plus a walk at real size in the hologram. Changes start there; the site's module is built from it.

## Animation palette

| Trigger                         | States                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Idle                            | Calm, smoking, looking around, yawning, impatient, talking                                                  |
| Moving, or sent flying          | Walking, running (from the bomb), jumping, tumbling (thrown), floating (zero gravity), blown away (tornado) |
| Reactions                       | Scared, glasses gone, dizzy, burnt (bomb), sneezing (loses the cigarette), searching, shrugging, waving     |
| Work and rest                   | Hammering, carrying or hanging, lighting up, sitting, coding, napping, celebrating (rebuild done)           |
| The visitor keeps his cigarette | Super-monkey: transformation, then flying after it                                                          |
| The page is broken too often    | Rage: power-up, charging, a beam that wipes the page                                                        |

## Rules

- **The cigarette** is in his mouth by default; in his hand when he talks, tumbles or floats; gone while he searches for it and as super-monkey; a burnt stub after the bomb.
- **Eyes:** once the glasses lift or fly off, his real eyes show and they are red (dark sclera, red iris). Lifted glasses lose their two white dots.
- **Colour:** he stays warm (fur, ember, gold) against the cyan hologram. The rage beam is the hologram's own cyan.

## Decisions

- **The prototype's minimal monkey, not a realistic one.** Three richer routes were tried on 2026-11-08 and dropped. Realistic Gemini art cut into a 2D rig drifted between edits and showed halos, wrong angles and a paper-puppet look. An image-to-3D model (Meshy) with a scripted Blender rig, three.js and a Matter ragdoll worked as a pipeline, but scripted animation stayed stiff and wrong (props not held, edges not gripped); doing it well takes an animator or motion capture. Four drawn-in-code 2D styles were judged too complex. The minimal style reads at 72 px, animates cleanly in CSS, weighs kilobytes, and maps one shape to one ragdoll body.
- **Generated source images and models are not kept**: the repository is public, and nothing in the current art derives from them.
- **The special forms are tropes, not copies.** Super-monkey has a cape and a `>_` badge, never a franchise's shield or colours; the rage form borrows a golden great ape's colours (gold fur, tan face, red eyes) but keeps his shape. No franchise names appear on the site.
- **A bitten pear on the laptop, never an apple.** A wink at the MacBook that stays a parody.
- **No reference upload, no artist names.** The owner's avatar inspires his traits and attitude only.
