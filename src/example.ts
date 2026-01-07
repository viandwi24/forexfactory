import { ForexFactory } from "."

const ff = new ForexFactory

// get events in calendar
// const calendar = await ff.calendarEvents("2025-12-28", "2026-01-03")
// console.log(JSON.stringify(calendar, null, 2))

//  get details event
// const event = await ff.calendarEventDetail(calendar.data[0]?.events[0]?.eventId ?? 0)
// console.log(JSON.stringify(event, null, 2))

// get news list
// const newsList = await ff.news()
// console.log(JSON.stringify(newsList, null, 2))

// get news detail
// const newsDetail = await ff.newsDetail("https://www.forexfactory.com/news/1378004-trump-weighs-using-us-military-to-acquire-greenland")
// console.log(JSON.stringify(newsDetail, null, 2))