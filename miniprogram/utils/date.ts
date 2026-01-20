export function formatTime(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const pad = (n: number) => (n < 10 ? `0${n}` : n);

  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hour = pad(d.getHours());
  const minute = pad(d.getMinutes());
  const second = pad(d.getSeconds());

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

export function add8Hours(datetime: string) {
  const date = new Date(datetime);
  date.setTime(date.getTime() + 8 * 60 * 60 * 1000);
  return formatTime(date);
}
