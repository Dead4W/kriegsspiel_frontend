import type {Team} from "@/enums/teamKeys.ts";

export interface PlayerInfo {
  id?: number;
  name: string;
  team: Team;
}
