import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import StatCard from '../components/StatCard'
import StatusBadge from '../components/StatusBadge'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

const NAVY = '#12203d'
const GOLD = '#c8a45e'
const GREEN = '#3f7a5e'
const RED = '#b1465a'

const QUICK_ACTIONS = [
  { label: 'New Event', icon: 'bi-calendar-plus', to: '/events' },
  { label: 'Add User', icon: 'bi-person-plus', to: '/officers' },
  { label: 'Bulk Import', icon: 'bi-upload', to: '/students/bulk-import' },
  { label: 'Student Attendance', icon: 'bi-qr-code-scan', to: '/student-attendance' },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const { profile, isAdmin } = useAuth()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    officers: 0, admins: 0, staff: 0,
    students: 0, courses: 0,
    events: 0, activeEvents: 0,
    fines: 0, unpaidFines: 0,
  })
  const [attendanceByEvent, setAttendanceByEvent] = useState({ labels: [], present: [], absent: [] })
  const [overallAttendance, setOverallAttendance] = useState({ present: 0, absent: 0 })
  const [recentEvents, setRecentEvents] = useState([])
  const [recentStudentAttendance, setRecentStudentAttendance] = useState([])

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)

      const [
        { data: peopleRows },
        { data: studentRows },
        { count: eventCount },
        { data: allEvents },
        { data: fineRows },
        { data: eventsForChart },
        { data: allStudentAttendance },
        { data: recentEventRows },
      ] = await Promise.all([
        supabase.from('people').select('id, role').eq('is_active', true),
        supabase.from('students').select('id, course').eq('status', 'active'),
        supabase.from('events').select('*', { count: 'exact', head: true }),
        supabase.from('events').select('id, status'),
        supabase.from('fines').select('id, event_id, amount, status'),
        supabase.from('events').select('id, title').order('date', { ascending: false }).limit(5),
        supabase.from('student_attendance').select('event_id, status'),
        supabase.from('events').select('*').order('date', { ascending: false }).limit(5),
      ])

      // --- stat card breakdowns ---
      const people = peopleRows || []
      const admins = people.filter((p) => p.role === 'admin').length
      const staff = people.length - admins

      const students = studentRows || []
      const courses = new Set(students.map((s) => s.course)).size

      const activeEvents = (allEvents || []).filter((e) => ['upcoming', 'ongoing'].includes(e.status)).length

      const fines = fineRows || []
      const unpaidFines = fines.filter((f) => f.status !== 'paid').length

      // --- attendance chart ---
      const rows = allStudentAttendance || []
      const eventIds = (eventsForChart || []).map((e) => e.id)
      const labels = (eventsForChart || []).map((e) => e.title)
      const present = eventIds.map((id) => rows.filter((r) => r.event_id === id && r.status === 'present').length)
      const absent = eventIds.map((id) => rows.filter((r) => r.event_id === id && r.status === 'absent').length)

      const totalPresent = rows.filter((r) => r.status === 'present').length
      const totalAbsent = rows.filter((r) => r.status === 'absent').length

      // --- recent events, enriched with total fines tied to each event ---
      const recentIds = (recentEventRows || []).map((e) => e.id)
      const fineTotalByEvent = {}
      fines.forEach((f) => {
        if (!f.event_id || !recentIds.includes(f.event_id)) return
        fineTotalByEvent[f.event_id] = (fineTotalByEvent[f.event_id] || 0) + Number(f.amount || 0)
      })
      const enrichedRecentEvents = (recentEventRows || []).map((ev) => ({
        ...ev,
        fineTotal: fineTotalByEvent[ev.id] || 0,
      }))

      // --- recent student attendance, with full record detail ---
      const { data: recentSA } = await supabase
        .from('student_attendance')
        .select('*, events:event_id(title)')
        .order('check_in_time', { ascending: false })
        .limit(10)

      if (!active) return
      setStats({
        officers: people.length, admins, staff,
        students: students.length, courses,
        events: eventCount || 0, activeEvents,
        fines: fines.length, unpaidFines,
      })
      setAttendanceByEvent({ labels, present, absent })
      setOverallAttendance({ present: totalPresent, absent: totalAbsent })
      setRecentEvents(enrichedRecentEvents)
      setRecentStudentAttendance(recentSA || [])
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [])

  const eventDateBadge = (dateStr) => {
    if (!dateStr) return { day: '—', month: '' }
    const d = new Date(dateStr)
    return {
      day: d.getDate(),
      month: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    }
  }

  return (
    <div>
      <div
        className="card-surface p-3 mb-3 d-flex justify-content-between align-items-center flex-wrap gap-2"
        style={{ background: 'var(--navy-900)', color: '#fff' }}
      >
        <div>
          <h5 className="fw-bold mb-1">Welcome, {profile?.full_name?.split(' ')[0] || 'there'}</h5>
          <div className="small" style={{ opacity: 0.8 }}>SSG organization status at a glance.</div>
        </div>
        <span className="badge-status" style={{ background: 'var(--gold-500, #c8a45e)', color: 'var(--navy-900)' }}>
          {isAdmin ? 'ADMIN' : 'OFFICER'}
        </span>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-6 col-lg-3">
          <StatCard
            icon="bi-people-fill" label="Users & Officers" value={stats.officers} accent={NAVY}
            sub={`${stats.admins} admin${stats.admins === 1 ? '' : 's'} · ${stats.staff} officer${stats.staff === 1 ? '' : 's'}`}
          />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard
            icon="bi-mortarboard-fill" label="Students" value={stats.students} accent="#3a5a8c"
            sub={`${stats.courses} course${stats.courses === 1 ? '' : 's'}`}
          />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard
            icon="bi-calendar-check" label="Events" value={stats.events} accent={GOLD}
            sub={`${stats.activeEvents} active`}
          />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard
            icon="bi-cash-stack" label="Fines" value={stats.fines} accent={RED}
            sub={`${stats.unpaidFines} unpaid`}
          />
        </div>
      </div>

      <div className="card-surface p-3 mb-3">
        <h6 className="fw-bold mb-3" style={{ color: 'var(--navy-900)' }}>Quick Actions</h6>
        <div className="row g-2">
          {QUICK_ACTIONS.map((action) => (
            <div className="col-6 col-lg-3" key={action.label}>
              <button className="btn btn-outline-navy w-100 h-100 py-3" onClick={() => navigate(action.to)}>
                <i className={`bi ${action.icon} d-block fs-4 mb-1`}></i>
                <span className="small">{action.label}</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-lg-8">
          <div className="card-surface p-3 h-100">
            <h6 className="fw-bold mb-3" style={{ color: 'var(--navy-900)' }}>Attendance by Event</h6>
            {loading ? (
              <div className="text-muted small">Loading…</div>
            ) : attendanceByEvent.labels.length ? (
              <Bar
                data={{
                  labels: attendanceByEvent.labels,
                  datasets: [
                    { label: 'Present', data: attendanceByEvent.present, backgroundColor: NAVY, borderRadius: 6 },
                    { label: 'Absent', data: attendanceByEvent.absent, backgroundColor: RED, borderRadius: 6 },
                  ],
                }}
                options={{
                  responsive: true,
                  plugins: { legend: { position: 'bottom' } },
                  scales: {
                    x: { stacked: true },
                    y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
                  },
                }}
              />
            ) : (
              <div className="text-muted small">No student attendance recorded yet.</div>
            )}
          </div>
        </div>
        <div className="col-lg-4">
          <div className="card-surface p-3 h-100">
            <h6 className="fw-bold mb-3" style={{ color: 'var(--navy-900)' }}>Overall Attendance</h6>
            {loading ? (
              <div className="text-muted small">Loading…</div>
            ) : (overallAttendance.present + overallAttendance.absent) === 0 ? (
              <div className="text-muted small">No attendance recorded yet.</div>
            ) : (
              <Doughnut
                data={{
                  labels: ['Present', 'Absent'],
                  datasets: [{ data: [overallAttendance.present, overallAttendance.absent], backgroundColor: [GREEN, RED], borderWidth: 0 }],
                }}
                options={{ plugins: { legend: { position: 'bottom' } } }}
              />
            )}
          </div>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-lg-6">
          <div className="card-surface p-3 h-100">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="fw-bold mb-0" style={{ color: 'var(--navy-900)' }}>Recent Events</h6>
              <button className="btn btn-sm btn-outline-navy" onClick={() => navigate('/events')}>View All</button>
            </div>
            {recentEvents.length === 0 ? (
              <div className="text-muted small">No events yet.</div>
            ) : (
              <ul className="list-unstyled mb-0">
                {recentEvents.map((ev) => {
                  const { day, month } = eventDateBadge(ev.date)
                  return (
                    <li key={ev.id} className="d-flex align-items-center gap-3 py-2 border-bottom">
                      <div
                        className="d-flex flex-column align-items-center justify-content-center flex-shrink-0"
                        style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--navy-900)', color: '#fff' }}
                      >
                        <div className="fw-bold" style={{ fontSize: '0.95rem', lineHeight: 1 }}>{day}</div>
                        <div style={{ fontSize: '0.6rem', letterSpacing: '0.5px' }}>{month}</div>
                      </div>
                      <div className="flex-grow-1">
                        <div className="fw-semibold small">{ev.title}</div>
                        <div className="text-muted small">{ev.type || '—'}{ev.location ? ` · ${ev.location}` : ''}</div>
                      </div>
                      <div className="d-flex flex-column align-items-end gap-1">
                        {ev.fineTotal > 0 && (
                          <span className="badge-status" style={{ background: 'var(--gold-500, #c8a45e)', color: 'var(--navy-900)' }}>
                            Fine ₱{ev.fineTotal.toLocaleString()}
                          </span>
                        )}
                        <StatusBadge status={ev.status} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
        <div className="col-lg-6">
          <div className="card-surface p-3 h-100">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="fw-bold mb-0" style={{ color: 'var(--navy-900)' }}>Recent Student Attendance</h6>
              <button className="btn btn-sm btn-outline-navy" onClick={() => navigate('/student-attendance')}>View All</button>
            </div>
            {recentStudentAttendance.length === 0 ? (
              <div className="text-muted small">No student attendance recorded yet.</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Event</th>
                      <th>Status</th>
                      <th>Time in</th>
                      <th>Time out</th>
                      <th>Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentStudentAttendance.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <div className="fw-semibold small">{r.student_name}</div>
                          <div className="text-muted small">{r.course}</div>
                        </td>
                        <td className="small text-muted">{r.events?.title || '—'}</td>
                        <td><StatusBadge status={r.status} /></td>
                        <td className="small text-muted">{r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString() : '—'}</td>
                        <td className="small text-muted">{r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString() : '—'}</td>
                        <td className="text-capitalize small text-muted">{r.method?.replace('_', ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
