import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { logAction } from '../utils/audit'
import { parseStudentDirectoryQrPayload, parseStudentQrPayload } from '../utils/qr'
import StatusBadge from '../components/StatusBadge'

export default function StudentScan() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [event, setEvent] = useState(null)
  const [tab, setTab] = useState('qr') // 'qr' | 'manual'
  const [scanning, setScanning] = useState(false)
  const [message, setMessage] = useState(null)
  const [manual, setManual] = useState({ student_name: '', course: '' })
  const [recent, setRecent] = useState([])
  const scannerRef = useRef(null)
  const readerElId = 'student-scan-reader'
  // Prevents a single physical scan from being processed multiple times.
  // html5-qrcode's callback fires repeatedly (many times/sec) for as long as
  // a code is visible to the camera, so without a lock + cooldown, one scan
  // could register as several rapid duplicate check-ins/check-outs.
  const isProcessingRef = useRef(false)
  const lastScanRef = useRef({ code: null, time: 0 })
  const SCAN_COOLDOWN_MS = 4000
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    supabase.from('events').select('*').eq('id', eventId).single().then(({ data }) => setEvent(data))
    loadRecent()
  }, [eventId])

  const loadRecent = async () => {
    const { data } = await supabase
      .from('student_attendance')
      .select('*')
      .eq('event_id', eventId)
      .order('updated_at', { ascending: false })
      .limit(15)
    setRecent(data || [])
  }

  const counters = useMemo(() => ({
    in: recent.filter((r) => r.check_in_time && !r.check_out_time).length,
    completed: recent.filter((r) => r.check_in_time && r.check_out_time).length,
    pendingOut: recent.filter((r) => r.check_in_time && !r.check_out_time).length,
  }), [recent])

  /** Resolves a scanned/typed identity to a directory student_id if possible. */
  const resolveStudent = async ({ studentNo, studentName, course }) => {
    if (studentNo) {
      const { data } = await supabase.from('students').select('*').eq('student_no', studentNo).maybeSingle()
      if (data) return data
    }
    if (studentName) {
      const { data } = await supabase.from('students').select('*').ilike('full_name', studentName).maybeSingle()
      if (data) return data
    }
    return null
  }

  const recordScan = async ({ studentNo, studentName, course }, method) => {
    if (!studentName) {
      setMessage({ type: 'danger', text: 'Student name is required.' })
      return
    }
    const student = await resolveStudent({ studentNo, studentName, course })
    const resolvedName = (student?.full_name || studentName).trim()
    const resolvedCourse = (student?.course || course || 'N/A').trim()

    // Find an existing open record for this student at this event.
    // Prefer matching by student_id when we have it (exact, reliable).
    // Fall back to name+course matching for unregistered/manual entries —
    // use case/whitespace-insensitive matching (ilike) here, since two
    // manual entries for the same person can differ slightly in casing or
    // spacing and would otherwise slip past the duplicate check.
    const query = supabase.from('student_attendance').select('*').eq('event_id', eventId)
    const { data: existing } = student
      ? await query.eq('student_id', student.id).maybeSingle()
      : await query.ilike('student_name', resolvedName).ilike('course', resolvedCourse).maybeSingle()

    if (!existing) {
      const { data, error } = await supabase.from('student_attendance').insert({
        event_id: eventId,
        student_id: student?.id || null,
        student_name: resolvedName,
        course: resolvedCourse,
        status: 'present',
        check_in_time: new Date().toISOString(),
        method,
      }).select().single()
      if (error) return setMessage({ type: 'danger', text: error.message })
      await logAction(profile?.id, 'create', 'student_attendance', data.id, { method, direction: 'in' })
      setMessage({ type: 'success', text: `${resolvedName} checked IN.` })
    } else if (!existing.check_out_time) {
      const { data, error } = await supabase.from('student_attendance')
        .update({ check_out_time: new Date().toISOString() })
        .eq('id', existing.id).select().single()
      if (error) return setMessage({ type: 'danger', text: error.message })
      await logAction(profile?.id, 'update', 'student_attendance', data.id, { method, direction: 'out' })
      setMessage({ type: 'success', text: `${resolvedName} checked OUT.` })
    } else {
      setMessage({ type: 'warning', text: `${resolvedName} has already completed IN and OUT for this event.` })
    }
    loadRecent()
  }

  const handleManualSubmit = (e) => {
    e.preventDefault()
    recordScan({ studentName: manual.student_name.trim(), course: manual.course.trim() }, 'manual')
    setManual({ student_name: '', course: '' })
  }

  const startScanner = async () => {
    setMessage(null)
    setScanning(true)
    const qr = new Html5Qrcode(readerElId)
    scannerRef.current = qr
    try {
      await qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 240 },
        async (decodedText) => {
          // Ignore new detections while a scan is still being saved — the
          // camera can fire this callback many times per second for the
          // same code, and without this guard, two overlapping calls could
          // both find "no existing record" and each insert a row before
          // either finishes, creating a duplicate attendance entry.
          if (isProcessingRef.current) return

          // Ignore the *same* code again for a short cooldown window after
          // a successful scan, so holding the QR in front of the camera
          // doesn't immediately toggle IN -> OUT on the very next frame.
          const now = Date.now()
          if (lastScanRef.current.code === decodedText && now - lastScanRef.current.time < SCAN_COOLDOWN_MS) {
            return
          }

          isProcessingRef.current = true
          setProcessing(true)
          try {
            const directory = parseStudentDirectoryQrPayload(decodedText)
            if (directory) {
              await recordScan({ studentNo: directory.studentNo, studentName: directory.fullName }, 'qr_scan')
            } else {
              const { studentName, course } = parseStudentQrPayload(decodedText)
              await recordScan({ studentName, course }, 'qr_scan')
            }
            lastScanRef.current = { code: decodedText, time: now }
          } finally {
            isProcessingRef.current = false
            setProcessing(false)
          }
        }
      )
    } catch (err) {
      setMessage({ type: 'danger', text: 'Camera access failed: ' + err.message })
      setScanning(false)
    }
  }

  const stopScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); await scannerRef.current.clear() } catch { /* noop */ }
    }
    setScanning(false)
  }

  useEffect(() => () => { stopScanner() }, [])

  return (
    <div className="row g-3">
      <div className="col-lg-6">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h6 className="fw-bold mb-0" style={{ color: 'var(--navy-900)' }}>{event?.title || 'Loading…'}</h6>
            <div className="small text-muted">{event?.date}</div>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-sm btn-outline-navy" onClick={() => navigate(`/student-attendance/${eventId}/records`)}>
              <i className="bi bi-list-check me-1"></i>Records
            </button>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => navigate('/student-attendance')}>
              <i className="bi bi-arrow-left me-1"></i>Back
            </button>
          </div>
        </div>

        <div className="card-surface p-3">
          <ul className="nav nav-pills mb-3">
            <li className="nav-item">
              <button className={`nav-link ${tab === 'qr' ? 'active' : ''}`}
                style={tab === 'qr' ? { background: 'var(--navy-900)' } : {}}
                onClick={() => setTab('qr')}>QR Scan (IN/OUT)</button>
            </li>
            <li className="nav-item">
              <button className={`nav-link ${tab === 'manual' ? 'active' : ''}`}
                style={tab === 'manual' ? { background: 'var(--navy-900)' } : {}}
                onClick={() => { stopScanner(); setTab('manual') }}>Manual</button>
            </li>
          </ul>

          {tab === 'qr' ? (
            <>
              <div id={readerElId} style={{ minHeight: scanning ? 260 : 0 }}></div>
              {processing && (
                <div className="text-center small text-muted mt-2">
                  <span className="spinner-border spinner-border-sm me-1" role="status"></span>
                  Saving scan…
                </div>
              )}
              {!scanning ? (
                <button className="btn btn-navy w-100 mt-2" onClick={startScanner}>
                  <i className="bi bi-camera me-1"></i> Start Scanner
                </button>
              ) : (
                <button className="btn btn-outline-danger w-100 mt-2" onClick={stopScanner}>
                  <i className="bi bi-stop-circle me-1"></i> Stop Scanner
                </button>
              )}
            </>
          ) : (
            <form onSubmit={handleManualSubmit}>
              <div className="mb-2">
                <input className="form-control" placeholder="Student name" required
                  value={manual.student_name} onChange={(e) => setManual({ ...manual, student_name: e.target.value })} />
              </div>
              <div className="mb-2">
                <input className="form-control" placeholder="Course / Program"
                  value={manual.course} onChange={(e) => setManual({ ...manual, course: e.target.value })} />
              </div>
              <button className="btn btn-outline-navy w-100" type="submit">Record IN / OUT</button>
            </form>
          )}

          {message && <div className={`alert alert-${message.type} mt-3 py-2`}>{message.text}</div>}
        </div>
      </div>

      <div className="col-lg-6">
        <div className="row g-2 mb-3">
          <div className="col-4"><div className="stat-card py-2"><div><div className="stat-value">{counters.in}</div><div className="stat-label">IN</div></div></div></div>
          <div className="col-4"><div className="stat-card py-2"><div><div className="stat-value">{counters.completed}</div><div className="stat-label">Completed</div></div></div></div>
          <div className="col-4"><div className="stat-card py-2"><div><div className="stat-value">{counters.pendingOut}</div><div className="stat-label">Pending OUT</div></div></div></div>
        </div>

        <h6 className="fw-bold mb-2" style={{ color: 'var(--navy-900)' }}>Recent Scans</h6>
        <div className="table-surface">
          <div className="table-responsive">
            <table className="table mb-0">
              <thead><tr><th>Student</th><th>Course</th><th>In</th><th>Out</th></tr></thead>
              <tbody>
                {recent.length === 0 ? (
                  <tr><td colSpan="4" className="text-center text-muted py-4">No scans yet.</td></tr>
                ) : recent.map((r) => (
                  <tr key={r.id}>
                    <td>{r.student_name}</td>
                    <td className="small text-muted">{r.course}</td>
                    <td className="small text-muted">{r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString() : '—'}</td>
                    <td className="small text-muted">{r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString() : <StatusBadge status="partial" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
