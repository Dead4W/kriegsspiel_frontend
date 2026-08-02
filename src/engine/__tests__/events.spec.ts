import { describe, expect, it } from "vitest";
import { emitter } from "@/engine/events";

type Events = { api: { id: string }; changed: { reason: string } };

describe("muting an event", () => {
  it("drops what happens while muted rather than delivering it later", async () => {
    const events = new emitter<Events>();
    const seen: string[] = [];
    events.on("api", ({ id }) => seen.push(id));

    await events.emit("api", { id: "before" });
    const unmute = events.mute("api");
    await events.emit("api", { id: "during" });
    unmute();
    await events.emit("api", { id: "after" });

    expect(seen).toEqual(["before", "after"]);
  });

  it("leaves other events alone", async () => {
    const events = new emitter<Events>();
    const seen: string[] = [];
    events.on("changed", ({ reason }) => seen.push(reason));

    const unmute = events.mute("api");
    await events.emit("changed", { reason: "unit" });
    unmute();

    expect(seen).toEqual(["unit"]);
  });

  it("counts nesting, so an inner release does not reopen the outer", async () => {
    const events = new emitter<Events>();
    const seen: string[] = [];
    events.on("api", ({ id }) => seen.push(id));

    const outer = events.mute("api");
    const inner = events.mute("api");
    inner();
    await events.emit("api", { id: "still muted" });
    expect(events.isMuted("api")).toBe(true);

    outer();
    await events.emit("api", { id: "open" });

    expect(seen).toEqual(["open"]);
    expect(events.isMuted("api")).toBe(false);
  });

  it("ignores a release called twice", async () => {
    const events = new emitter<Events>();
    const seen: string[] = [];
    events.on("api", ({ id }) => seen.push(id));

    const outer = events.mute("api");
    const inner = events.mute("api");
    inner();
    inner();
    await events.emit("api", { id: "still muted" });
    expect(events.isMuted("api")).toBe(true);

    outer();
    expect(events.isMuted("api")).toBe(false);
    expect(seen).toEqual([]);
  });
});
