function pad(value) {
  return String(value).padStart(2, '0');
}

function dateKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function sortEvents(events = []) {
  return [...events].sort((left, right) => {
    const dateOrder = String(left.date || '').localeCompare(String(right.date || ''));
    if (dateOrder !== 0) return dateOrder;
    return Number(left.createdAt || 0) - Number(right.createdAt || 0);
  });
}

function getMonthGrid(year, month, events = []) {
  const firstDay = new Date(year, month, 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - mondayOffset);
  const eventsByDate = sortEvents(events).reduce((result, event) => {
    const key = String(event.date || '');
    if (!key) return result;
    (result[key] ||= []).push(event);
    return result;
  }, {});

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = dateKey(date);
    const dayEvents = eventsByDate[key] || [];
    return {
      date: key,
      day: date.getDate(),
      inMonth: date.getMonth() === month,
      isToday: key === dateKey(),
      hasEvent: dayEvents.length > 0,
      events: dayEvents
    };
  });
}

function shiftMonth(year, month, delta) {
  const value = new Date(year, month + delta, 1);
  return { year: value.getFullYear(), month: value.getMonth() };
}

module.exports = { dateKey, sortEvents, getMonthGrid, shiftMonth };
