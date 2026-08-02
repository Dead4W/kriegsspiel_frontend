import { beforeEach, describe, expect, it } from "vitest";
import { Team } from "@/enums/teamKeys";
import type { ConnectionInfo } from "@/engine/types/connectionTypes";
import {
  getAutomatedTeams,
  hasEngineAuthority,
  isAutomatedPlayer,
  isTeamAutomated,
} from "@/engine/authority";

function connectionList(connections: ConnectionInfo[]) {
  return { connections: { value: connections } };
}

beforeEach(() => {
  window.PLAYER = { name: "someone", team: Team.RED };
});

describe("this client's own authority", () => {
  it("gives a person playing a side no authority over the board", () => {
    window.PLAYER = { name: "red commander", team: Team.RED };

    expect(isAutomatedPlayer()).toBe(false);
    expect(hasEngineAuthority()).toBe(false);
  });

  it("gives the umpire's admin client authority", () => {
    window.PLAYER = { name: "umpire", team: Team.ADMIN };

    expect(hasEngineAuthority()).toBe(true);
  });

  it("gives an automated player authority while it still plays a side", () => {
    window.PLAYER = { name: "red commander", team: Team.RED, isBot: true };

    expect(isAutomatedPlayer()).toBe(true);
    expect(hasEngineAuthority()).toBe(true);
    expect(window.PLAYER.team).toBe(Team.RED);
  });

  it("treats a missing flag as a person", () => {
    window.PLAYER = { name: "blue commander", team: Team.BLUE };
    expect(isAutomatedPlayer()).toBe(false);

    window.PLAYER = { name: "blue commander", team: Team.BLUE, isBot: false };
    expect(isAutomatedPlayer()).toBe(false);
  });
});

describe("which teams in the room are automated", () => {
  it("reads the flag off the connection list", () => {
    const world = connectionList([
      { id: 1, team: Team.RED, user: "a person" },
      { id: 2, team: Team.BLUE, user: "a bot", is_bot: true },
    ]);

    expect(getAutomatedTeams(world)).toEqual(new Set([Team.BLUE]));
    expect(isTeamAutomated(world, Team.BLUE)).toBe(true);
    expect(isTeamAutomated(world, Team.RED)).toBe(false);
  });

  it("reports nothing when the client cannot see the connection list", () => {
    const world = connectionList([]);

    expect(getAutomatedTeams(world)).toEqual(new Set());
    expect(isTeamAutomated(world, Team.RED)).toBe(false);
  });

  it("stops calling a team automated once its client is gone", () => {
    const connections: ConnectionInfo[] = [
      { id: 2, team: Team.BLUE, is_bot: true },
    ];
    const world = connectionList(connections);
    expect(isTeamAutomated(world, Team.BLUE)).toBe(true);

    connections.length = 0;
    expect(isTeamAutomated(world, Team.BLUE)).toBe(false);
  });

  it("counts the team as automated when a person shares it with a bot", () => {
    const world = connectionList([
      { id: 1, team: Team.RED, user: "a person" },
      { id: 2, team: Team.RED, user: "a bot", is_bot: true },
    ]);

    expect(isTeamAutomated(world, Team.RED)).toBe(true);
  });

  it("answers no for a team that was never named", () => {
    const world = connectionList([{ id: 2, team: Team.BLUE, is_bot: true }]);

    expect(isTeamAutomated(world, null)).toBe(false);
    expect(isTeamAutomated(world, undefined)).toBe(false);
    expect(isTeamAutomated(world, "")).toBe(false);
  });
});
