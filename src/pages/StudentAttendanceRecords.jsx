import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { downloadCsv } from '../utils/csv'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'

export default function StudentAttendanceRecords() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const [event, setEvent] = useState(null)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [courseFilter, setCourseFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [view, setView] = useState('flat') // 'flat' | 'course'

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: ev }, { data: rows }] = await Promise.all([
        supabase.from('events').select('*').eq('id', eventId).single(),
        supabase.from('student_attendance').select('*').eq('event_id', eventId).order('check_in_time', { ascending: false }),
      ])
      setEvent(ev)
      setRecords(rows || [])
      setLoading(false)
    }
    load()
  }, [eventId])

  const courses = useMemo(() => [...new Set(records.map((r) => r.course))].sort(), [records])

  const filtered = useMemo(() => records.filter((r) => {
    if (courseFilter && r.course !== courseFilter) return false
    if (statusFilter && r.status !== statusFilter) return false
    if (search && !`${r.student_name} ${r.course}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [records, search, courseFilter, statusFilter])

  const byCourse = useMemo(() => {
    const map = {}
    filtered.forEach((r) => {
      map[r.course] = map[r.course] || { present: 0, absent: 0, total: 0 }
      map[r.course].total += 1
      if (r.status === 'present') map[r.course].present += 1
      else map[r.course].absent += 1
    })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const handleExport = () => {
    downloadCsv(`${event?.title || 'attendance'}-${event?.date || ''}.csv`, filtered.map((r) => ({
      student_name: r.student_name,
      course: r.course,
      status: r.status,
      check_in_time: r.check_in_time || '',
      check_out_time: r.check_out_time || '',
      method: r.method,
    })))
  }

  const presentCount = records.filter((r) => r.status === 'present').length

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h6 className="fw-bold mb-0" style={{ color: 'var(--navy-900)' }}>{event?.title || 'Loading…'}</h6>
          <div className="small text-muted">{event?.date} · {event?.location}</div>
        </div>
        <button className="btn btn-outline-secondary" onClick={() => navigate('/student-attendance')}>
          <i className="bi bi-arrow-left me-1"></i>Back
        </button>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-4"><StatCard icon="bi-people" label="Total Records" value={records.length} accent="#12203d" /></div>
        <div className="col-4"><StatCard icon="bi-person-check" label="Present" value={presentCount} accent="#3f7a5e" /></div>
        <div className="col-4"><StatCard icon="bi-diagram-3" label="Courses Involved" value={courses.length} accent="#3a5a8c" /></div>
      </div>

      <div className="card-surface p-3 mb-3">
        <h6 className="fw-bold mb-2" style={{ color: 'var(--navy-900)' }}>Attendance by Course</h6>
        <div className="row g-2">
          {byCourse.length === 0 ? (
            <div className="text-muted small">No records yet.</div>
          ) : byCourse.map(([course, c]) => (
            <div className="col-md-3 col-6" key={course}>
              <div className="border rounded-3 p-2 small">
                <div className="fw-semibold">{course}</div>
                <div className="text-muted">{c.present} present · {c.absent} absent</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
        <div className="d-flex gap-2 flex-wrap">
          <input className="form-control form-control-sm" style={{ maxWidth: 200 }} placeholder="Search…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="form-select form-select-sm" style={{ maxWidth: 160 }} value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
            <option value="">All courses</option>
            {courses.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="form-select form-select-sm" style={{ maxWidth: 140 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
          </select>
          <div className="btn-group">
            <button className={`btn btn-sm ${view === 'flat' ? 'btn-navy' : 'btn-outline-navy'}`} onClick={() => setView('flat')}>Flat List</button>
            <button className={`btn btn-sm ${view === 'course' ? 'btn-navy' : 'btn-outline-navy'}`} onClick={() => setView('course')}>By Course</button>
          </div>
        </div>
        <button className="btn btn-sm btn-outline-navy" onClick={handleExport}>
          <i className="bi bi-download me-1"></i> Export CSV
        </button>
      </div>

      {view === 'flat' ? (
        <RecordsTable rows={filtered} loading={loading} />
      ) : (
        <div className="d-flex flex-column gap-3">
          {byCourse.map(([course]) => (
            <div key={course}>
              <h6 className="fw-bold mb-2" style={{ color: 'var(--navy-900)' }}>{course}</h6>
              <RecordsTable rows={filtered.filter((r) => r.course === course)} loading={false} hideCourse />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RecordsTable({ rows, loading, hideCourse }) {
  return (
    <div className="table-surface">
      <div className="table-responsive">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Student</th>
              {!hideCourse && <th>Course</th>}
              <th>Status</th>
              <th>Time in</th>
              <th>Time out</th>
              <th>Method</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="text-center text-muted py-4">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan="6" className="text-center text-muted py-4">No records found.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                <td>{r.student_name}</td>
                {!hideCourse && <td className="small text-muted">{r.course}</td>}
                <td><StatusBadge status={r.status} /></td>
                <td className="small text-muted">{r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString() : '—'}</td>
                <td className="small text-muted">{r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString() : '—'}</td>
                <td className="text-capitalize small text-muted">{r.method?.replace('_', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
