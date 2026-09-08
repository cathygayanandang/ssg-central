import Papa from 'papaparse'
import * as XLSX from 'xlsx'

// Accepted column headers (case-insensitive) and the field they map to.
const HEADER_MAP = {
  first_name: 'first_name', 'first name': 'first_name', firstname: 'first_name',
  last_name: 'last_name', 'last name': 'last_name', lastname: 'last_name',
  course: 'course', program: 'course',
  year_level: 'year_level', 'year level': 'year_level', year: 'year_level',
  email: 'email',
  phone: 'phone', 'phone number': 'phone', contact: 'phone',
}

function normalizeRow(raw) {
  const row = {}
  for (const [key, value] of Object.entries(raw)) {
    const field = HEADER_MAP[key.trim().toLowerCase()]
    if (field) row[field] = typeof value === 'string' ? value.trim() : value
  }
  return row
}

function validateRow(row, index) {
  const errors = []
  if (!row.first_name) errors.push('missing first name')
  if (!row.last_name) errors.push('missing last name')
  if (!row.course) errors.push('missing course')
  const year = Number(row.year_level) || 1
  return {
    rowNumber: index + 2, // +1 for header row, +1 for 1-based
    first_name: row.first_name || '',
    last_name: row.last_name || '',
    course: row.course || '',
    year_level: year >= 1 && year <= 6 ? year : 1,
    email: row.email || '',
    phone: row.phone || '',
    errors,
  }
}

/** Parses a CSV File object. Resolves with { rows, errorCount }. */
export function parseStudentCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const rows = result.data.map((raw, i) => validateRow(normalizeRow(raw), i))
        resolve({ rows, errorCount: rows.filter((r) => r.errors.length).length })
      },
      error: reject,
    })
  })
}

/** Parses an Excel (.xlsx/.xls) File object. Resolves with { rows, errorCount }. */
export function parseStudentExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' })
        const rows = raw.map((r, i) => validateRow(normalizeRow(r), i))
        resolve({ rows, errorCount: rows.filter((r) => r.errors.length).length })
      } catch (err) {
        reject(err)
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

export function parseStudentFile(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv')) return parseStudentCsv(file)
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return parseStudentExcel(file)
  return Promise.reject(new Error('Unsupported file type — please upload a .csv or .xlsx file.'))
}
