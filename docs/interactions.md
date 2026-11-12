# Interactions

How the page plays: who is on it, what the visitor can do, and how everyone reacts. The code structure behind it is in [architecture.md](architecture.md), the monkey's look in [monkey-art.md](monkey-art.md). The behaviour kinds used below (reflex, activity, ambient, line) are the ones architecture.md defines.

> Draft. The open points are listed at the end; each moves to Decisions, to [ideas.md](ideas.md) or out once settled.

## Scope

This page is the target. The first version is the prototype's game in the real codebase, without the hologram or the new cast:

- **Look:** the prototype's dark page, two columns, the ground strip and the dock. The scene keeps an empty background layer for the hologram.
- **Visitor:** grab and throw any content piece (a long press on touch), bomb, tornado, zero gravity, Rebuild.
- **Monkey:** walks, smokes in idle time, comments on grabs, drops and hits (French and English lines), flinches when hit, flees a bomb and is burnt when it catches him, loses his cigarette (a hit, a hard fall, a sneeze), searches for it and relights it, chases it and snatches it back when the visitor holds it, and puts every piece back on Rebuild.
- **Development:** the director panel, in development builds only.

Next, each as new behaviour files on the same engine: super-monkey, hanging and climbing, then the hologram and the drone, Naïa, the sky, the car, the time of day, patience and the first-visit tutorial.

## Cast

| Who          | What it is                                                                                                                                  | Can the visitor grab it?       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Content      | The real website, in front: name, role, links, photo, intro, counters board. Real colours, always readable, made of physics pieces.         | Yes, every piece               |
| Background   | A hologram the drone projects behind the content: a village, the monkey's house with his bed, a garage, trees, the ground.                  | No, it follows the drone       |
| Monkey       | Real. Looks after the site, comments on everything, walks on both planes. The only voice, in French and English.                            | Yes                            |
| Drone        | Real. Hovers at the top and projects the background. Mute: it reacts with its eyes and small beeps drawn as cues.                           | Yes                            |
| Naïa         | The owner's cat. Real and invincible.                                                                                                       | No, she is always one step off |
| Car          | The monkey's, parked by the garage: the owner's red 2022 Peugeot 308 hybrid, drawn without its badge. How he leaves when he has had enough. | No                             |
| Birds        | Real, a different kind for each time of day. Fly over, land on the content, the drone or the sleeping monkey.                               | No, they fly off               |
| Airliners    | Real, high in the sky behind the hologram, on the air route above the owner's home. Slow, blinking lights, a contrail.                      | No                             |
| Fighter jets | Real, rare: low and fast, with a rumble that shakes the whole page.                                                                         | No                             |

## Two planes

- **Foreground:** the content and the ground strip under it. The physics world: pieces fall, collide and get carried here.
- **Background:** the hologram, behind the content. The monkey and Naïa can walk into it along a path, getting smaller, and stand, sit or sleep on what it shows.
- The drone projects only the background. The content never sways, glitches or blurs, whatever happens to the hologram.
- When the background goes out, whatever stood on it falls to the foreground floor.
- **Sky:** the real sky behind the hologram, where the birds and planes fly. It stays when the background goes out.

## Time of day

The scene follows the time at the owner's home in France (`Europe/Paris`), so a visitor sees his place as it is right now: day, dusk or night.

| Time  | Sky                                 | Birds                                                    | Planes                                     |
| ----- | ----------------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| Day   | Light                               | Sparrows and pigeons; a magpie now and then              | Airliners with contrails; the fighter jets |
| Dusk  | Warm, then darkening                | Swallows, then bats                                      | Airliners, lights coming on                |
| Night | Dark, the hologram at its brightest | An owl on the house roof, turning its head to the cursor | Airliners as blinking lights only          |

## The living content

The content is a real page, but it is never inert:

- **Weight:** a word dips and springs back when the monkey or Naïa lands on it; letters squash under his steps.
- **Light:** pieces cast shadows away from the drone. Drag the drone and the shadows swing with it.
- **Care:** the monkey maintains it in idle time: he straightens a crooked letter, polishes the photo frame, pushes back a link that slipped.
- **Traces:** a bomb leaves scorch marks until the next rebuild.
- **Live data:** the board counts what every visitor does, live, and shows how many are online.

## What the visitor can do

The dock is a real remote, not part of the hologram. It is plain buttons, hidden until the game runs. With Bomb or Tornado chosen, a press on the scene places it there; picking either with the keyboard fires it at the middle of the screen; Escape goes back to Grab. Under reduced motion the Tornado is not offered.

| Tool         | Effect                                                                               |
| ------------ | ------------------------------------------------------------------------------------ |
| Grab         | The default. Drag and throw a content piece, the monkey, the drone or his cigarette. |
| Bomb         | Place a bomb; it blows up after a short fuse.                                        |
| Tornado      | A vortex that sweeps loose pieces around.                                            |
| Zero gravity | Everything floats until switched off.                                                |
| Rebuild      | The monkey puts the page back together.                                              |

## Reactions

