import * as cheerio from "cheerio";

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Configuration options for ForexFactory client
 */
interface ForexFactoryConfig {
  /** Custom base URL (optional, defaults to https://www.forexfactory.com) */
  baseUrl?: string;
}

/**
 * Internal fetch response wrapper
 */
interface FetchResponse {
  ok: boolean;
  status: number;
  data: string;
  html: cheerio.CheerioAPI;
}

/**
 * Economic calendar event
 */
interface CalendarEvent {
  /** Unique event identifier */
  eventId: string;
  /** Event time in server timezone (e.g., "1:30am", "Tentative", "All Day") */
  time: string;
  /** Currency code (e.g., "USD", "EUR", "GBP") */
  currency: string;
  /** Event title/name */
  title: string;
  /** Actual value (empty if not yet released) */
  actual: string;
  /** Previous value */
  previous: string;
  /** Forecasted value */
  forecast: string;
  /** Impact level */
  impact: "High" | "Medium" | "Low" | "Non-Economic" | "Unknown";
  /** UTC timestamp (0 if time is not specific) */
  timestamp: number;
}

/**
 * Calendar events grouped by date
 */
interface CalendarDay {
  /** Date string (e.g., "Mon Jan 6") */
  date: string;
  /** Events for this date */
  events: CalendarEvent[];
}

/**
 * Response from calendarEvents()
 */
interface CalendarResponse {
  /** Server timezone (e.g., "America/New_York") */
  tz: string;
  /** Events grouped by date */
  data: CalendarDay[];
  /** Start date in Forex Factory format */
  from: string;
  /** End date in Forex Factory format */
  to: string;
}

/**
 * Event specification/metadata
 */
interface EventSpec {
  order: number;
  title: string;
  html: string;
}

/**
 * Historical event item
 */
interface EventHistoryItem {
  eventId: number;
  impact: string;
  impactClass: string;
  date: string;
  url: string;
  description: string;
}

/**
 * Event history data
 */
interface EventHistory {
  hasDataValues: boolean;
  events: EventHistoryItem[];
  hasMore: boolean;
  canShowMore: boolean;
}

/**
 * Response from calendarEventDetail()
 */
interface CalendarEventDetail {
  eventId: number;
  specs: EventSpec[];
  history: EventHistory;
  showLinked: boolean;
  linkedThreads: unknown[];
}

/**
 * News article detail
 */
interface NewsItem {
  /** URL path on Forex Factory */
  url: string;
  /** Article title */
  title: string;
  /** Article content/summary */
  content: string;
  /** Source name (e.g., "fxstreet.com", "reuters.com") */
  source: string;
  /** Original article URL */
  sourceUrl: string;
  /** Article image URL (null if none) */
  image: string | null;
}

// ============================================================================
// Constants
// ============================================================================

/** Timezone offsets in hours from UTC (standard time, not DST) */
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

/** CSS class to impact level mapping */
const IMPACT_CLASSES: Record<string, CalendarEvent["impact"]> = {
  "icon--ff-impact-gra": "Non-Economic",
  "icon--ff-impact-yel": "Low",
  "icon--ff-impact-ora": "Medium",
  "icon--ff-impact-red": "High",
};

/** Month abbreviations for Forex Factory date format */
const MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert a Date object or date string to Forex Factory format
 *
 * @param date - Date object or parseable date string
 * @returns Formatted date string (e.g., "dec19.2025")
 * @throws Error if date string is invalid
 *
 * @example
 * toForexFactoryDate(new Date(2025, 11, 19)) // "dec19.2025"
 * toForexFactoryDate("2025-12-19")           // "dec19.2025"
 * toForexFactoryDate("December 19, 2025")    // "dec19.2025"
 */
function toForexFactoryDate(date: Date | string): string {
  let d: Date;

  if (date instanceof Date) {
    d = date;
  } else if (typeof date === "string") {
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      throw new Error(`Invalid date string: ${date}`);
    }
    d = parsed;
  } else {
    throw new Error("Date must be a Date object or string");
  }

  const month = MONTH_ABBR[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();

  return `${month}${day}.${year}`;
}

/**
 * Get the start of the week (Sunday) for a given date
 */
function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the end of the week (Saturday) for a given date
 */
function getEndOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (6 - day));
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Delay execution for specified milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Main Class
// ============================================================================

