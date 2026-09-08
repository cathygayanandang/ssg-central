/**
 * QR payload format for an SSG officer badge:
 *   SSGC|OFFICER|<officers_id>|<full_name>
 *
 * QR payload format for a student directory badge (generated once a
 * student is added to the Students Directory):
 *   SSGC|STUDENT|<student_no>|<full_name>
 *
 * If a school-issued student ID doesn't use this format, the scanner
 * falls back to a plain `<name>|<course>` payload, or treats the whole
 * scanned string as the student's name — correctable via manual entry.
 */

export function buildOfficerQrPayload(officersId, fullName) {
  return `SSGC|OFFICER|${officersId}|${fullName}`
}

export function parseOfficerQrPayload(raw) {
  const parts = String(raw).split('|')
  if (parts[0] === 'SSGC' && parts[1] === 'OFFICER') {
    return { officersId: parts[2], fullName: parts[3] }
  }
  return null
}

export function buildStudentQrPayload(studentNo, fullName) {
  return `SSGC|STUDENT|${studentNo}|${fullName}`
}

/**
 * Returns { studentNo, fullName } for a directory-issued badge, or null
 * if the payload isn't in that format (caller should fall back to
 * parseStudentQrPayload for freeform / school-issued IDs).
 */
export function parseStudentDirectoryQrPayload(raw) {
  const parts = String(raw).split('|')
  if (parts[0] === 'SSGC' && parts[1] === 'STUDENT') {
    return { studentNo: parts[2], fullName: parts[3] }
  }
  return null
}

export function parseStudentQrPayload(raw) {
  const text = String(raw).trim()
  if (text.includes('|')) {
    const [name, course] = text.split('|')
    return { studentName: name?.trim(), course: course?.trim() || 'N/A' }
  }
  // Fallback: treat whole payload as the student's name
  return { studentName: text, course: 'N/A' }
}
