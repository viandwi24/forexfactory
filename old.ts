import { defineWidget, WidgetViewRenderer } from "../../src/"
import * as cheerio from 'cheerio';

// Function to convert time from Singapore (UTC+8) to Jakarta (UTC+7)
function convertSingaporeToJakarta(timeStr: string): string {
  if (!timeStr || timeStr === 'Tentative' || timeStr.startsWith('Day') || timeStr === 'All Day') {
    return timeStr;
  }

  // Parse time string like "1:10am", "3:30am", "9:30pm", "10:00pm"
  const timeMatch = timeStr.match(/(\d+):(\d+)(am|pm)/i);
  if (!timeMatch) return timeStr;

  let hour = parseInt(timeMatch[1]);
  const minute = timeMatch[2];
  const period = timeMatch[3].toLowerCase();

  // Convert to 24-hour format for easier calculation
  if (period === 'pm' && hour !== 12) {
    hour += 12;
  } else if (period === 'am' && hour === 12) {
    hour = 0;
  }

  // Subtract one hour (Singapore UTC+8 to Jakarta UTC+7)
  hour = hour - 1;

  // Handle negative hours (wrap to previous day)
  if (hour < 0) {
    hour = 23;
  }

  // Convert back to 12-hour format
  let newPeriod = 'am';
  if (hour >= 12) {
    newPeriod = 'pm';
    if (hour > 12) {
      hour -= 12;
    }
  }

  // Handle midnight (0:00)
  if (hour === 0) {
    hour = 12;
    newPeriod = 'am';
  }

  return `${hour}:${minute}${newPeriod}`;
}

