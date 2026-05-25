import type { FormationType } from "@/engine";
import { getFormationTypes } from "@/engine/resourcePack/formations";

export function getAvailableFormationTypes(): FormationType[] {
  return getFormationTypes();
}