| The visitor…                     | Monkey                                                                                                                                                                                                           | Drone and background                                                                                                                                              | Counter   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| grabs a content piece            | Line ("Repose ça." / "Put that back."), with special lines for a letter of the name, a link, the board. Walks under the held piece.                                                                              | —                                                                                                                                                                 | Throws    |
| throws a piece at the monkey     | Reflex: flinch, "Aïe !" / "Ouch!". Half the time, from 7 px per step, he loses his cigarette instead (see the cigarette arc).                                                                                    | —                                                                                                                                                                 | —         |
| grabs the monkey                 | Line ("Lâche-moi !" / "Let go of me!"). Grabs the edge of any element he is dragged past; a hard pull frees it; let go, he climbs on it and perches.                                                             | —                                                                                                                                                                 | —         |
| grabs the drone                  | If asleep in the house, falls with the bed, lands and comes to the front to tell the visitor off ("Je DORMAIS !" / "I was SLEEPING!").                                                                           | Startled eyes. The background follows its cone and shears; dragged far or shaken, it goes out. Released, the drone drifts back and re-projects with a scan sweep. | —         |
| tries to grab Naïa               | "Hé ! Joue pas avec mon chat !" / "Hey! Don't play with my cat!"                                                                                                                                                 | —                                                                                                                                                                 | —         |
| grabs his dropped cigarette      | Chases it, jumps for it, snatches it back if the cursor comes close. See the cigarette arc.                                                                                                                      | —                                                                                                                                                                 | —         |
| places a bomb                    | Runs for it ("ÇA VA PÉTER !" / "IT'S GONNA BLOW!").                                                                                                                                                              | Panics upwards; the background flickers.                                                                                                                          | Bombs     |
| bombs the monkey himself         | Reflex: burnt for a few seconds (soot, frizzed hair, a cracked lens, a stub for a cigarette, a cough), "C’était ma dernière clope." / "That was my last cigarette."                                              | —                                                                                                                                                                 | —         |
| throws the monkey off the page   | After 1.5 s out of it (top or a side) he is put back, with a line that depends on where he went ("J’ai vu le soleil de près. Il fume moins que moi." / "I’ve seen the sun up close. It smokes less than I do."). | —                                                                                                                                                                 | —         |
| starts a tornado                 | Holds on to something, "Il y a du vent, non ?" / "Is it me, or is it windy?"                                                                                                                                     | Pulled in, spins; the background spins with it.                                                                                                                   | Tornadoes |
| switches gravity off             | Floats, cigarette in hand, "Qui a coupé la gravité ?" / "Who turned off gravity?"                                                                                                                                | Unaffected.                                                                                                                                                       | —         |
| presses Rebuild                  | Comes back if away and carries every piece home. Pressed again while he dawdles, he hurries.                                                                                                                     | Projects a ghost outline of each piece's home.                                                                                                                    | Repairs   |
| wrecks something he just rebuilt | "Sérieusement ?! Je venais de finir ça !" / "Seriously?! I just finished that!"                                                                                                                                  | —                                                                                                                                                                 | —         |

Naïa ignores all of it: a bomb throws her and she lands on her feet and licks a paw, she sits calmly in the middle of a tornado, and she floats asleep, curled up, in zero gravity.

Birds fly off when the cursor comes close and scatter at a bomb or a tornado. The planes take no part: no tool reaches the sky.

## Arcs

### Idle life

Ambient behaviours, all giving way to anything the visitor does:

- **Monkey:** smokes, watches the cursor, polishes his sunglasses, does his chores on the content. Now and then he sneezes his cigarette out, which starts the cigarette arc.
- **Naïa:** roams both planes, falls asleep on a content piece (that piece cannot be grabbed while she is on it), pushes a letter off the page now and then, and sometimes takes the monkey's bed.
- **Birds:** land on a letter, the drone or the sleeping monkey's head. The monkey shoos them off the content; Naïa stalks them and never catches one. The magpie goes for shiny things: it can make off with his lighter, and he chases it.
- **Airliners:** cross the sky now and then, high and slow. Sometimes the monkey looks up and follows one.
- **Fighter jets:** by day only, rare, at most once every few minutes. A low pass with a rumble: the content trembles and a crooked piece may fall, the drone wobbles, the birds scatter, the monkey ducks and covers his ears (and may drop his cigarette). Naïa does not even look up.
- **Bedtime:** after a long quiet, the monkey walks into the background, into the house, and goes to sleep. Once the scene is still, the loop stops (see architecture.md, Lifecycle).

### The cigarette

**Built (part 1).** He loses it to a loose piece faster than 7 px per step (one time in two), to a fall onto the floor faster than 10 (six times in ten), or to a sneeze while he is idle (every 45 to 75 s, never in the first interval), and never while he rebuilds, is out of the page or is held. A blast does not make him lose it: it leaves him a burnt stub. The cigarette falls on the page, a small stick with an ember and a wisp of smoke that a bomb nudges and a tornado sweeps up. He cries out, scared for 1.6 s, stands still for 0.7 s (0.9 after a sneeze), looks about for 1.5 s turning every 0.4 s, looks the wrong way first, then walks to it and, if it is over his head, jumps for it. Reached, he says so, lights it with his gold lighter for 1.9 s, and is proud for 1.8 s. A flee or a trip out of the page only delays the search, which goes on afterwards; after 12 s without reaching it (too high, say) he gives up in a puff of smoke and lights another. Measuring the page again gives him his cigarette back.

