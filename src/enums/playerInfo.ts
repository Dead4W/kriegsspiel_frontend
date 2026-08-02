import type {Team} from "@/enums/teamKeys.ts";

export interface PlayerInfo {
  id?: number;
  name: string;
  team: Team;
  /**
   * Set when this client is an automated player rather than a person at a
   * screen. It changes nothing about what the server will accept from it — see
   * `engine/authority.ts` for what it does change.
   */
  isBot?: boolean;
}
