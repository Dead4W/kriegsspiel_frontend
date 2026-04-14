# Umpire - Orders

Orders are how you control selected units during battle.

## Who can issue orders

- The order panel is available to the **Umpire** side.
- Open battle room, select units, then use the command buttons at the bottom.

## Standard order flow

1. Select one unit or a group from the same side.
2. Open an order (button or context action).
3. Set targets/parameters.
4. Confirm with **Apply** (or **E / Enter**).

Use **Q / Esc** to close the active order without applying.

## Command buttons and hotkeys

- **1** - Toggle **Auto-attack** for selected units.
- **2** - **Attack** (pick enemy targets, supports ability modifiers).
- **3** - **Change formation**.
- **4** - **Wait** (set delay and optional comment).
- **5** - **Retreat** (sets retreat duration and replaces current queue).
- **+ / -** - Increase/decrease selected units morale.
- **C** - Clear planned commands for selected units.

## Context orders (right mouse button)

- **RMB on empty ground** - open/extend a **Move** route.
- **RMB on enemy unit** - open **Attack** for the selected group (if at least one attacker is in range).
- **RMB with messengers on a friendly unit** - open **Delivery**.

### Move route details

- Add route points with RMB.
- Each point can get an environment modifier (terrain/state icon menu).
- Enable **Patrol** to loop movement.
- Confirm route with **Apply**.

## Notes

- Orders are queued on units, so you can plan multi-step behavior.
- Attack runs in parallel: a unit can move and attack at the same time.
- Attack, wait, move, and other commands can be combined in sequence.
- Keep command queues clean with **C** when plans change quickly.
