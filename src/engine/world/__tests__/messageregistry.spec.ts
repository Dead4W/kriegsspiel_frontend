import { beforeEach, describe, expect, it } from "vitest";
import { Team } from "@/enums/teamKeys";
import { RoomGameStage } from "@/enums/roomStage";
import { ChatMessageStatus, type ChatMessage } from "@/engine/types/chatMessage";
import { messageregistry } from "@/engine/world/messageregistry";

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
    delivered: false,
    deliveryStatus: "pending",
    ...overrides,
  };
}

beforeEach(() => {
  window.ROOM_WORLD = { stage: RoomGameStage.PLANNING } as typeof window.ROOM_WORLD;
});

describe("orders that arrive before the war", () => {
  it("does not queue a courier while the sides are still arranging themselves", () => {
    const messages = new messageregistry();
    messages.upsert(makeMessage(), "remote");

    expect(messages.getMessengerSpawnCandidates()).toEqual([]);
  });

  it("queues a courier only after the war has begun", () => {
    window.ROOM_WORLD.stage = RoomGameStage.WAR;
    const messages = new messageregistry();
    messages.upsert(makeMessage(), "remote");

    expect(messages.getMessengerSpawnCandidates().map((message) => message.id)).toEqual(["order-1"]);
  });

  it("forgets queued courier ids", () => {
    window.ROOM_WORLD.stage = RoomGameStage.WAR;
    const messages = new messageregistry();
    messages.upsert(makeMessage(), "remote");
    messages.upsert(makeMessage({ id: "order-2" }), "remote");

    messages.forgetMessengerSpawnCandidates(["order-1"]);

    expect(messages.getMessengerSpawnCandidates().map((message) => message.id)).toEqual(["order-2"]);
  });

  it("does not reopen an order that was already handed over", () => {
    const messages = new messageregistry();
    messages.upsert(makeMessage({ delivered: true, deliveryStatus: "delivered", delivered_at: "1882-06-12 09:00:00" }));
    messages.upsert(makeMessage({ delivered: false, deliveryStatus: "pending" }), "remote");

    const message = messages.get("order-1");
    expect(message?.delivered).toBe(true);
    expect(message?.deliveryStatus).toBe("delivered");
    expect(message?.delivered_at).toBe("1882-06-12 09:00:00");
  });
});
