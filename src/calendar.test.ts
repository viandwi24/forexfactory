import { describe, expect, test } from "bun:test";
import { ForexFactory } from "./index";

describe("ForexFactory", () => {
  const ff = new ForexFactory();

  test("should fetch homepage and extract timezone", async () => {
    const res = await ff.fetch("/");
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);

    const timezoneMatch = res.data.match(/timezone_name:\s*'([^']+)'/);
    const timezone = timezoneMatch ? timezoneMatch[1] : undefined;
    expect(timezone).toBeDefined();
    expect(timezone).toMatch(/^[A-Za-z_]+\/[A-Za-z_]+$/);
  });

  test("should fetch calendar with UTC timestamps", async () => {
    const calendar = await ff.fetchCalendarEvents();

    expect(calendar.serverTimezone).toBeDefined();
    expect(calendar.data).toBeArray();
    expect(calendar.data.length).toBeGreaterThan(0);

    // Check first day has events
    const firstDay = calendar.data[0];
    expect(firstDay?.date).toBeDefined();
    expect(firstDay?.events).toBeArray();

    // Check event structure
    if (firstDay && firstDay.events.length > 0) {
      const event = firstDay.events[0];
      expect(event).toHaveProperty("eventId");
      expect(event).toHaveProperty("time");
      expect(event).toHaveProperty("currency");
      expect(event).toHaveProperty("title");
      expect(event).toHaveProperty("impact");
      expect(event).toHaveProperty("timestamp");

      // If timestamp is valid (not 0), verify it's a valid UTC timestamp
      if (event?.timestamp && event.timestamp > 0) {
        const date = new Date(event.timestamp);
        expect(date.getTime()).toBe(event.timestamp);

        console.log("Server Timezone:", calendar.serverTimezone);
        console.log("Event ID:", event.eventId);
        console.log("Event:", event.title);
        console.log("Original Time:", event.time);
        console.log("UTC:", date.toISOString());
        console.log(
          "Jakarta:",
          ForexFactory.formatToTimezone(event.timestamp, "Asia/Jakarta")
        );
      }
    }
  });

  test("should fetch calendar event detail by ID", async () => {
    // First get calendar to find an event ID
    const calendar = await ff.fetchCalendarEvents();
    const firstEvent = calendar.data[0]?.events[0];

    if (!firstEvent) {
      console.log("No events found, skipping detail test");
      return;
    }

    const eventId = firstEvent.eventId;
    console.log("Fetching detail for event ID:", eventId);

    const detail = await ff.fetchCalendarEventById(eventId);

    expect(detail.eventId).toBe(Number(eventId));
    expect(detail.specs).toBeArray();
    expect(detail.history).toBeDefined();
    expect(detail.history.events).toBeArray();

    // Log specs
    console.log("\nEvent Detail:");
    console.log("Event ID:", detail.eventId);
    console.log("Specs:");
    for (const spec of detail.specs) {
      console.log(`  - ${spec.title}: ${spec.html.substring(0, 80)}...`);
    }

    console.log("\nHistory:");
    console.log("  Has data values:", detail.history.hasDataValues);
    console.log("  Events count:", detail.history.events.length);
    if (detail.history.events.length > 0) {
      const histEvent = detail.history.events[0];
      console.log("  Latest:", histEvent?.date, "-", histEvent?.description.substring(0, 50));
    }
  });
});
