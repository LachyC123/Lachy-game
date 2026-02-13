# Ashford: Frontier Kingdom

A 2D top-down mobile-first open-world sandbox RPG set in a grounded 15th-century-inspired frontier kingdom during political instability. Built entirely with HTML, CSS, and vanilla JavaScript — no external libraries, no CDNs, no image assets. Everything is procedurally rendered on Canvas 2D.

## Running the Game

1. Open `index.html` in a modern web browser (Chrome, Firefox, Safari, Edge).
2. No server required — runs directly from the filesystem.
3. For best mobile experience, add to home screen on iOS/Android.

## Controls

### Mobile (Primary)
- **Left side of screen**: Touch and drag to move (virtual joystick)
- **ATK button**: Light attack
- **HVY button**: Heavy attack (costs more stamina, deals more damage)
- **BLK button**: Hold to block (reduces incoming damage, drains stamina)
- **DGE button**: Dodge roll (brief invincibility, costs stamina)
- **USE button**: Interact with nearby NPCs

### Desktop (Secondary)
- **WASD / Arrow Keys**: Move
- **J**: Light attack
- **K**: Heavy attack
- **L**: Block (hold)
- **Space / Left Shift**: Dodge
- **E**: Interact with NPC
- **I**: Toggle inventory
- **F3**: Toggle debug overlay
- **F5**: Quick save
- **F9**: Quick load
- **1-9**: Select dialogue options

## Game Systems

### World
- Procedurally generated 256x256 tile world with chunk streaming
- Garrison town of Ashford (walled, with market, tavern, blacksmith, barracks, castle)
- Two farming villages: Millhaven and Thornfield
- Eastern forest with a hidden bandit camp
- River with bridges, roads connecting settlements
- Day/night cycle (full cycle ~12 real minutes)

### NPCs
- 45+ unique NPCs with names, jobs, homes, and daily schedules
- NPCs move between home, work, and social locations based on time of day
- Behavior states: Idle, Travel, Work, Socialize, Sleep, Flee, Fight, Investigate, Patrol
- Speech bubbles with contextual barks and rumors
- Relationship tracking per NPC

### Combat
- Stamina-based melee: light attacks, heavy attacks, blocking, dodging
- Armor reduces damage but exists as equipment
- Bleeding effect over time
- NPCs fight back, flee, or call for help
- Guards respond to violence
- Combat is dangerous — you can die easily

### Social Hierarchy
- King → Nobles → Guards → Townsfolk → Peasants
- NPC reactions vary based on your clothing and reputation
- Restricted areas (castle interior)
- Guards challenge suspicious players

### Crime & Consequences
- Witnesses detect crimes (assault, murder)
- Night and forests reduce detection range
- Stealth skill reduces detection chance
- Witnesses flee and report to guards
- Guards investigate and pursue
- Bounty system — pay off or fight your way out
- Reputation tracks per-location and per-faction

### Economy
- Trading with merchants (food, weapons, armor, materials)
- Prices fluctuate based on supply and location
- Speech skill affects prices
- Jobs available: wood chopping, grain delivery, field work
- Gold earned through work or "acquired" through other means

### Progression
- Skills increase through use: Sword, Archery, Speech, Stealth
- No XP bars or level-up screens — subtle, organic progression
- Equipment upgrades from the blacksmith

### Save System
- Manual save (F5) and auto-save every 2 minutes
- Saves to localStorage
- Load with F9

## Technical Details
- Vanilla HTML + CSS + JavaScript only
- Zero external dependencies
- All visuals are procedural Canvas 2D
- Runs offline from file://
- 60fps target on mid-range mobile devices
- Spatial hashing for efficient entity queries
- Chunk-based terrain caching for render performance
- Device pixel ratio aware rendering
