function dayKeyUTC(dateInput = new Date()) {
  const date = new Date(dateInput);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function subtractDaysUTC(dayKey, days) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - days);
  return dayKeyUTC(d);
}

function startOfCurrentWeekUTC() {
  const now = new Date();
  const utcDay = now.getUTCDay();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - utcDay);
  return start;
}

module.exports = {
  dayKeyUTC,
  subtractDaysUTC,
  startOfCurrentWeekUTC,
};
