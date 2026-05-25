import { unitType } from "@/engine";

interface DeliveryMessage {
  unitIds: string[];
}

interface DeliveryMessenger {
  type: unitType;
  team: string | number;
  messages: DeliveryMessage[];
}

interface DeliverySelectableUnit {
  id: string;
  type: unitType;
  selected: boolean;
  team: string | number;
}

interface BuildDeliverySelectionSnapshotOptions<
  TMessenger extends DeliveryMessenger,
  TUnit extends DeliverySelectableUnit,
> {
  allUnits: TUnit[];
  messengers: TMessenger[];
}

function canReceiveAnyMessengerMessage<TMessenger extends DeliveryMessenger, TUnit extends DeliverySelectableUnit>(
  unit: TUnit,
  messengers: TMessenger[]
): boolean {
  return messengers.some((messenger) => {
    if (messenger.type === unitType.GENERAL) return true;
    return messenger.messages.some((message) => message.unitIds.includes(unit.id));
  });
}

export function buildDeliverySelectionSnapshot<
  TMessenger extends DeliveryMessenger,
  TUnit extends DeliverySelectableUnit,
>(options: BuildDeliverySelectionSnapshotOptions<TMessenger, TUnit>): TUnit[] {
  const { allUnits, messengers } = options;

  if (!messengers.length) return [];
  const messengerTeam = messengers[0].team;

  return allUnits.filter((unit) => {
    if (!unit.selected) return false;
    if (unit.type === unitType.MESSENGER) return false;
    if (unit.team !== messengerTeam) return false;
    if (unit.type === unitType.GENERAL) return true;

    return canReceiveAnyMessengerMessage(unit, messengers);
  });
}