**Built (part 2).** A press within 22 px of the dropped cigarette takes it in hand, whatever the tool: it follows the cursor and is thrown on release. He is cross for 2.5 s ("Hé ! Rends-moi ça !" / "Hey! Give that back!", "C’est MA clope !" / "That’s MY smoke!", "Tu fumes, toi ?" / "Since when do you smoke?"), skips what remains of the notice and the look, and goes for it faster (4.2 px per step against 3), jumping when it is over his head. Once it comes within 30 px of his head he takes it, says "Ha ! Récupérée." / "Ha! Got it back." or "Trop lent." / "Too slow.", is proud and lights it. If the visitor keeps it 12 s, he gives up as before (a puff of smoke, a new cigarette). Let go and lying again, the search goes on with 12 s of its own.

**To come.** Kept from him too long, he turns super-monkey: angry, no cigarette, and flies at the cursor to take it back.

### Patience

One meter ties the escalation together. Annoyances fill it: grabbing him, waking him, wrecking a fresh rebuild, keeping his cigarette, bombing in a row. Leaving him alone drains it.

| Level   | How it shows                                                                             |
| ------- | ---------------------------------------------------------------------------------------- |
| Calm    | Normal lines, rebuilds lazily when he starts on his own.                                 |
| Annoyed | Cross face, sharper lines.                                                               |
| Fed up  | Leaves in the car (below).                                                               |
| Rage    | Transforms (gold fur, red eyes), charges, and fires the beam that blasts the page apart. |

### Leaving in a huff

He walks to his car and drives out of frame: "Je rentre. Appelle-moi quand t'as fini." / "I'm going home. Call me when you're done." Naïa sometimes rides along. The page stays as it is. After a while he drives back to peek ("C'est fini ? Il y a un bouton Reconstruire, tu sais." / "Are you done? There's a Rebuild button, you know."); pressing Rebuild brings him back with a honk.

### The beam-up

The drone fetches him and lowers him back with its beam: after a rage, or when he falls asleep in the foreground instead of the house.

## The director panel

The panel that fires any event or behaviour on demand, built for development, ships in production as an easter egg.

- **Built so far:** the development version, a plain panel in development builds only (see architecture.md, The behaviour engine). The easter-egg version below comes later, on the same engine.
- **Where:** behind a maintenance hatch on the drone, opened by clicking or tapping the small screw beside it.
- **Found:** the monkey rushes over: "Hé hé hé, touche pas à ça, c'est pour le développement !" / "Hey hey hey, don't touch that, it's for development!" A beat later he gives up ("Bon… mais tu dis rien à personne." / "Fine… but you didn't see this.") and the panel opens.
- **Used:** whatever the visitor fires, he reacts as if it were real, with a line now and then about cheating.
- **Local only:** events fired from the panel never reach the shared counters and never go over the network to other players.

## Open points

- The clock: the owner's time in France (as above), or the visitor's own?
- The hologram by day: a cyan glow reads strongly on a dark sky, weakly on a light one. A design question for the next step.
- Patience as the backbone of the escalation, as above?
- Pure sandbox, or something to discover (hidden reactions counted somewhere)? Proposed: sandbox.
- After the rage beam: does he rebuild, or does the drone fetch him and the visitor rebuild?
- The cigarette: he gives up after 12 s and lights a new one, as the prototype did, whether the cigarette lies out of reach or the visitor holds it. Does super-monkey replace that for a cigarette the visitor keeps?
- Does Naïa ever "speak" (a "Mrrp" bubble), or stay silent like the drone?

## Decisions

- **The content is a real website, the background a hologram.** The page stays readable and accessible whatever happens, and the fiction explains why the background can vanish while the content only breaks.
- **The drone is the source of the hologram**, over a stage rig or a pillar from orbit: it is a character the gags can use, and it only takes the top of the page. The study is in `design/scene/`.
- **One voice.** Only the monkey talks; the drone and Naïa act. It keeps the copy to one character in two languages.
- **The owner's real surroundings.** His car, his cat, the air route above his home and the fighter jets that pass make the scene his rather than a generic playground. The car is drawn without its badge, as the special forms carry no franchise marks.
- **No tool reaches the planes.** Bombing or throwing things at aircraft, airliners above all, is not a joke the page makes.
- **The director panel ships, local only.** One tool serves development and makes a reward for the curious. Keeping its events off the counters and the network means a visitor can't inflate the shared numbers or spam other players with it.
- **Naïa is invincible.** A character the visitor cannot break gives the monkey something to protect, and the page a constant amid the chaos.
