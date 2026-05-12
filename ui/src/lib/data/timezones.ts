/**
 * Curated IANA timezones — every city tech workers usually live or hire in,
 * grouped roughly by region. The display label uses the city + UTC offset
 * so the user picks "Vancouver (UTC-8)" rather than "America/Vancouver"
 * — but the persisted value is always the canonical IANA name.
 *
 * Free-text fallback through the Combobox handles obscure timezones we
 * didn't enumerate.
 */
export type Timezone = { value: string; label: string; offset: string };

export const TIMEZONES: Timezone[] = [
  // Pacific North America
  { value: 'America/Anchorage', label: 'Anchorage · AKST', offset: 'UTC-9' },
  { value: 'America/Los_Angeles', label: 'Los Angeles · PST', offset: 'UTC-8' },
  { value: 'America/Vancouver', label: 'Vancouver · PST', offset: 'UTC-8' },
  { value: 'America/Tijuana', label: 'Tijuana · PST', offset: 'UTC-8' },
  // Mountain
  { value: 'America/Denver', label: 'Denver · MST', offset: 'UTC-7' },
  { value: 'America/Edmonton', label: 'Edmonton · MST', offset: 'UTC-7' },
  { value: 'America/Phoenix', label: 'Phoenix · MST (no DST)', offset: 'UTC-7' },
  // Central
  { value: 'America/Chicago', label: 'Chicago · CST', offset: 'UTC-6' },
  { value: 'America/Mexico_City', label: 'Mexico City · CST', offset: 'UTC-6' },
  { value: 'America/Winnipeg', label: 'Winnipeg · CST', offset: 'UTC-6' },
  // Eastern
  { value: 'America/New_York', label: 'New York · EST', offset: 'UTC-5' },
  { value: 'America/Toronto', label: 'Toronto · EST', offset: 'UTC-5' },
  { value: 'America/Bogota', label: 'Bogotá · COT', offset: 'UTC-5' },
  { value: 'America/Lima', label: 'Lima · PET', offset: 'UTC-5' },
  // Atlantic / South America
  { value: 'America/Halifax', label: 'Halifax · AST', offset: 'UTC-4' },
  { value: 'America/Santiago', label: 'Santiago · CLT', offset: 'UTC-4' },
  { value: 'America/Caracas', label: 'Caracas · VET', offset: 'UTC-4' },
  { value: 'America/St_Johns', label: "St. John's · NST", offset: 'UTC-3:30' },
  { value: 'America/Sao_Paulo', label: 'São Paulo · BRT', offset: 'UTC-3' },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires · ART', offset: 'UTC-3' },
  { value: 'America/Montevideo', label: 'Montevideo · UYT', offset: 'UTC-3' },
  // Atlantic
  { value: 'Atlantic/Azores', label: 'Azores · AZOT', offset: 'UTC-1' },
  // UTC + Western Europe
  { value: 'UTC', label: 'UTC · Coordinated Universal Time', offset: 'UTC+0' },
  { value: 'Europe/London', label: 'London · GMT', offset: 'UTC+0' },
  { value: 'Europe/Lisbon', label: 'Lisbon · WET', offset: 'UTC+0' },
  { value: 'Europe/Dublin', label: 'Dublin · GMT', offset: 'UTC+0' },
  // Central Europe
  { value: 'Europe/Berlin', label: 'Berlin · CET', offset: 'UTC+1' },
  { value: 'Europe/Paris', label: 'Paris · CET', offset: 'UTC+1' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam · CET', offset: 'UTC+1' },
  { value: 'Europe/Madrid', label: 'Madrid · CET', offset: 'UTC+1' },
  { value: 'Europe/Rome', label: 'Rome · CET', offset: 'UTC+1' },
  { value: 'Europe/Zurich', label: 'Zurich · CET', offset: 'UTC+1' },
  { value: 'Europe/Vienna', label: 'Vienna · CET', offset: 'UTC+1' },
  { value: 'Europe/Stockholm', label: 'Stockholm · CET', offset: 'UTC+1' },
  { value: 'Europe/Oslo', label: 'Oslo · CET', offset: 'UTC+1' },
  { value: 'Europe/Copenhagen', label: 'Copenhagen · CET', offset: 'UTC+1' },
  { value: 'Europe/Warsaw', label: 'Warsaw · CET', offset: 'UTC+1' },
  // Eastern Europe
  { value: 'Europe/Athens', label: 'Athens · EET', offset: 'UTC+2' },
  { value: 'Europe/Helsinki', label: 'Helsinki · EET', offset: 'UTC+2' },
  { value: 'Europe/Bucharest', label: 'Bucharest · EET', offset: 'UTC+2' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg · SAST', offset: 'UTC+2' },
  { value: 'Africa/Cairo', label: 'Cairo · EET', offset: 'UTC+2' },
  // Middle East
  { value: 'Europe/Istanbul', label: 'Istanbul · TRT', offset: 'UTC+3' },
  { value: 'Europe/Moscow', label: 'Moscow · MSK', offset: 'UTC+3' },
  { value: 'Asia/Riyadh', label: 'Riyadh · AST', offset: 'UTC+3' },
  { value: 'Asia/Tehran', label: 'Tehran · IRST', offset: 'UTC+3:30' },
  { value: 'Asia/Dubai', label: 'Dubai · GST', offset: 'UTC+4' },
  { value: 'Asia/Karachi', label: 'Karachi · PKT', offset: 'UTC+5' },
  { value: 'Asia/Kolkata', label: 'India · IST', offset: 'UTC+5:30' },
  { value: 'Asia/Dhaka', label: 'Dhaka · BST', offset: 'UTC+6' },
  { value: 'Asia/Bangkok', label: 'Bangkok · ICT', offset: 'UTC+7' },
  { value: 'Asia/Jakarta', label: 'Jakarta · WIB', offset: 'UTC+7' },
  // East Asia
  { value: 'Asia/Singapore', label: 'Singapore · SGT', offset: 'UTC+8' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong · HKT', offset: 'UTC+8' },
  { value: 'Asia/Shanghai', label: 'Shanghai · CST', offset: 'UTC+8' },
  { value: 'Asia/Taipei', label: 'Taipei · CST', offset: 'UTC+8' },
  { value: 'Asia/Manila', label: 'Manila · PHT', offset: 'UTC+8' },
  { value: 'Australia/Perth', label: 'Perth · AWST', offset: 'UTC+8' },
  { value: 'Asia/Tokyo', label: 'Tokyo · JST', offset: 'UTC+9' },
  { value: 'Asia/Seoul', label: 'Seoul · KST', offset: 'UTC+9' },
  // Australia / Pacific
  { value: 'Australia/Adelaide', label: 'Adelaide · ACDT', offset: 'UTC+9:30' },
  { value: 'Australia/Sydney', label: 'Sydney · AEDT', offset: 'UTC+10' },
  { value: 'Australia/Melbourne', label: 'Melbourne · AEDT', offset: 'UTC+10' },
  { value: 'Australia/Brisbane', label: 'Brisbane · AEST', offset: 'UTC+10' },
  { value: 'Pacific/Auckland', label: 'Auckland · NZDT', offset: 'UTC+12' },
];
