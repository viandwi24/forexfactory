import * as cheerio from "cheerio";

interface ForexFactoryConfig {
  timezone?: string;
}

interface FetchResponse {
  ok: boolean;
  status: number;
  data: string;
  html: cheerio.CheerioAPI;
}

interface CalendarEvent {
  eventId: string;
  time: string;
  currency: string;
  title: string;
  actual: string;
  previous: string;
  forecast: string;
  impact: "High" | "Medium" | "Low" | "Non-Economic" | "Unknown";
  timestamp: number; // UTC timestamp
}

interface CalendarDay {
  date: string;
  events: CalendarEvent[];
}

interface CalendarResponse {
  serverTimezone: string;
  data: CalendarDay[];
}

interface EventSpec {
  order: number;
  title: string;
  html: string;
}

interface EventHistoryItem {
  eventId: number;
  impact: string;
  impactClass: string;
  date: string;
  url: string;
  description: string;
}

interface EventHistory {
  hasDataValues: boolean;
  events: EventHistoryItem[];
  hasMore: boolean;
  canShowMore: boolean;
}

interface EventDetailResponse {
  eventId: number;
  specs: EventSpec[];
  history: EventHistory;
  showLinked: boolean;
  linkedThreads: unknown[];
}

// Timezone offsets in hours from UTC
const TIMEZONE_OFFSETS: Record<string, number> = {
  "Asia/Jakarta": 7,
  "Asia/Singapore": 8,
  "Asia/Tokyo": 9,
  "Asia/Hong_Kong": 8,
  "Asia/Shanghai": 8,
  "Asia/Seoul": 9,
  "Asia/Bangkok": 7,
  "Asia/Dubai": 4,
  "Europe/London": 0,
  "Europe/Paris": 1,
  "Europe/Berlin": 1,
  "Europe/Moscow": 3,
  "Europe/Zurich": 1,
  "America/New_York": -5,
  "America/Chicago": -6,
  "America/Los_Angeles": -8,
  "America/Toronto": -5,
  "Australia/Sydney": 11,
  "Pacific/Auckland": 13,
};

const IMPACT_CLASSES: Record<string, CalendarEvent["impact"]> = {
  "icon--ff-impact-gra": "Non-Economic",
  "icon--ff-impact-yel": "Low",
  "icon--ff-impact-ora": "Medium",
  "icon--ff-impact-red": "High",
};

class ForexFactory {
  private baseUrl = "https://www.forexfactory.com";

  constructor(config: ForexFactoryConfig = {}) {}

  async fetch(endpoint: string): Promise<FetchResponse> {
    const url = endpoint.startsWith("http")
      ? endpoint
      : `${this.baseUrl}${endpoint}`;

    const response = await fetch(url);
    const text = await response.text();
    const html = cheerio.load(text);

    return {
      ok: response.ok,
      status: response.status,
      data: text,
      html,
    };
  }

