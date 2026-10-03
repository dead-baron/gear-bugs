# GEAR BUGS

An 8-bit spider adventure in a single HTML file. Crawl on any surface (walls, ceilings, upside down), swing on elastic web ropes, catch golden flies, and take down six bosses. Or battle up to three friends online.

All the pixel art, the font and the sound effects are generated in code. You only need the one file to play.

## Play

**▶ [Play in your browser](https://deadbaron.com/gear-bugs/)**

On a phone the game switches to full screen the first time you tap it. For the best experience, use **Add to Home Screen** (Android: Chrome menu → *Install app*; iPhone: Share → *Add to Home Screen*). It then launches full screen in landscape like an app.

It works on desktop, tablet and phone (landscape is best) with keyboard + mouse, a game controller, or touch. The original prototype is still there as [`classic.html`](https://deadbaron.com/gear-bugs/classic.html).

## Campaign

Travel across a Super Mario World–style map. Locked areas stay hidden under fog until you clear the level before them. Every attempt gets a new pseudo-random layout.

| Level | Biome | Enemy |
|---|---|---|
| 1 | Grassy Field | **Lizard**: a slow chaser that climbs walls but not ceilings, aims its head at you and strikes with its tongue |
| 2 | Flower Meadow | **Beehive**: up to 3 bees that hunt you only when they can see you. A web knocks any bee out of the sky |
| 3 | Tropical Island | **Gecko**: fast, jumps a lot, climbs every surface and has a very long tongue. The sea on both sides is instant defeat |
| 4 | Old Barn & Wheat Field | **Black Widow**: a boss that dashes or pounces when it sees you, spits webs that stun you (mash buttons to break free), and kills with one bite |
| 5 | Gear Factory | **Daddy Long Legs** (boss): a robot spider on long telescoping legs that grab floors, walls, ceilings and platforms. It stalks slowly, then chases and stabs with a leg when you get close. Web a leg to lock it, bite it to tear it off. With every leg gone, the body rolls, bounces and jumps at you until you web it and bite it |
| 6 | Desert Anthill | **Queen Ant**: ants trickle out of the ant hill, slowly at first and then faster, and every ant raises the sand floor. Catch the 5th fly and the nest bursts: a swarm, flying ants and the crowned Queen pour out until she falls. Ants wander and only attack when you get close; one web squashes an ant or a flying ant. Web the Queen, then bite her |

Now and then a rare **glowing red butterfly** flutters in after the first 10 seconds. Grab it or web it to win back a heart.

In every level, catch **5 golden flies** to power up (web a fly to reel it in). Then web the enemy to trap it and crawl over to bite it. It drops a **Star Coin**, which you keep for good in your inventory. The factory has moving lifts and conveyor belts that carry you along. Beat the Queen Ant to reach the ending screen.

The difficulties are **Easy, Medium, Hard and HELL MODE**. In HELL MODE enemies react almost instantly, have glowing red eyes and sometimes breathe fire. The fire slowly spreads along wooden platforms.

**Practice** lets you play any of the six levels on any difficulty, with an optional infinite-hearts mode. Nothing is saved.

## VS mode (up to 4 players)

- **Quick Play** puts you in a lobby with other real players (no bots) and keeps searching for more, up to 4. Once a second player arrives, the match starts after 60 seconds, or as soon as everyone presses **START**. Players who join mid-match spectate until the round ends, then play from the next round.
- **Private Room** lets you host a room with a 4-letter code or an invite link (`?room=CODE`), or play an offline bot match.
- The modes are **1v1, 2v2 Teams and 4-player Free-For-All**. A match is 6 rounds: Field → Meadow → Island → Barn → Factory → Anthill. In the Factory round a 4-legged Daddy Long Legs roams the arena: tear off a leg for bonus points, or finish its rolling body for a big score. In the Anthill round the first player to 5 flies bursts the nest: squash ants for points and take down the Queen for a big score.
- The first to 5 flies powers up. A powered web freezes a rival so you can bite them out of the round. Webs fired before you're powered up only slow rivals down.
- You score points for flies, for taking out each level's creature and for eliminations. After round 4 a leaderboard shows everyone's wins and points.

Networking is peer-to-peer WebRTC through Trystero (Nostr strategy) with STUN + TURN. There is no game server. **Network Test** in the main menu checks whether your connection can join matches.

## Controls

| Action | Keyboard + mouse | Controller | Touch |
|---|---|---|---|
| Crawl / climb / sprint | WASD or arrows (keep holding to sprint) | Left stick or D-pad | Floating stick on the left |
| Jump / let go of the rope | Space | A | JUMP |
| Shoot web | Click (aims at the cursor), or J / K / F / X | RB, RT, LB or X (aim with the right stick) | Drag WEB to aim and release, or tap the world |
| Reel in / let out the rope | Up / Down while swinging | Stick up / down | Stick up / down |
| Break free of webs | Mash any button | Mash any button | Mash the buttons |
| Pause | Esc or P | Start | ❚❚ (top right) |

## Development

The source is split into modules in [`src/`](src). `build.py` joins them into `index.html` and stamps a build time. Players with an old cached copy see a **NEW VERSION READY** button.

```
python3 build.py
```
