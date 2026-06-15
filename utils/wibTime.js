/**
 * WIB Time Utility - Single Source of Truth for WIB (Asia/Jakarta) timezone handling
 * 
 * Aplikasi ini WAJIB beroperasi pada timezone WIB (UTC+7) terlepas dari timezone server.
 * Semua input waktu dari user adalah WIB, dan semua perbandingan jadwal harus WIB.
 * 
 * IMPORTANT: Hindari `new Date(year, month, day, h, m)` karena bergantung timezone server.
 * Selalu gunakan fungsi di file ini untuk parsing dan perbandingan waktu jadwal.
 */

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7
const WIB_TIMEZONE = 'Asia/Jakarta';

// Cache formatter untuk hemat alokasi memory pada interval scheduler
let _wibFormatter = null;
function getFormatter() {
  if (!_wibFormatter) {
    try {
      _wibFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: WIB_TIMEZONE,
        hour: 'numeric',
        minute: 'numeric',
        weekday: 'short',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour12: false
      });
    } catch (e) {
      _wibFormatter = null;
    }
  }
  return _wibFormatter;
}

const DAY_NAME_TO_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Get current time components in WIB timezone.
 * @param {Date} [date=new Date()]
 * @returns {{hours:number, minutes:number, day:number, year:number, month:number, dayOfMonth:number}}
 *   month is 0-indexed, day is day-of-week (0=Sun)
 */
function getWIBTime(date = new Date()) {
  const formatter = getFormatter();
  if (formatter) {
    try {
      const parts = formatter.formatToParts(date);
      let hours = 0, minutes = 0, dayName = '', year = 0, month = 0, dayOfMonth = 0;
      for (const part of parts) {
        switch (part.type) {
          case 'hour': hours = parseInt(part.value, 10); break;
          case 'minute': minutes = parseInt(part.value, 10); break;
          case 'weekday': dayName = part.value; break;
          case 'year': year = parseInt(part.value, 10); break;
          case 'month': month = parseInt(part.value, 10) - 1; break;
          case 'day': dayOfMonth = parseInt(part.value, 10); break;
        }
      }
      // Intl bisa kembalikan 24 untuk midnight
      if (hours === 24) hours = 0;
      const day = DAY_NAME_TO_INDEX[dayName] ?? 0;
      return { hours, minutes, day, year, month, dayOfMonth };
    } catch (_) {
      // fall through to manual calculation
    }
  }

  // Fallback manual: tambah 7 jam ke UTC
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  return {
    hours: wib.getUTCHours(),
    minutes: wib.getUTCMinutes(),
    day: wib.getUTCDay(),
    year: wib.getUTCFullYear(),
    month: wib.getUTCMonth(),
    dayOfMonth: wib.getUTCDate(),
  };
}

/**
 * Konversi komponen waktu WIB → Date object UTC yang merepresentasikan waktu tersebut.
 * @param {number} year
 * @param {number} month - 0-indexed
 * @param {number} day
 * @param {number} hours
 * @param {number} minutes
 * @param {number} [seconds=0]
 * @returns {Date}
 */
function createWIBDate(year, month, day, hours, minutes, seconds = 0) {
  // WIB = UTC+7, jadi UTC = WIB - 7 jam.
  // Date.UTC menormalkan rollover hari/bulan/tahun otomatis bila nilai negatif/over.
  return new Date(Date.UTC(year, month, day, hours - 7, minutes, seconds, 0));
}

/**
 * Parse string datetime-local ("YYYY-MM-DDTHH:MM") sebagai waktu WIB → Date UTC.
 * INI ADALAH FUNGSI KRITIS — pengganti `new Date(year, m-1, d, h, m)` yang bergantung TZ server.
 * 
 * @param {string} dateTimeString - "YYYY-MM-DDTHH:MM" atau "YYYY-MM-DDTHH:MM:SS"
 * @returns {Date|null} Date dalam UTC, atau null bila format invalid
 */
function parseWIBDateTimeLocal(dateTimeString) {
  if (!dateTimeString || typeof dateTimeString !== 'string') return null;
  const [datePart, timePart] = dateTimeString.split('T');
  if (!datePart || !timePart) return null;

  const dateParts = datePart.split('-').map(Number);
  const timeParts = timePart.split(':').map(Number);
  if (dateParts.length !== 3 || timeParts.length < 2) return null;

  const [year, month, day] = dateParts;
  const [hours, minutes, seconds = 0] = timeParts;

  if ([year, month, day, hours, minutes, seconds].some(v => Number.isNaN(v))) return null;

  return createWIBDate(year, month - 1, day, hours, minutes, seconds);
}

/**
 * Format Date object → "YYYY-MM-DDTHH:MM" dalam WIB.
 * Berguna untuk mengisi <input type="datetime-local"> dari nilai DB (UTC ISO).
 * @param {Date|string} dateOrIso
 * @returns {string}
 */
function formatWIBDateTimeLocal(dateOrIso) {
  if (!dateOrIso) return '';
  const date = (dateOrIso instanceof Date) ? dateOrIso : new Date(dateOrIso);
  if (isNaN(date.getTime())) return '';
  const wib = getWIBTime(date);
  const pad = n => String(n).padStart(2, '0');
  return `${wib.year}-${pad(wib.month + 1)}-${pad(wib.dayOfMonth)}T${pad(wib.hours)}:${pad(wib.minutes)}`;
}

/**
 * Total menit sejak tengah malam dalam WIB.
 * @param {Date} [date=new Date()]
 * @returns {number}
 */
function getWIBMinutesSinceMidnight(date = new Date()) {
  const { hours, minutes } = getWIBTime(date);
  return hours * 60 + minutes;
}

module.exports = {
  WIB_TIMEZONE,
  WIB_OFFSET_MS,
  getWIBTime,
  createWIBDate,
  parseWIBDateTimeLocal,
  formatWIBDateTimeLocal,
  getWIBMinutesSinceMidnight,
};
