# forexfactory

Unofficial API client for [Forex Factory](https://www.forexfactory.com) economic calendar. Scrapes and parses calendar events with proper UTC timestamp conversion for consistent timezone handling.

## Features

- Fetch economic calendar events
- Get event details (description, history, specs)
- UTC timestamp conversion for all events
- Format timestamps to any timezone
- TypeScript support with full type definitions
- Zero authentication required

## Installation

```bash
bun add forexfactory
```

Or with npm/yarn/pnpm:

```bash
npm install forexfactory
yarn add forexfactory
pnpm add forexfactory
```

## Usage

### Basic Usage

```typescript
import { ForexFactory } from "forexfactory";

const ff = new ForexFactory();

// Fetch this week's calendar events
const calendar = await ff.fetchCalendarEvents();

console.log("Server Timezone:", calendar.serverTimezone);
console.log("Days:", calendar.data.length);

for (const day of calendar.data) {
  console.log(`\n${day.date}:`);
  for (const event of day.events) {
    console.log(`  ${event.time} - ${event.currency} - ${event.title} [${event.impact}]`);
  }
}
```

### Fetch Calendar for Specific Date

```typescript
// Format: monDD.YYYY (e.g., jan15.2026)
const calendar = await ff.fetchCalendarEvents("jan15.2026");
```

### Get Event Details

```typescript
const calendar = await ff.fetchCalendarEvents();
const event = calendar.data[0]?.events[0];

if (event) {
  const detail = await ff.fetchCalendarEventById(event.eventId);

  console.log("Event ID:", detail.eventId);

  // Specs contain description, usual effect, why traders care, etc.
  for (const spec of detail.specs) {
    console.log(`${spec.title}: ${spec.html}`);
  }

  // History contains previous occurrences of this event
  console.log("History events:", detail.history.events.length);
}
```

### Working with Timezones

All event timestamps are stored in UTC. Use the helper method to convert to any timezone:

```typescript
const calendar = await ff.fetchCalendarEvents();
const event = calendar.data[0]?.events[0];

if (event && event.timestamp > 0) {
  // UTC timestamp (milliseconds)
  console.log("UTC Timestamp:", event.timestamp);
  console.log("UTC:", new Date(event.timestamp).toISOString());

  // Convert to different timezones
  console.log("New York:", ForexFactory.formatToTimezone(event.timestamp, "America/New_York"));
  console.log("London:", ForexFactory.formatToTimezone(event.timestamp, "Europe/London"));
  console.log("Tokyo:", ForexFactory.formatToTimezone(event.timestamp, "Asia/Tokyo"));
  console.log("Jakarta:", ForexFactory.formatToTimezone(event.timestamp, "Asia/Jakarta"));
  console.log("Singapore:", ForexFactory.formatToTimezone(event.timestamp, "Asia/Singapore"));
}
```

### Get Server Timezone

```typescript
const timezone = await ff.getServerTimezone();
console.log("Server timezone:", timezone); // e.g., "Asia/Jakarta"
```

## API Reference

### `ForexFactory`

Main class for interacting with Forex Factory.

#### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `fetchCalendarEvents(date?)` | Fetch calendar events. Optional date format: `monDD.YYYY` | `Promise<CalendarResponse>` |
| `fetchCalendarEventById(eventId)` | Fetch detailed information for a specific event | `Promise<EventDetailResponse>` |
| `getServerTimezone()` | Get the server's timezone | `Promise<string>` |
| `fetch(endpoint)` | Raw fetch with HTML parsing | `Promise<FetchResponse>` |
| `ForexFactory.formatToTimezone(timestamp, timezone)` | Static method to format UTC timestamp to timezone | `string` |

### Types

#### `CalendarEvent`

```typescript
interface CalendarEvent {
  eventId: string;
  time: string;
  currency: string;
  title: string;
  actual: string;
  previous: string;
  forecast: string;
  impact: "High" | "Medium" | "Low" | "Non-Economic" | "Unknown";
  timestamp: number; // UTC timestamp in milliseconds
}
```

#### `CalendarDay`

```typescript
interface CalendarDay {
  date: string;
  events: CalendarEvent[];
}
```

#### `CalendarResponse`

```typescript
interface CalendarResponse {
  serverTimezone: string;
  data: CalendarDay[];
}
```

#### `EventDetailResponse`

```typescript
interface EventDetailResponse {
  eventId: number;
  specs: EventSpec[];
  history: EventHistory;
  showLinked: boolean;
  linkedThreads: unknown[];
}
```

#### `EventSpec`

```typescript
interface EventSpec {
  order: number;
  title: string;  // "Description", "Usual Effect", "Why Traders Care", etc.
  html: string;
}
```

#### `EventHistory`

```typescript
interface EventHistory {
  hasDataValues: boolean;
  events: EventHistoryItem[];
  hasMore: boolean;
  canShowMore: boolean;
}
```

#### `EventHistoryItem`

```typescript
interface EventHistoryItem {
  eventId: number;
  impact: string;
  impactClass: string;
  date: string;
  url: string;
  description: string;
}
```

## Examples

### Filter High Impact Events

```typescript
const calendar = await ff.fetchCalendarEvents();

const highImpactEvents = calendar.data.flatMap(day =>
  day.events.filter(event => event.impact === "High")
);

console.log("High impact events this week:", highImpactEvents.length);
for (const event of highImpactEvents) {
  console.log(`${event.currency} - ${event.title}`);
}
```

### Filter by Currency

```typescript
const calendar = await ff.fetchCalendarEvents();

const usdEvents = calendar.data.flatMap(day =>
  day.events.filter(event => event.currency === "USD")
);

console.log("USD events:", usdEvents.length);
```

### Get Events for Today

```typescript
const calendar = await ff.fetchCalendarEvents();

// First day in the response is typically the current/first day of the week
const today = calendar.data[0];
if (today) {
  console.log(`Events for ${today.date}:`);
  for (const event of today.events) {
    console.log(`  ${event.time} - ${event.title}`);
  }
}
```

### Build a Simple Alert System

```typescript
const calendar = await ff.fetchCalendarEvents();
const now = Date.now();

for (const day of calendar.data) {
  for (const event of day.events) {
    if (event.timestamp > 0 && event.impact === "High") {
      const timeUntil = event.timestamp - now;
      const hoursUntil = Math.floor(timeUntil / (1000 * 60 * 60));

      if (hoursUntil > 0 && hoursUntil <= 24) {
        console.log(`ALERT: ${event.title} (${event.currency}) in ${hoursUntil} hours`);
      }
    }
  }
}
```

## Disclaimer

This is an **unofficial** API client. It is not affiliated with, authorized, maintained, sponsored, or endorsed by Forex Factory or any of its affiliates. Use at your own risk.

The data scraped from Forex Factory is subject to their terms of service. Please use responsibly and consider rate limiting your requests.

## License

MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
