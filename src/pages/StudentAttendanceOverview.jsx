import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'

export default function StudentAttendanceOverview() {
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ totalEvents: 0, presentRecords: 0, totalScans: 0 })

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: eventRows } = await supabase.from('events').select('*').order('date', { ascending: false })
      const { data: attendanceRows } = await supabase
        .from('student_attendance')
        .select('event_id, status, course, check_in_time, check_out_time')

      const rows = attendanceRows || []
      const perEvent = {}
      rows.forEach((r) => {
        perEvent[r.event_id] = perEvent[r.event_id] || { present: 0, total: 0, courses: new Set() }
        perEvent[r.event_id].total += 1
        if (r.status === 'present') perEvent[r.event_id].present += 1
        perEvent[r.event_id].courses.add(r.course)
      })

      const enriched = (eventRows || []).map((ev) => ({
        ...ev,
        present: perEvent[ev.id]?.present || 0,
        total: perEvent[ev.id]?.total || 0,
        courseCount: perEvent[ev.id]?.courses.size || 0,
      }))

      const totalScans = rows.reduce((sum, r) => sum + (r.check_in_time ? 1 : 0) + (r.check_out_time ? 1 : 0), 0)

      setEvents(enriched)
      setStats({
        totalEvents: eventRows?.length || 0,
        presentRecords: rows.filter((r) => r.status === 'present').length,
        totalScans,
      })
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div>
      <div className="row g-3 mb-3">
        <div className="col-4">
          <StatCard icon="bi-calendar-event" label="Total Events" value={stats.totalEvents} accent="#12203d" />
        </div>
        <div className="col-4">
          <StatCard icon="bi-person-check" label="Present Records" value={stats.presentRecords} accent="#3f7a5e" />
        </div>
        <div className="col-4">
          <StatCard icon="bi-qr-code-scan" label="Total Scans" value={stats.totalScans} accent="#3a5a8c" />
        </div>
      </div>

      <div className="table-surface">
        <div className="table-responsive">
          <table className="table mb-0">
            <thead>
              <tr>
                <th>Event</th>
                <th>Date</th>
                <th>Status</th>
                <th>Present / Total</th>
                <th>Courses</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="text-center text-muted py-4">Loading…</td></tr>
              ) : events.length === 0 ? (
                <tr><td colSpan="6" className="text-center text-muted py-4">No events yet — create one from the Events page.</td></tr>
              ) : (
                events.map((ev) => (
                  <tr key={ev.id}>
                    <td className="fw-semibold">{ev.title}</td>
                    <td className="small text-muted">{ev.date}</td>
                    <td><StatusBadge status={ev.status} /></td>
                    <td>{ev.present} / {ev.total}</td>
                    <td className="small text-muted">{ev.courseCount || '—'}</td>
                    <td className="text-end">
                      {['upcoming', 'ongoing'].includes(ev.status) && (
                        <button className="btn btn-sm btn-navy me-1" onClick={() => navigate(`/student-attendance/${ev.id}/scan`)}>
                          <i className="bi bi-qr-code-scan me-1"></i>Scan
                        </button>
                      )}
                      <button className="btn btn-sm btn-outline-navy" onClick={() => navigate(`/student-attendance/${ev.id}/records`)}>
                        <i className="bi bi-list-check me-1"></i>Records
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