// export const MarketHeatmapWidget =
export default defineWidget({
  meta: {
    id: 'bitorex.forex-calendar',
    name: 'Forex Calendar',
    description: 'Forex Calendar',
    type: 'calendar',
    version: '1.0.0',
    tags: ['bitorex', 'calendar'],
    setting: [],
  },
  routes(widget, route) {
    route.get('/data', async (req, res) => {
      try {
        // Get timezone from query params or default to Asia/Jakarta
        const clientTimezone = req.query.timezone || 'Asia/Jakarta';
        const serverTimezone = 'Asia/Singapore'; // Server timezone (Singapore UTC+8)

        // Use original simple URL without date params
        const url = 'https://www.forexfactory.com/calendar';

        // console.log(`Scraping Forex Factory calendar (Server timezone: ${serverTimezone})`);

        const response = await fetch(url);
        const html = await response.text();
        const $ = cheerio.load(html);

        const newsItems: {
          date: string;
          time: string;
          currency: string;
          title: string;
          actual: string;
          previous: string;
          forecast: string;
          impact: string;
          timestamp: number;
        }[] = [];

        // Process each row in the calendar
        let lastDate = '';
        let lastTime = '';
        const impactClassPattern = {
          'icon--ff-impact-gra': 'Non-Economic',
          'icon--ff-impact-yel': 'Low',
          'icon--ff-impact-red': 'High',
          'icon--ff-impact-ora': 'Medium',
        }

        $('.calendar__row').each((i, row) => {
          const date = $(row).find('.calendar__date').text().trim();
          const time = $(row).find('.calendar__time').text().trim();
          const currency = $(row).find('.calendar__currency').text().trim();
          const title = $(row).find('.calendar__event-title').text().trim();
          const actual = $(row).find('.calendar__actual').text().trim();
          const previous = $(row).find('.calendar__previous').text().trim();
          const forecast = $(row).find('.calendar__forecast').text().trim();
          const impactEl = $(row).find('.calendar__cell.calendar__impact > span')

          const impact = Object.keys(impactClassPattern).find((pattern) => {
            return impactEl.attr('class')?.includes(pattern);
          });
          const impactText = impact ? impactClassPattern[impact as keyof typeof impactClassPattern] : 'Unknown';

          if (date && date !== '' && date !== lastDate) {
            lastDate = date;
            // console.log(`New date found: "${date}"`);
          }
          if (time && time !== '' && time !== lastTime) lastTime = time

          if (lastDate && lastDate !== '' && title && title !== '') {
            // Convert time from Singapore to Jakarta timezone
            const jakartaTime = convertSingaporeToJakarta(lastTime);
            
            // Manual timestamp parsing based on example data
            let timestamp = 0;
            try {
              // Check if time is a valid time format (not "Day 1", "Day 2", etc.)
              if (jakartaTime && jakartaTime !== 'Tentative' && !jakartaTime.startsWith('Day') && jakartaTime !== 'All Day') {
                // Parse date and time manually
                const currentYear = new Date().getFullYear();
                let parsedDate: Date;

                // Handle date format like "Mon Aug 18"
                if (lastDate.includes(' ')) {
                  const dateParts = lastDate.split(' ');
                  if (dateParts.length >= 3) {
                    const day = dateParts[2];
                    const month = dateParts[1];
                    const monthIndex = new Date(`${month} 1, 2000`).getMonth();
                    parsedDate = new Date(currentYear, monthIndex, parseInt(day));
                  } else {
                    parsedDate = new Date(`${lastDate} ${currentYear}`);
                  }
                } else {
                  parsedDate = new Date(`${lastDate} ${currentYear}`);
                }

                // Parse time format like "5:30am", "6:00pm", "11:30am"
                if (jakartaTime.match(/^\d{1,2}:\d{2}(am|pm)$/i)) {
                  const timeMatch = jakartaTime.match(/(\d{1,2}):(\d{2})(am|pm)/i);
                  if (timeMatch) {
                    let hours = parseInt(timeMatch[1]);
                    const minutes = parseInt(timeMatch[2]);
                    const period = timeMatch[3].toLowerCase();

                    // Convert to 24-hour format
                    if (period === 'pm' && hours !== 12) hours += 12;
                    if (period === 'am' && hours === 12) hours = 0;

                    // Create date in Jakarta timezone (UTC+7)
                    parsedDate.setHours(hours, minutes, 0, 0);
                    // Convert to UTC timestamp by subtracting 7 hours (25200000 ms)
                    timestamp = parsedDate.getTime() - (7 * 60 * 60 * 1000);
                  }
                }
              } else {
                // For "Day 1", "Day 2", etc. or invalid time, set timestamp to 0
                timestamp = 0;
              }
            } catch (e) {
              console.warn('Failed to parse timestamp for event:', { date: lastDate, time: lastTime, title });
              timestamp = 0;
            }

            // Debug logging for first few events
            // if (i < 5) {
            //   console.log('Parsed event:', {
            //     date: lastDate,
            //     time: lastTime,
            //     title,
            //     timestamp,
            //     parsedTimestamp: timestamp > 0 ? new Date(timestamp).toISOString() : 'Invalid time'
            //   });
            // }

            newsItems.push({
              date: lastDate,
              time: jakartaTime,
              currency,
              title,
              actual,
              previous,
              forecast,
              impact: impactText,
              timestamp,
            })
          }
        });

        // Group newsItems by date
        type Event = Omit<typeof newsItems[number], 'date'>;
        const groupedByDate: { date: string; events: Event[] }[] = [];
        newsItems.forEach(item => {
          let group = groupedByDate.find(g => g.date === item.date);
          if (!group) {
            group = { date: item.date, events: [] };
            groupedByDate.push(group);
          }
          const { date, ...event } = item;
          group.events.push(event);
        });

        // Add timezone info to response
        const responseData = {
          timezone: {
            server: serverTimezone,
            client: clientTimezone,
            startOfWeek: new Date().toISOString(),
            endOfWeek: new Date().toISOString(),
          },
          data: groupedByDate
        };

        res.json(responseData)
      } catch (error) {
        console.error('Error scraping Forex Factory calendar:', error);
        res.json({
          timezone: {
            server: 'Asia/Singapore',
            client: req.query.timezone || 'Asia/Jakarta',
            startOfWeek: new Date().toISOString(),
            endOfWeek: new Date().toISOString(),
          },
          data: []
        })
      }
    })

    // Add endpoint to get current server timezone info
    route.get('/timezone-info', async (req, res) => {
      const serverTimezone = 'Asia/Singapore'; // Server timezone
      const clientTimezone = 'Asia/Jakarta'; // Client timezone
      const now = new Date();
      const serverDate = new Date(now.toLocaleString("en-US", { timeZone: serverTimezone }));
      const jakartaDate = new Date(now.toLocaleString("en-US", { timeZone: clientTimezone }));

      res.json({
        serverTimezone,
        clientTimezone,
        serverTime: serverDate.toISOString(),
        jakartaTime: jakartaDate.toISOString(),
        utcTime: now.toISOString(),
        timezoneOffset: serverDate.getTimezoneOffset()
      });
    });

    return route
  },
  view: async (widget, state) => {
    return new WidgetViewRenderer(widget, state)
  },
})
