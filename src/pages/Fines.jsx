import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { logAction } from '../utils/audit'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'
import StatCard from '../components/StatCard'

const emptyFine = { memberType: 'student', person_id: '', student_id: '', event_id: '', reason: '', amount: '', due_date: '' }
const emptyPayment = { amount: '', payment_date: new Date().toISOString().slice(0, 10), payment_method: 'cash' }

export default function Fines() {
  const { profile, isAdmin } = useAuth()
  const [fines, setFines] = useState([])
  const [officers, setOfficers] = useState([])
  const [students, setStudents] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')

  const [showFineForm, setShowFineForm] = useState(false)
  const [fineForm, setFineForm] = useState(emptyFine)
  const [studentCourseFilter, setStudentCourseFilter] = useState('')
  const [error, setError] = useState('')

  const [payingFine, setPayingFine] = useState(null)
  const [paymentForm, setPaymentForm] = useState(emptyPayment)
  const [payments, setPayments] = useState([])

  const loadFines = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('fines')
      .select('*, people:person_id(full_name, officers_id), students:student_id(full_name, student_no, course), events:event_id(title)')
      .order('created_at', { ascending: false })
    setFines(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadFines()
    supabase.from('people').select('id, full_name, officers_id').eq('is_active', true).order('full_name').then(({ data }) => setOfficers(data || []))
    supabase.from('students').select('id, full_name, student_no, course').eq('status', 'active').order('full_name').then(({ data }) => setStudents(data || []))
    supabase.from('events').select('id, title').order('date', { ascending: false }).then(({ data }) => setEvents(data || []))
  }, [])

  const studentCourses = useMemo(() => [...new Set(students.map((s) => s.course))].sort(), [students])
  const visibleStudents = useMemo(
    () => studentCourseFilter ? students.filter((s) => s.course === studentCourseFilter) : students,
    [students, studentCourseFilter]
  )

  const openCreateFine = () => {
    setFineForm(emptyFine)
    setStudentCourseFilter('')
    setError('')
    setShowFineForm(true)
  }

  const handleCreateFine = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const payload = {
        person_id: fineForm.memberType === 'officer' ? fineForm.person_id : null,
        student_id: fineForm.memberType === 'student' ? fineForm.student_id : null,
        event_id: fineForm.event_id || null,
        reason: fineForm.reason,
        amount: Number(fineForm.amount),
        due_date: fineForm.due_date || null,
      }
      const { data, error: insertError } = await supabase.from('fines').insert(payload).select().single()
      if (insertError) throw insertError
      await logAction(profile?.id, 'create', 'fine', data.id, payload)
      setShowFineForm(false)
      loadFines()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteFine = async (fine) => {
    if (!window.confirm('Delete this fine? This also removes its payment history.')) return
    await supabase.from('fines').delete().eq('id', fine.id)
    await logAction(profile?.id, 'delete', 'fine', fine.id, {})
    setPayingFine(null)
    loadFines()
  }

  const openPayment = async (fine) => {
    setPayingFine(fine)
    setPaymentForm(emptyPayment)
    const { data } = await supabase.from('fine_payments').select('*').eq('fine_id', fine.id).order('payment_date', { ascending: false })
    setPayments(data || [])
  }

  const handleAddPayment = async (e) => {
    e.preventDefault()
    if (!payingFine) return
    const payload = {
      fine_id: payingFine.id,
      amount: Number(paymentForm.amount),
      payment_date: paymentForm.payment_date,
      payment_method: paymentForm.payment_method,
      received_by: profile?.id,
    }
    const { data, error: insertError } = await supabase.from('fine_payments').insert(payload).select().single()
    if (insertError) return setError(insertError.message)
    await logAction(profile?.id, 'create', 'fine_payment', data.id, payload)
    setPaymentForm(emptyPayment)
    const { data: updated } = await supabase.from('fine_payments').select('*').eq('fine_id', payingFine.id).order('payment_date', { ascending: false })
    setPayments(updated || [])
    loadFines()
  }

  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0)
  const balance = payingFine ? Number(payingFine.amount) - totalPaid : 0

  const memberName = (f) => f.people?.full_name || f.students?.full_name || 'Unknown'
  const memberSub = (f) => f.people ? f.people.officers_id : f.students ? `${f.students.student_no} · ${f.students.course}` : '—'

  const summary = useMemo(() => ({
    total: fines.length,
    unpaid: fines.filter((f) => f.status !== 'paid').length,
    paid: fines.filter((f) => f.status === 'paid').length,
  }), [fines])

  const filtered = statusFilter ? fines.filter((f) => f.status === statusFilter) : fines

  return (
    <div>
      <div className="row g-3 mb-3">
        <div className="col-4"><StatCard icon="bi-cash-coin" label="Total Fines" value={summary.total} accent="#12203d" /></div>
        <div className="col-4"><StatCard icon="bi-exclamation-circle" label="Unpaid / Partial" value={summary.unpaid} accent="#b1465a" /></div>
        <div className="col-4"><StatCard icon="bi-check-circle" label="Fully Paid" value={summary.paid} accent="#3f7a5e" /></div>
      </div>

      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <select className="form-select form-select-sm" style={{ maxWidth: 200 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
        </select>
        {isAdmin && (
          <button className="btn btn-navy" onClick={openCreateFine}>
            <i className="bi bi-plus-lg me-1"></i> Add Fine
          </button>
        )}
      </div>

      <div className="table-surface">
        <div className="table-responsive">
          <table className="table mb-0">
            <thead>
              <tr>
                <th>Member</th>
                <th>Reason</th>
                <th>Event</th>
                <th>Amount</th>
                <th>Due</th>
                <th>Status</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="text-center text-muted py-4">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="7" className="text-center text-muted py-4">No fines recorded.</td></tr>
              ) : (
                filtered.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <div className="fw-semibold">{memberName(f)}</div>
                      <div className="small text-muted">{memberSub(f)}</div>
                    </td>
                    <td className="small">{f.reason}</td>
                    <td className="small text-muted">{f.events?.title || '—'}</td>
                    <td>₱{Number(f.amount).toLocaleString()}</td>
                    <td className="small text-muted">{f.due_date || '—'}</td>
                    <td><StatusBadge status={f.status} /></td>
                    <td className="text-end">
                      <button className="btn btn-sm btn-outline-navy" onClick={() => openPayment(f)}>
                        <i className="bi bi-eye me-1"></i> View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        show={showFineForm}
        title="Add Fine"
        onClose={() => setShowFineForm(false)}
        footer={
          <>
            <button className="btn btn-outline-secondary" onClick={() => setShowFineForm(false)}>Cancel</button>
            <button className="btn btn-navy" onClick={handleCreateFine}>Add Fine</button>
          </>
        }
      >
        {error && <div className="alert alert-danger py-2">{error}</div>}
        <form onSubmit={handleCreateFine}>
          <div className="row g-3">
            <div className="col-12">
              <label className="form-label small fw-semibold">Member type</label>
              <div className="btn-group w-100">
                <button type="button"
                  className={`btn btn-sm ${fineForm.memberType === 'student' ? 'btn-navy' : 'btn-outline-navy'}`}
                  onClick={() => setFineForm({ ...fineForm, memberType: 'student', person_id: '' })}>
                  Student
                </button>
                <button type="button"
                  className={`btn btn-sm ${fineForm.memberType === 'officer' ? 'btn-navy' : 'btn-outline-navy'}`}
                  onClick={() => setFineForm({ ...fineForm, memberType: 'officer', student_id: '' })}>
                  Officer
                </button>
              </div>
            </div>

            {fineForm.memberType === 'student' ? (
              <>
                <div className="col-12">
                  <label className="form-label small fw-semibold">Filter by course</label>
                  <select className="form-select" value={studentCourseFilter} onChange={(e) => setStudentCourseFilter(e.target.value)}>
                    <option value="">All courses</option>
                    {studentCourses.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="col-12">
                  <label className="form-label small fw-semibold">Student</label>
                  <select className="form-select" required value={fineForm.student_id}
                    onChange={(e) => setFineForm({ ...fineForm, student_id: e.target.value })}>
                    <option value="">Select student…</option>
                    {visibleStudents.map((s) => (
                      <option key={s.id} value={s.id}>{s.full_name} ({s.student_no} · {s.course})</option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <div className="col-12">
                <label className="form-label small fw-semibold">Officer</label>
                <select className="form-select" required value={fineForm.person_id}
                  onChange={(e) => setFineForm({ ...fineForm, person_id: e.target.value })}>
                  <option value="">Select officer…</option>
                  {officers.map((o) => <option key={o.id} value={o.id}>{o.full_name} ({o.officers_id})</option>)}
                </select>
              </div>
            )}

            <div className="col-12">
              <label className="form-label small fw-semibold">Related event (optional)</label>
              <select className="form-select" value={fineForm.event_id}
                onChange={(e) => setFineForm({ ...fineForm, event_id: e.target.value })}>
                <option value="">None</option>
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
              </select>
            </div>
            <div className="col-12">
              <label className="form-label small fw-semibold">Reason</label>
              <input className="form-control" required value={fineForm.reason}
                onChange={(e) => setFineForm({ ...fineForm, reason: e.target.value })} />
            </div>
            <div className="col-6">
              <label className="form-label small fw-semibold">Fine Amount (₱)</label>
              <input type="number" min="0" step="0.01" className="form-control" required value={fineForm.amount}
                onChange={(e) => setFineForm({ ...fineForm, amount: e.target.value })} />
            </div>
            <div className="col-6">
              <label className="form-label small fw-semibold">Due date</label>
              <input type="date" className="form-control" value={fineForm.due_date}
                onChange={(e) => setFineForm({ ...fineForm, due_date: e.target.value })} />
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        show={!!payingFine}
        title={`Fine Details — ${payingFine ? memberName(payingFine) : ''}`}
        onClose={() => setPayingFine(null)}
        footer={
          <>
            {isAdmin && payingFine && (
              <button className="btn btn-outline-danger me-auto" onClick={() => handleDeleteFine(payingFine)}>
                <i className="bi bi-trash me-1"></i> Delete
              </button>
            )}
            <button className="btn btn-outline-secondary" onClick={() => setPayingFine(null)}>Close</button>
          </>
        }
      >
        {payingFine && (
          <>
            <div className="mb-3">
              <div className="small text-muted">Reason</div>
              <div>{payingFine.reason}</div>
            </div>
            <div className="d-flex justify-content-between mb-3">
              <div><div className="small text-muted">Fine amount</div><div className="fw-bold">₱{Number(payingFine.amount).toLocaleString()}</div></div>
              <div><div className="small text-muted">Paid so far</div><div className="fw-bold text-success">₱{totalPaid.toLocaleString()}</div></div>
              <div><div className="small text-muted">Balance</div><div className="fw-bold" style={{ color: balance > 0 ? 'var(--danger)' : 'var(--success)' }}>₱{Math.max(balance, 0).toLocaleString()}</div></div>
            </div>

            {balance > 0 && (
              <form onSubmit={handleAddPayment} className="d-flex gap-2 mb-3">
                <input type="number" min="0" step="0.01" max={balance} className="form-control" placeholder="Amount" required
                  value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
                <input type="date" className="form-control" value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })} />
                <select className="form-select" value={paymentForm.payment_method}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}>
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                  <option value="bank">Bank Transfer</option>
                </select>
                <button className="btn btn-navy" type="submit">Add</button>
              </form>
            )}

            <div className="table-surface">
              <table className="table mb-0">
                <thead><tr><th>Date</th><th>Amount</th><th>Method</th></tr></thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr><td colSpan="3" className="text-center text-muted py-3">No payments yet.</td></tr>
                  ) : payments.map((p) => (
                    <tr key={p.id}><td>{p.payment_date}</td><td>₱{Number(p.amount).toLocaleString()}</td><td className="text-capitalize">{p.payment_method}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
