import "@/engine";
import { beforeEach, describe, expect, it } from "vitest";
import { Team } from "@/enums/teamKeys";
import { RoomGameStage } from "@/enums/roomStage";
import { ChatMessageStatus, type ChatMessage } from "@/engine/types/chatMessage";
import { autoSpawnMessengerForIncomingOrder } from "@/engine/units/messengerChatLogic";

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "order-1",
    author: "red general",
    author_team: Team.RED,
    unitIds: ["line"],
    text: "advance",
    time: "1882-06-12 09:00:00",
    team: Team.RED,
    status: ChatMessageStatus.Sent,
    delivered: true,
    deliveryStatus: "pending",
    ...overrides,
  };
}

beforeEach(() => {
  window.PLAYER = { name: "umpire", team: Team.ADMIN };
  window.ROOM_WORLD = {
    stage: RoomGameStage.WAR,
    hasObjectNavMeshMap: () => true,
    units: {
      get: () => null,
      list: () => [],
      upsert: () => {
        throw new Error("a courier should not be created");
      },
    },
    events: { emit: () => {} },
  } as unknown as typeof window.ROOM_WORLD;
});

describe("a courier for an incoming order", () => {
  it("is not created when the order was already handed over", () => {
    expect(autoSpawnMessengerForIncomingOrder(makeMessage())).toBe(false);
  });

  it("is not created when the delivery status is already closed", () => {
    expect(autoSpawnMessengerForIncomingOrder(makeMessage({
      delivered: false,
      deliveryStatus: "delivered",
    }))).toBe(false);
  });
});
