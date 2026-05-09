# Suppression mechanic

Suppression is a rule that temporarily blocks a unit from firing when enemy fire pressure on that unit becomes too high.

In short: a unit can be alive, in range, and have ammo, but still **not shoot** while suppression is above its threshold.

## Why it exists

- Adds tactical depth: not only damage matters, fire control matters too.
- Lets you pin dangerous enemies even if you cannot burst them down quickly.
- Rewards focused fire on key units.
- Creates meaningful choices between direct damage and temporary denial.

## When a unit is suppressed

The check runs during attack command updates.

A unit cannot fire when:

`total incoming suppression >= suppressionThreshold`

If this condition is not met, attack proceeds normally.

## How suppression is calculated

For each enemy unit with an attack command, the engine adds a contribution:

- Base: `damage × (current HP / maxHp) × damageModifier`.
- If attacker splits fire across multiple priority targets, suppression is divided by target count.
- For inaccuracy/artillery fire, contribution depends on blast radius and whether the target is inside it.

Note: suppression is calculated separately from final HP damage.

## Configuration

Set threshold in resource pack per unit type:

- `units.types[].params.suppressionThreshold`

Behavior:

- Not set: suppression disabled for that unit type.
- `0`: unit is effectively unable to attack.
- `> 0`: normal suppression behavior with this threshold.
