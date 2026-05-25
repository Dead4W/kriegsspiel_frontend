import { RoomGameStage } from "@/enums/roomStage.ts";
import { ROOM_SETTING_KEYS, type RoomSettingKey } from "@/enums/roomSettingsKeys.ts";
import { Team } from "@/enums/teamKeys.ts";

export function getPlayerTeam(): Team | null {
  return window.PLAYER?.team ?? null;
}

export function isAdminTeam(team: Team | null = getPlayerTeam()): boolean {
  return team === Team.ADMIN;
}

export function isSpectatorTeam(team: Team | null = getPlayerTeam()): boolean {
  return team === Team.SPECTATOR;
}

export function isAdminOrSpectatorTeam(team: Team | null = getPlayerTeam()): boolean {
  return isAdminTeam(team) || isSpectatorTeam(team);
}

export function isRedOrBlueTeam(team: Team | null = getPlayerTeam()): boolean {
  return team === Team.RED || team === Team.BLUE;
}

function isStage(stage: RoomGameStage, currentStage = window.ROOM_WORLD?.stage): boolean {
  return currentStage === stage;
}

export function isWarStage(): boolean {
  return isStage(RoomGameStage.WAR);
}

export function isPlanningStage(): boolean {
  return isStage(RoomGameStage.PLANNING);
}

export function isEndStage(): boolean {
  return isStage(RoomGameStage.END);
}

export function isRoomSettingEnabled(setting: RoomSettingKey): boolean {
  return !!window.ROOM_SETTINGS?.[setting];
}

export function isTimeModifiersEnabled(): boolean {
  return isRoomSettingEnabled(ROOM_SETTING_KEYS.TIME_MODIFIERS);
}

export function isWeatherModifiersEnabled(): boolean {
  return isRoomSettingEnabled(ROOM_SETTING_KEYS.WEATHER_MODIFIERS);
}

export function isPlayerRoomMapEnabled(): boolean {
  return isRoomSettingEnabled(ROOM_SETTING_KEYS.IS_PLAYER_ROOM_MAP);
}
