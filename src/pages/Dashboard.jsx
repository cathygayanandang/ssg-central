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
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ officers: 0, students: 0, events: 0, fines: 0 })
  const [attendanceByEvent, setAttendanceByEvent] = useState({ labels: [], present: [], absent: [] })
  const [overallAttendance, setOverallAttendance] = useState({ present: 0, absent: 0 })
  const [recentEvents, setRecentEvents] = useState([])
  const [recentStudentAttendance, setRecentStudentAttendance] = useState([])

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)

      const [
        { count: officerCount },
        { count: studentCount },
        { count: eventCount },
        { count: fineCount },
        { data: eventsForChart },
        { data: allStudentAttendance },
        { data: recentEventRows },
      ] = await Promise.all([
        supabase.from('people').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('events').select('*', { count: 'exact', head: true }),
        supabase.from('fines').select('*', { count: 'exact', head: true }),
        supabase.from('events').select('id, title').order('date', { ascending: false }).limit(5),
        supabase.from('student_attendance').select('event_id, status'),
        supabase.from('events').select('*').order('date', { ascending: false }).limit(5),
      ])

      const rows = allStudentAttendance || []
      const eventIds = (eventsForChart || []).map((e) => e.id)
      const labels = (eventsForChart || []).map((e) => e.title)
      const present = eventIds.map((id) => rows.filter((r) => r.event_id === id && r.status === 'present').length)
      const absent = eventIds.map((id) => rows.filter((r) => r.event_id === id && r.status === 'absent').length)

      const totalPresent = rows.filter((r) => r.status === 'present').length
      const totalAbsent = rows.filter((r) => r.status === 'absent').length

      const { data: recentSA } = await supabase
        .from('student_attendance')
        .select('*, events:event_id(title)')
        .order('check_in_time', { ascending: false })
        .limit(5)

      if (!active) return
      setStats({ officers: officerCount || 0, students: studentCount || 0, events: eventCount || 0, fines: fineCount || 0 })
      setAttendanceByEvent({ labels, present, absent })
      setOverallAttendance({ present: totalPresent, absent: totalAbsent })
      setRecentEvents(recentEventRows || [])
      setRecentStudentAttendance(recentSA || [])
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [])

  return (
    <div>
      <div className="row g-3 mb-3">
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-people-fill" label="Users & Officers" value={stats.officers} accent={NAVY} />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-mortarboard-fill" label="Students" value={stats.students} accent="#3a5a8c" />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-calendar-check" label="Events" value={stats.events} accent={GOLD} />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard icon="bi-cash-stack" label="Fines" value={stats.fines} accent={RED} />
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
                  scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
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
                {recentEvents.map((ev) => (
                  <li key={ev.id} className="d-flex justify-content-between align-items-center py-2 border-bottom">
                    <div>
                      <div className="fw-semibold small">{ev.title}</div>
                      <div className="text-muted small">{ev.date}</div>
                    </div>
                    <StatusBadge status={ev.status} />
                  </li>
                ))}
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
              <ul className="list-unstyled mb-0">
                {recentStudentAttendance.map((r) => (
                  <li key={r.id} className="d-flex justify-content-between align-items-center py-2 border-bottom">
                    <div>
                      <div className="fw-semibold small">{r.student_name}</div>
                      <div className="text-muted small">{r.events?.title || '—'} · {r.course}</div>
                    </div>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
