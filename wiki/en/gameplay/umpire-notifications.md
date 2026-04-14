# Umpire - Notifications

The notification panel helps the **Umpire** quickly find units that need attention.

## Where it appears

- Visible only for the **Umpire** role.
- Hidden after the battle reaches the **End** stage.
- Shown in the bottom-right corner of the battle UI.

## Notification types

### Units with new command

- Shows units marked as having newly assigned commands.
- Useful for quickly reviewing recent command changes.

### Units without command

- Shows units that currently have no active command queue.
- Auto retreat commands are not treated as a normal planned order here.

### Units without ammo

- Shows units with zero ammo that are not in retreat.
- Appears only when **Limited ammunition** is enabled in room settings.

### Messengers without order

- Shows messenger units that currently have no command.
- Helps avoid idle communication units during active play.

## What happens on click

Clicking any notification:

1. selects all units in that category;
2. moves the camera to the center of that group.

This makes it fast to inspect and fix command gaps during war stage.
