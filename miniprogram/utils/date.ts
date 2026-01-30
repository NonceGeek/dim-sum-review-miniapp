// 辅助函数：将日期字符串转换为 Date 对象
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // 方法1: 直接尝试解析（适用于标准格式）
  let date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date;
  }

  // 方法2: 转换为 ISO 8601 格式（适用于 "YYYY-MM-DD HH:mm:ss.SSS"）
  const isoString = dateStr.replace(' ', 'T').split('.')[0] + 'Z';
  date = new Date(isoString);
  if (!isNaN(date.getTime())) {
    return date;
  }

  // 方法3: 手动解析 "YYYY-MM-DD HH:mm:ss" 或 "YYYY-MM-DD HH:mm:ss.SSS"
  const parts = dateStr.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d+)?/);
  if (parts) {
    return new Date(
      parseInt(parts[1]),
      parseInt(parts[2]) - 1,
      parseInt(parts[3]),
      parseInt(parts[4]),
      parseInt(parts[5]),
      parseInt(parts[6])
    );
  }

  return null;
}

export function formatTime(date: Date | string) {
  const d = typeof date === "string" ? parseDate(date) : date;

  if (!d || isNaN(d.getTime())) {
    console.error("无效的日期:", date);
    return "--";
  }

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
  if (!datetime) {
    return "--";
  }

  const date = parseDate(datetime);

  if (!date || isNaN(date.getTime())) {
    console.error("无效的日期格式:", datetime);
    return "--";
  }

  date.setTime(date.getTime() + 8 * 60 * 60 * 1000);
  return formatTime(date);
}

