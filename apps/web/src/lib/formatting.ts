export function formatDate(iso: string, dateFormat: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (dateFormat === 'DD/MM/YYYY') return `${day}/${m}/${y}`;
  if (dateFormat === 'YYYY-MM-DD') return `${y}-${m}-${day}`;
  return `${m}/${day}/${y}`;
}

export function formatTime(iso: string, timeFormat: string): string {
  const d = new Date(iso);
  if (timeFormat === '24h') {
    return d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export function formatDateTime(iso: string, dateFormat: string, timeFormat: string): string {
  return `${formatDate(iso, dateFormat)}  ${formatTime(iso, timeFormat)}`;
}
