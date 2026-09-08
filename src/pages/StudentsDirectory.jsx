import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { logAction } from '../utils/audit'
import { buildStudentQrPayload } from '../utils/qr'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'

const emptyForm = { first_name: '', last_name: '', course: '', year_level: 1, email: '', phone: '' }

export default function StudentsDirectory() {
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()

  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [courseFilter, setCourseFilter] = useState('')
  const [yearFilter, setYearFilter] = useState('')
  const [view, setView] = useState('list') // 'list' | 'grouped'

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  const [badgeStudent, setBadgeStudent] = useState(null)
  const [detailsStudent, setDetailsStudent] = useState(null)
  const [detailsAttendance, setDetailsAttendance] = useState([])
  const [detailsFines, setDetailsFines] = useState([])

  const loadStudents = async () => {
    setLoading(true)
    const { data } = await supabase.from('students').select('*').order('created_at', { ascending: false })
    setStudents(data || [])
    setLoading(false)
  }

  useEffect(() => { loadStudents() }, [])

  const courses = useMemo(() => [...new Set(students.map((s) => s.course))].sort(), [students])

  const filtered = useMemo(() => {
    return students.filter((s) => {
      if (courseFilter && s.course !== courseFilter) return false
      if (yearFilter && String(s.year_level) !== yearFilter) return false
      if (search && !`${s.full_name} ${s.student_no} ${s.course}`.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [students, search, courseFilter, yearFilter])

  const grouped = useMemo(() => {
    const map = {}
    filtered.forEach((s) => {
      map[s.course] = map[s.course] || []
      map[s.course].push(s)
    })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const stats = useMemo(() => ({
    total: students.length,
    active: students.filter((s) => s.status === 'active').length,
    graduated: students.filter((s) => s.status === 'graduated').length,
  }), [students])

  const openCreate = () => {
    setForm(emptyForm)
    setEditingId(null)
    setError('')
    setShowForm(true)
  }

  const openEdit = (s) => {
    setForm({ first_name: s.first_name, last_name: s.last_name, course: s.course, year_level: s.year_level, email: s.email || '', phone: s.phone || '' })
    setEditingId(s.id)
    setError('')
    setShowForm(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const payload = { ...form, year_level: Number(form.year_level) }
      if (editingId) {
        const { error: updateError } = await supabase.from('students').update(payload).eq('id', editingId)
        if (updateError) throw updateError
        await logAction(profile?.id, 'update', 'student', editingId, payload)
      } else {
        const { data: studentNo, error: rpcError } = await supabase.rpc('next_student_no')
        if (rpcError) throw rpcError
        const qrData = buildStudentQrPayload(studentNo, `${form.first_name} ${form.last_name}`)
        const { data: inserted, error: insertError } = await supabase
          .from('students')
          .insert({ ...payload, student_no: studentNo, qr_data: qrData })
          .select()
          .single()
        if (insertError) throw insertError
        await logAction(profile?.id, 'create', 'student', inserted.id, payload)
      }
      setShowForm(false)
      loadStudents()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (s) => {
    if (!window.confirm(`Remove ${s.full_name} from the Students Directory? This also removes their attendance and fine records.`)) return
    await supabase.from('students').delete().eq('id', s.id)
    await logAction(profile?.id, 'delete', 'student', s.id, {})
    loadStudents()
  }

  const openDetails = async (s) => {
    setDetailsStudent(s)
    const [{ data: att }, { data: fin }] = await Promise.all([
      supabase.from('student_attendance').select('*, events:event_id(title, date)').eq('student_id', s.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('fines').select('*, events:event_id(title)').eq('student_id', s.id).order('created_at', { ascending: false }),
    ])
    setDetailsAttendance(att || [])
    setDetailsFines(fin || [])
  }

  const handleRollover = async () => {
    if (!window.confirm('Promote every active student to the next year level? Students already at the final year will be marked graduated. This cannot be undone automatically.')) return
    const { data, error: rpcError } = await supabase.rpc('rollover_students_year', { max_year: 4 })
    if (rpcError) return window.alert(rpcError.message)
    const result = data?.[0]
    await logAction(profile?.id, 'update', 'students_rollover', null, result)
    window.alert(`Promoted ${result?.promoted ?? 0} student(s); ${result?.graduated ?? 0} marked graduated.`)
    loadStudents()
  }

  return (
    <div>
      <div className="row g-3 mb-3">
        <div className="col-4">
          <StatCard icon="bi-mortarboard-fill" label="Total Students" value={stats.total} accent="#12203d" />
        </div>
        <div className="col-4">
          <StatCard icon="bi-person-check" label="Active" value={stats.active} accent="#3f7a5e" />
        </div>
        <div className="col-4">
          <StatCard icon="bi-mortarboard" label="Graduated" value={stats.graduated} accent="#3a5a8c" />
        </div>
      </div>

      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div className="d-flex gap-2 flex-wrap">
          <input className="form-control" style={{ maxWidth: 240 }} placeholder="Search students…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="form-select" style={{ maxWidth: 180 }} value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
            <option value="">All Courses</option>
            {courses.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="form-select" style={{ maxWidth: 140 }} value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
            <option value="">All Years</option>
            {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
          <div className="btn-group">
            <button className={`btn btn-sm ${view === 'list' ? 'btn-navy' : 'btn-outline-navy'}`} onClick={() => setView('list')}>
              <i className="bi bi-list-ul me-1"></i>List
            </button>
            <button className={`btn btn-sm ${view === 'grouped' ? 'btn-navy' : 'btn-outline-navy'}`} onClick={() => setView('grouped')}>
              <i className="bi bi-collection me-1"></i>Grouped
            </button>
          </div>
        </div>
        {isAdmin && (
          <div className="d-flex gap-2">
            <button className="btn btn-outline-navy" onClick={handleRollover}>
              <i className="bi bi-arrow-repeat me-1"></i> Year Rollover
            </button>
            <button className="btn btn-outline-navy" onClick={() => navigate('/students/bulk-import')}>
              <i className="bi bi-upload me-1"></i> Bulk Import
            </button>
            <button className="btn btn-navy" onClick={openCreate}>
              <i className="bi bi-plus-lg me-1"></i> Add Student
            </button>
          </div>
        )}
      </div>

      {view === 'list' ? (
        <StudentsTable
          rows={filtered}
          loading={loading}
          isAdmin={isAdmin}
          onView={openDetails}
          onEdit={openEdit}
          onDelete={handleDelete}
          onBadge={setBadgeStudent}
        />
      ) : (
        <div className="d-flex flex-column gap-3">
          {loading ? (
            <div className="text-muted small">Loading…</div>
          ) : grouped.length === 0 ? (
            <div className="text-muted small">No students found.</div>
          ) : (
            grouped.map(([course, rows]) => (
              <div key={course}>
                <h6 className="fw-bold mb-2" style={{ color: 'var(--navy-900)' }}>
                  {course} <span className="text-muted fw-normal small">({rows.length})</span>
                </h6>
                <StudentsTable
                  rows={rows}
                  loading={false}
                  isAdmin={isAdmin}
                  onView={openDetails}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onBadge={setBadgeStudent}
                  hideCourse
                />
              </div>
            ))
          )}
        </div>
      )}

      <Modal
        show={showForm}
        title={editingId ? 'Edit Student' : 'Add Student'}
        onClose={() => setShowForm(false)}
        footer={
          <>
            <button className="btn btn-outline-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-navy" onClick={handleSave}>Save</button>
          </>
        }
      >
        {error && <div className="alert alert-danger py-2">{error}</div>}
        <form onSubmit={handleSave}>
          <div className="row g-3">
            <div className="col-6">
              <label className="form-label small fw-semibold">First name</label>
              <input className="form-control" required value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div className="col-6">
              <label className="form-label small fw-semibold">Last name</label>
              <input className="form-control" required value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
            <div className="col-6">
              <label className="form-label small fw-semibold">Course</label>
              <input className="form-control" required placeholder="e.g. BSIT" value={form.course}
                onChange={(e) => setForm({ ...form, course: e.target.value })} />
            </div>
            <div className="col-6">
              <label className="form-label small fw-semibold">Year level</label>
              <select className="form-select" value={form.year_level}
                onChange={(e) => setForm({ ...form, year_level: e.target.value })}>
                {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </div>
            <div className="col-6">
              <label className="form-label small fw-semibold">Email</label>
              <input type="email" className="form-control" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="col-6">
              <label className="form-label small fw-semibold">Phone</label>
              <input className="form-control" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        show={!!badgeStudent}
        title="Student QR Badge"
        onClose={() => setBadgeStudent(null)}
        footer={<button className="btn btn-navy" onClick={() => setBadgeStudent(null)}>Close</button>}
      >
        {badgeStudent && (
          <div className="text-center">
            <div className="d-inline-block p-3 bg-white rounded-3 border mb-3">
              <QRCodeCanvas value={badgeStudent.qr_data || badgeStudent.student_no} size={200} fgColor="#12203d" />
            </div>
            <div className="fw-bold" style={{ color: 'var(--navy-900)' }}>{badgeStudent.full_name}</div>
            <div className="text-muted small">{badgeStudent.student_no} · {badgeStudent.course} — Year {badgeStudent.year_level}</div>
          </div>
        )}
      </Modal>

      <Modal
        show={!!detailsStudent}
        title="Student Details"
        onClose={() => setDetailsStudent(null)}
        size="modal-lg"
        footer={<button className="btn btn-outline-secondary" onClick={() => setDetailsStudent(null)}>Close</button>}
      >
        {detailsStudent && (
          <div>
            <div className="d-flex justify-content-between align-items-start mb-3">
              <div>
                <div className="fw-bold fs-5" style={{ color: 'var(--navy-900)' }}>{detailsStudent.full_name}</div>
                <div className="text-muted small">{detailsStudent.student_no} · {detailsStudent.course} — Year {detailsStudent.year_level}</div>
              </div>
              <StatusBadge status={detailsStudent.status} />
            </div>
            <div className="row g-3 mb-3">
              <div className="col-6"><div className="small text-muted">Email</div><div>{detailsStudent.email || '—'}</div></div>
              <div className="col-6"><div className="small text-muted">Phone</div><div>{detailsStudent.phone || '—'}</div></div>
            </div>

            <h6 className="fw-bold mt-4 mb-2" style={{ color: 'var(--navy-900)' }}>Recent Attendance</h6>
            <div className="table-surface mb-4">
              <table className="table mb-0 small">
                <thead><tr><th>Event</th><th>Status</th><th>Time in</th></tr></thead>
                <tbody>
                  {detailsAttendance.length === 0 ? (
                    <tr><td colSpan="3" className="text-center text-muted py-3">No attendance recorded.</td></tr>
                  ) : detailsAttendance.map((a) => (
                    <tr key={a.id}>
                      <td>{a.events?.title || '—'}</td>
                      <td><StatusBadge status={a.status} /></td>
                      <td className="text-muted">{a.check_in_time ? new Date(a.check_in_time).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h6 className="fw-bold mb-2" style={{ color: 'var(--navy-900)' }}>Fines</h6>
            <div className="table-surface">
              <table className="table mb-0 small">
                <thead><tr><th>Reason</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {detailsFines.length === 0 ? (
                    <tr><td colSpan="3" className="text-center text-muted py-3">No fines recorded.</td></tr>
                  ) : detailsFines.map((f) => (
                    <tr key={f.id}>
                      <td>{f.reason}</td>
                      <td>₱{Number(f.amount).toLocaleString()}</td>
                      <td><StatusBadge status={f.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function StudentsTable({ rows, loading, isAdmin, onView, onEdit, onDelete, onBadge, hideCourse }) {
  return (
    <div className="table-surface">
      <div className="table-responsive">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Student No.</th>
              <th>Name</th>
              {!hideCourse && <th>Course</th>}
              <th>Year</th>
              <th>Status</th>
              <th className="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="text-center text-muted py-4">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan="6" className="text-center text-muted py-4">No students found.</td></tr>
            ) : (
              rows.map((s) => (
                <tr key={s.id}>
                  <td className="fw-semibold">{s.student_no}</td>
                  <td>{s.full_name}</td>
                  {!hideCourse && <td className="small text-muted">{s.course}</td>}
                  <td>{s.year_level}</td>
                  <td><StatusBadge status={s.status} /></td>
                  <td className="text-end">
                    <button className="btn btn-sm btn-outline-navy me-1" onClick={() => onView(s)} title="View"><i className="bi bi-eye"></i></button>
                    <button className="btn btn-sm btn-outline-navy me-1" onClick={() => onBadge(s)} title="QR badge"><i className="bi bi-qr-code"></i></button>
                    {isAdmin && (
                      <>
                        <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => onEdit(s)} title="Edit"><i className="bi bi-pencil"></i></button>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => onDelete(s)} title="Delete"><i className="bi bi-trash"></i></button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
