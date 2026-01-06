import { ForexFactory } from "."

const ff = new ForexFactory
const calendar = await ff.fetchCalendarEvents()
console.log(JSON.stringify(calendar, null, 2))