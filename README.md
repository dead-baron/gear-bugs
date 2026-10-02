# GEAR BUGS

An 8-bit spider adventure in a single HTML file. Crawl on any surface (walls, ceilings, upside down), swing on elastic web ropes, catch golden flies, and take down four bosses. Or battle up to three friends online.

All the pixel art, the font and the sound effects are generated in code. You only need the one file to play.

## Play

**▶ [Play in your browser](https://deadbaron.com/gear-bugs/)**

It works on desktop, tablet and phone (landscape is best) with keyboard + mouse, a game controller, or touch. The original prototype is still there as [`classic.html`](https://deadbaron.com/gear-bugs/classic.html).

## Campaign

Travel across a Super Mario World–style map. Locked areas stay hidden under fog until you clear the level before them. Every attempt gets a new pseudo-random layout.

| Level | Biome | Enemy |
|---|---|---|
| 1 | Grassy Field | **Lizard**: a slow chaser that climbs walls but not ceilings, aims its head at you and strikes with its tongue |
| 2 | Flower Meadow | **Beehive**: up to 3 bees that hunt you only when they can see you. A web knocks any bee out of the sky |
| 3 | Tropical Island | **Gecko**: fast, jumps a lot, climbs every surface and has a very long tongue. The sea on both sides is instant defeat |
| 4 | Old Barn & Wheat Field | **Black Widow**: a boss that dashes or pounces when it sees you, spits webs that stun you (mash buttons to break free), and kills with one bite |

In every level, catch **5 golden flies** to power up (web a fly to reel it in). Then web the enemy to trap it and crawl over to bite it. It drops a **Star Coin**, which you keep for good in your inventory. Beat the Black Widow to reach the ending screen.

The difficulties are **Easy, Medium, Hard and HELL MODE**. In HELL MODE enemies react almost instantly, have glowing red eyes and sometimes breathe fire. The fire slowly spreads along wooden platforms.

## VS mode (up to 4 players)

- **Quick Play** drops you into an open lobby with other players and keeps searching for more while you practise on a warm-up field. The match starts as soon as everyone presses **START**, or 30 seconds after a second player arrives. Bots fill any empty slots.
- **Private Room** lets you host a room with a 4-letter code or an invite link (`?room=CODE`), or play an offline bot match.
- The modes are **1v1, 2v2 Teams and 4-player Free-For-All**. A match is 4 rounds: Field → Meadow → Island → Barn.
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
