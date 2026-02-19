import { useStore } from '@nanostores/vue';
import { $settings } from '@/stores/settings';
import { formatDate, formatTime, formatDateTime } from '@/lib/formatting';

export function useFormatting() {
  const settings = useStore($settings);

  return {
    formatDate: (iso: string) => formatDate(iso, settings.value.dateFormat),
    formatTime: (iso: string) => formatTime(iso, settings.value.timeFormat),
    formatDateTime: (iso: string) =>
      formatDateTime(iso, settings.value.dateFormat, settings.value.timeFormat),
  };
}
