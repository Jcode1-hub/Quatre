import { describe, expect, it } from "vitest";
import { readEventStream } from "./sse";

describe("provider event stream parser", () => {
  it("joins event data across frames and ignores the provider terminator", async () => {
    const body = new Response("data: {\"type\":\"delta\",\"text\":\"Hello\"}\r\n\r\ndata: [DONE]\r\n\r\ndata: {\"type\":\"delta\",\"text\":\" world\"}\r\n\r\n");
    const events: string[] = [];
    for await (const event of readEventStream(body)) events.push(event);
    expect(events).toEqual(["{\"type\":\"delta\",\"text\":\"Hello\"}", "{\"type\":\"delta\",\"text\":\" world\"}"]);
  });
});