  async getServerTimezone(): Promise<string> {
    const res = await this.fetch("/");
    if (!res.data) throw new Error("No data received from fetch");
    const timezoneMatch = res.data.match(/timezone_name:\s*'([^']+)'/);
    const timezone = timezoneMatch ? timezoneMatch[1] : undefined;
    if (!timezone)
      throw new Error("Timezone not found in the response data");
    return timezone;
  }

  private parseTimeToUTC(
    timeStr: string,
    dateStr: string,
    serverTimezoneOffset: number
  ): number {
    // Handle special cases
    if (
      !timeStr ||
      timeStr === "Tentative" ||
      timeStr.startsWith("Day") ||
      timeStr === "All Day"
    ) {
      return 0;
    }

    // Parse time string like "1:10am", "3:30pm"
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})(am|pm)/i);
    if (!timeMatch) return 0;

    const hourStr = timeMatch[1];
    const minuteStr = timeMatch[2];
    const periodStr = timeMatch[3];

    if (!hourStr || !minuteStr || !periodStr) return 0;

    let hour = parseInt(hourStr);
    const minute = parseInt(minuteStr);
    const period = periodStr.toLowerCase();

    // Convert to 24-hour format
    if (period === "pm" && hour !== 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;

    // Parse date string like "Mon Jan 6"
    const currentYear = new Date().getFullYear();
    const dateParts = dateStr.split(" ");

    if (dateParts.length < 3) return 0;

    const monthStr = dateParts[1];
    const dayStr = dateParts[2];

    if (!monthStr || !dayStr) return 0;

    const day = parseInt(dayStr);

    const monthMap: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };

    const month = monthMap[monthStr];
    if (month === undefined) return 0;

    // Create date in UTC
    // Server time = UTC + offset, so UTC = Server time - offset
    const utcDate = Date.UTC(currentYear, month, day, hour, minute, 0, 0);
    const utcTimestamp = utcDate - serverTimezoneOffset * 60 * 60 * 1000;

    return utcTimestamp;
  }

  async fetchCalendarEvents(date?: string): Promise<CalendarResponse> {
    const url = date ? `/calendar?day=${date}` : "/calendar";
    const res = await this.fetch(url);
    const $ = res.html;

    // Get server timezone from response
    const timezoneMatch = res.data.match(/timezone_name:\s*'([^']+)'/);
    const serverTimezone = timezoneMatch?.[1] ?? "America/New_York";
    const serverOffset = TIMEZONE_OFFSETS[serverTimezone] ?? 0;

    const events: (CalendarEvent & { date: string })[] = [];
    let lastDate = "";
    let lastTime = "";

    $(".calendar__row").each((_, row) => {
      const $row = $(row);
      // get from row data-event-id="147453"
      const eventId = $row.attr("data-event-id");
      if (!eventId) return; // skip rows without event id

      const date = $row.find(".calendar__date").text().trim();
      const time = $row.find(".calendar__time").text().trim();
      const currency = $row.find(".calendar__currency").text().trim();
      const title = $row.find(".calendar__event-title").text().trim();
      const actual = $row.find(".calendar__actual").text().trim();
      const previous = $row.find(".calendar__previous").text().trim();
      const forecast = $row.find(".calendar__forecast").text().trim();

      const impactEl = $row.find(".calendar__cell.calendar__impact > span");
      const impactClass = impactEl.attr("class") || "";
      let impact: CalendarEvent["impact"] = "Unknown";

      for (const [pattern, value] of Object.entries(IMPACT_CLASSES)) {
        if (impactClass.includes(pattern)) {
          impact = value;
          break;
        }
      }

      // Track last date and time
      if (date && date !== lastDate) lastDate = date;
      if (time && time !== lastTime) lastTime = time;

      // Only add if we have valid data
      if (lastDate && title && eventId) {
        const timestamp = this.parseTimeToUTC(lastTime, lastDate, serverOffset);

        events.push({
          eventId,
          date: lastDate,
          time: lastTime,
          currency,
          title,
          actual,
          previous,
          forecast,
          impact,
          timestamp,
        });
      }
    });

    // Group events by date
    const groupedByDate: CalendarDay[] = [];

    for (const event of events) {
      const { date, ...eventData } = event;
      let group = groupedByDate.find((g) => g.date === date);

      if (!group) {
        group = { date, events: [] };
        groupedByDate.push(group);
      }

      group.events.push(eventData);
    }

    return {
      serverTimezone,
      data: groupedByDate,
    };
  }

  async fetchCalendarEventById(eventId: string | number): Promise<EventDetailResponse> {
    const url = `/calendar/details/1-${eventId}`;
    const res = await this.fetch(url);

    // Response is JSON
    const json = JSON.parse(res.data) as {
      data: {
        event_id: number;
        specs: Array<{ order: number; title: string; html: string }>;
        history: {
          has_data_values: boolean;
          events: Array<{
            event_id: number;
            impact: string;
            impact_class: string;
            date: string;
            url: string;
            description: string;
          }>;
          has_more: boolean;
          can_show_more: boolean;
        };
        show_linked: boolean;
        linked_threads: unknown[];
      };
    };

    const data = json.data;

    return {
      eventId: data.event_id,
      specs: data.specs.map((s) => ({
        order: s.order,
        title: s.title,
        html: s.html,
      })),
      history: {
        hasDataValues: data.history.has_data_values,
        events: data.history.events.map((e) => ({
          eventId: e.event_id,
          impact: e.impact,
          impactClass: e.impact_class,
          date: e.date,
          url: e.url,
          description: e.description,
        })),
        hasMore: data.history.has_more,
        canShowMore: data.history.can_show_more,
      },
      showLinked: data.show_linked,
      linkedThreads: data.linked_threads,
    };
  }

  // Helper: convert UTC timestamp to specific timezone
  static formatToTimezone(timestamp: number, timezone: string): string {
    if (timestamp === 0) return "N/A";
    return new Date(timestamp).toLocaleString("en-US", { timeZone: timezone });
  }
}

export { ForexFactory };
export type {
  FetchResponse,
  ForexFactoryConfig,
  CalendarEvent,
  CalendarDay,
  CalendarResponse,
  EventSpec,
  EventHistoryItem,
  EventHistory,
  EventDetailResponse,
};