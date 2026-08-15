import "@/engine";
import { describe, expect, it } from "vitest";
import { Team } from "@/enums/teamKeys";
import { RoomGameStage } from "@/enums/roomStage";
import { ChatMessageStatus, type ChatMessage } from "@/engine/types/chatMessage";
import { world } from "@/engine/world/world";

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

describe("opening the war", () => {
  it("discards courier candidates left from the arrangement", () => {
    const room = new world({
      imageUrl: "",
      heightMapUrl: "",
      width: 64,
      height: 64,
      metersPerPixel: 1,
    });
    window.ROOM_WORLD = room;
    room.stage = RoomGameStage.WAR;
    room.messages.upsert(makeMessage(), "remote");
    room.stage = RoomGameStage.PLANNING;

    room.setStage(RoomGameStage.WAR);

    expect(room.messages.getMessengerSpawnCandidates()).toEqual([]);
  });
});
