const calendarDatePattern = /^(\d{4})-(\d{2})-(\d{2})/

export const toCalendarDateInput = (value: string | null | undefined) => {
  if (!value) return ''
  return value.match(calendarDatePattern)?.[0] || ''
}

const parseCalendarDate = (value: string) => {
  const match = value.match(calendarDatePattern)
  if (!match) return null

  const [, yearValue, monthValue, dayValue] = match
  const year = Number(yearValue)
  const month = Number(monthValue)
  const day = Number(dayValue)
  const parsed = new Date(year, month - 1, day, 12)

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null
  }

  return parsed
}

export const formatCalendarDate = (
  value: string,
  options: Intl.DateTimeFormatOptions = {}
) => {
  const parsed = parseCalendarDate(value)
  if (!parsed) return 'Data inválida'

  return new Intl.DateTimeFormat('pt-BR', options).format(parsed)
}

export const formatInstant = (
  value: string,
  options: Intl.DateTimeFormatOptions = {}
) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Data inválida'

  return new Intl.DateTimeFormat('pt-BR', options).format(parsed)
}