/**
 * Forex Factory API client for scraping calendar events and news
 *
 * @example
 * const ff = new ForexFactory();
 *
 * // Get calendar events for current week
 * const calendar = await ff.calendarEvents();
 *
 * // Get calendar events for specific date range
 * const events = await ff.calendarEvents("2025-01-06", "2025-01-10");
 *
 * // Get all news articles
 * const news = await ff.news();
 */
class ForexFactory {
  private baseUrl: string;

  constructor(config: ForexFactoryConfig = {}) {
    this.baseUrl = config.baseUrl ?? "https://www.forexfactory.com";
  }

  // --------------------------------------------------------------------------
  // Internal Methods
  // --------------------------------------------------------------------------

  /**
   * Internal HTTP request method
   * @internal
   */
  private async request(endpoint: string): Promise<FetchResponse> {
    const url = endpoint.startsWith("http") ? endpoint : `${this.baseUrl}${endpoint}`;

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

  /**
   * Parse time string to UTC timestamp
   * @internal
   */
  private parseTimeToUTC(timeStr: string, dateStr: string, serverTimezoneOffset: number): number {
    // Handle special cases
    if (!timeStr || timeStr === "Tentative" || timeStr.startsWith("Day") || timeStr === "All Day") {
      return 0;
    }

    // Parse time string like "1:10am", "3:30pm"
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})(am|pm)/i);
    if (!timeMatch) return 0;

    const [, hourStr, minuteStr, periodStr] = timeMatch;
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

    const [, monthStr, dayStr] = dateParts;
    if (!monthStr || !dayStr) return 0;

    const day = parseInt(dayStr);
    const monthMap: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };

    const month = monthMap[monthStr];
    if (month === undefined) return 0;

    // Create UTC timestamp (Server time = UTC + offset, so UTC = Server time - offset)
    const utcDate = Date.UTC(currentYear, month, day, hour, minute, 0, 0);
    return utcDate - serverTimezoneOffset * 60 * 60 * 1000;
  }

  // --------------------------------------------------------------------------
  // Public Methods - General
  // --------------------------------------------------------------------------

  /**
   * Get the server's current timezone
   *
   * @returns Server timezone string (e.g., "America/New_York")
   * @throws Error if timezone cannot be determined
   *
   * @example
   * const tz = await ff.serverTimezone();
   * console.log(tz); // "America/New_York"
   */
  async serverTimezone(): Promise<string> {
    const res = await this.request("/");
    if (!res.data) throw new Error("No data received from request");

    const timezoneMatch = res.data.match(/timezone_name:\s*'([^']+)'/);
    const timezone = timezoneMatch?.[1];

    if (!timezone) throw new Error("Timezone not found in response");
    return timezone;
  }

  // --------------------------------------------------------------------------
  // Public Methods - Calendar
  // --------------------------------------------------------------------------

  /**
   * Get economic calendar events
   *
   * @param from - Start date (Date object or string). Defaults to start of current week (Sunday)
   * @param to - End date (Date object or string). Defaults to end of current week (Saturday)
   * @returns Calendar events grouped by date
   *
   * @example
   * // Get current week's events
   * const calendar = await ff.calendarEvents();
   *
   * @example
   * // Get events for specific date range using ISO strings
   * const calendar = await ff.calendarEvents("2025-01-06", "2025-01-10");
   *
   * @example
   * // Get events using Date objects
   * const calendar = await ff.calendarEvents(
   *   new Date(2025, 0, 6),
   *   new Date(2025, 0, 10)
   * );
   */
  async calendarEvents(from?: Date | string, to?: Date | string): Promise<CalendarResponse> {
    let fromDate: string;
    let toDate: string;

    if (from && to) {
      fromDate = toForexFactoryDate(from);
      toDate = toForexFactoryDate(to);
    } else {
      const now = new Date();
      fromDate = toForexFactoryDate(getStartOfWeek(now));
      toDate = toForexFactoryDate(getEndOfWeek(now));
    }

    const url = `/calendar?range=${fromDate}-${toDate}`;
    const res = await this.request(url);
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
      const eventId = $row.attr("data-event-id");
      if (!eventId) return;

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

      if (date && date !== lastDate) lastDate = date;
      if (time && time !== lastTime) lastTime = time;

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
      tz: serverTimezone,
      data: groupedByDate,
      from: fromDate,
      to: toDate,
    };
  }

  /**
   * Get detailed information for a specific calendar event
   *
   * @param eventId - The event ID
   * @returns Event detail including specs and history
   *
   * @example
   * const detail = await ff.calendarEventDetail(147453);
   * console.log(detail.specs);
   * console.log(detail.history.events);
   */
  async calendarEventDetail(eventId: string | number): Promise<CalendarEventDetail> {
    const url = `/calendar/details/1-${eventId}`;
    const res = await this.request(url);

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

  // --------------------------------------------------------------------------
  // Public Methods - News
  // --------------------------------------------------------------------------

  /**
   * Get all news articles from the news page
   *
   * Fetches the news listing page, extracts all article URLs, then fetches
   * each article's details in parallel batches with delays to avoid rate limiting.
   *
   * @param batchSize - Number of parallel requests per batch (default: 5)
   * @param batchDelay - Delay between batches in milliseconds (default: 500)
   * @returns Array of news articles
   *
   * @example
   * // Get all news with default settings
   * const articles = await ff.news();
   *
   * @example
   * // Get news with custom batch settings
   * const articles = await ff.news(10, 1000); // 10 per batch, 1s delay
   */
  async news(batchSize = 5, batchDelay = 500): Promise<NewsItem[]> {
    const res = await this.request("/news");
    const $ = res.html;

    // Find all news links matching pattern /news/{number}-{slug}
    const newsUrls: string[] = [];
    const newsPattern = /^\/news\/\d+-[\w-]+$/;

    $("a").each((_, el) => {
      const href = $(el).attr("href");
      if (href && newsPattern.test(href) && !newsUrls.includes(href)) {
        newsUrls.push(href);
      }
    });

    // Fetch news in parallel batches
    const results: NewsItem[] = [];

    for (let i = 0; i < newsUrls.length; i += batchSize) {
      const batch = newsUrls.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map((url) => this.newsDetail(url)));

      results.push(...batchResults);

      // Delay between batches (except for the last batch)
      if (i + batchSize < newsUrls.length) {
        await delay(batchDelay);
      }
    }

    return results;
  }

  /**
   * Get detailed information for a specific news article
   *
   * @param url - The news article URL path (e.g., "/news/123456-article-slug")
   * @returns News article details
   *
   * @example
   * const article = await ff.newsDetail("/news/123456-gold-prices-surge");
   * console.log(article.title);
   * console.log(article.content);
   */
  async newsDetail(url: string): Promise<NewsItem> {
    const res = await this.request(url);
    const $ = res.html;
    const article = $(".news__article");

    const title = article.find("h1").text().trim();

    const sourceLink = article.find(".news__caption a");
    const source = sourceLink.attr("data-story-source") || "";
    const sourceUrl = sourceLink.attr("href") || "";

    const image = article.find(".news__image img").attr("src") || null;

    const contentEl = article.find(".news__copy").clone();
    contentEl.find("a").remove();
    contentEl.find("span.nowrap").remove();
    const content = contentEl.text().trim();

    return { url, title, content, source, sourceUrl, image };
  }

  // --------------------------------------------------------------------------
  // Static Utility Methods
  // --------------------------------------------------------------------------

  /**
   * Format a UTC timestamp to a specific timezone
   *
   * @param timestamp - UTC timestamp in milliseconds
   * @param timezone - IANA timezone string
   * @returns Formatted date string or "N/A" if timestamp is 0
   *
   * @example
   * const formatted = ForexFactory.formatTimestamp(1704556800000, "Asia/Jakarta");
   * console.log(formatted); // "1/6/2024, 7:00:00 PM"
   */
  static formatTimestamp(timestamp: number, timezone: string): string {
    if (timestamp === 0) return "N/A";
    return new Date(timestamp).toLocaleString("en-US", { timeZone: timezone });
  }
}

// ============================================================================
// Exports
// ============================================================================

export { ForexFactory, toForexFactoryDate };
export type {
  ForexFactoryConfig,
  FetchResponse,
  CalendarEvent,
  CalendarDay,
  CalendarResponse,
  CalendarEventDetail,
  EventSpec,
  EventHistoryItem,
  EventHistory,
  NewsItem,
};
