[2026-05-10]
- Chat - Umpire receive orders only for next tick
- Chat - multiple new messages now have only 1 sound alert
- Auth - Add error message if server down
- DirectView - add chain spread in `COLLISION_RANGE * 2` area
- DirectView - for non-direct visibility update only unit position
- Demo - fix loading last state instead of first snapshot
- Units - add suppression
- Loading - add background animation
- 3D Render - add 3D view when object map url is set
- 3D Render - add object map url for Essex
- 3D Render - Essex example is now live

[2026-05-08]
- Add auto rotate units by move/attack orders

[2026-05-04]
- Add player modal in planning stage
- Chat - bug fixes
- Chat - fix sorting
- Chat - allow editing messages before time skip
- Chat - add avatars
- Chat - add fallback title from Umpire map when unit is not found on map
- Server - Optimizations
- Bug - fix load room stage, weather, time can load with delay
- ResourcePack - Artillery max targets set to 1

[2026-04-27]
- Optimize backend from one thread to multi thread

[2026-04-26]
- Add is ready button for players
- Fix player hp/ammo edit float values
- Fix Disable heightmap & forestmap for players
- Chat improvements
- Add edit chat message

[2026-04-14]
- Add client settings for unit commands
- Add button for hide units
- Save camera
- Add wiki

[2026-04-11]
- Add beta room setting "isPlayerRoomMap"
- Add preview distance for ruler

[2026-04-05]
- Fix empty messenger when start war
- Fix selection update on click unit list in chat

[2026-03-29]
- Fix hotkey events for CTRL modifier
- Fix contextmenu for chat
- Add notification units without ammo
- Fix general view isRetreat
- Fix negative ammo
- Fix edit hp/ammo update
- New message sound

[2026-03-27]
- Massive optimize server
- Fix paint
- Add connections list
- Move Chart & Logs buttons to Umpire tool

[2026-03-22]
- Fix inaccuracy

[2026-03-19]
- Add hotkeys tag
- Add error message on error load map or height map
- Add error message on error load resourcePack
- Improve & optimize demo player
- Fix isRetreat in demo
- UnitSpawn set first by default instead of general
- Disable autoStatsUpdate by default
- Fix isRetreat
- Add rotate unit

[2026-03-18]
- Fix max height for route move order
- Change opacity for move overlay plan order
- Rename "Help" to "Modifiers"
- Disable clear localStorage auth token after error
- Add Google SignIn
- Add profile view
- Add rooms list for profile
- Add profile change nickname
- Add updates list
- Add profile avatar
- Add socket auth token
- Umpire paint is sharing with players
- Paint send before close

[2026-03-16]
- Change move order append by default
- Move order append by default

[2026-03-11]
- Fix time modifiers end in default_resourcepack

[2026-03-07]
- Fix preload unit textures from ResourcePack

[2026-03-03]
 - Move Inaccuracy radius consts to ResourcePack
 - Move morale check rules (retreat/flee) to ResourncePack