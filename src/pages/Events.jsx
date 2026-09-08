import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { logAction } from '../utils/audit'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'

const emptyForm = { title: '', type: '', date: '', location: '', description: '', status: 'upcoming' }

export default function Events() {
  const { profile, isAdmin } = useAuth()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  const loadEvents = async () => {
    setLoading(true)
    const { data } = await supabase.from('events').select('*').order('date', { ascending: false })
    setEvents(data || [])
    setLoading(false)
  }

  useEffect(() => { loadEvents() }, [])

  const openCreate = () => {
    setForm(emptyForm)
    setEditingId(null)
    setError('')
    setShowForm(true)
  }

  const openEdit = (ev) => {
    setForm({
      title: ev.title, type: ev.type || '', date: ev.date, location: ev.location || '',
      description: ev.description || '', status: ev.status,
    })
    setEditingId(ev.id)
    setError('')
    setShowForm(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (editingId) {
        const { error: updateError } = await supabase.from('events').update(form).eq('id', editingId)
        if (updateError) throw updateError
        await logAction(profile?.id, 'update', 'event', editingId, form)
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('events').insert({ ...form, created_by: profile?.id }).select().single()
        if (insertError) throw insertError
        await logAction(profile?.id, 'create', 'event', inserted.id, form)
      }
      setShowForm(false)
      loadEvents()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (ev) => {
    if (!window.confirm(`Delete event "${ev.title}"? This also removes its attendance records.`)) return
    await supabase.from('events').delete().eq('id', ev.id)
    await logAction(profile?.id, 'delete', 'event', ev.id, {})
    loadEvents()
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="text-muted small">{events.length} event(s) on record</div>
        {isAdmin && (
          <button className="btn btn-navy" onClick={openCreate}>
            <i className="bi bi-plus-lg me-1"></i> New Event
          </button>
        )}
      </div>

      <div className="row g-3">
        {loading ? (
          <div className="text-muted small">Loading…</div>
        ) : events.length === 0 ? (
          <div className="text-muted small">No events yet.</div>
        ) : (
          events.map((ev) => (
            <div className="col-md-6 col-lg-4" key={ev.id}>
              <div className="card-surface p-3 h-100 d-flex flex-column">
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <h6 className="fw-bold mb-0" style={{ color: 'var(--navy-900)' }}>{ev.title}</h6>
                  <StatusBadge status={ev.status} />
                </div>
                <div className="small text-muted mb-1">
                  <i className="bi bi-calendar3 me-1"></i>{ev.date} {ev.type ? `· ${ev.type}` : ''}
                </div>
                {ev.location && (
                  <div className="small text-muted mb-2">
                    <i className="bi bi-geo-alt me-1"></i>{ev.location}
                  </div>
                )}
                {ev.description && <p className="small mb-3 flex-grow-1">{ev.description}</p>}
                {isAdmin && (
                  <div className="mt-auto d-flex gap-2">
                    <button className="btn btn-sm btn-outline-navy flex-grow-1" onClick={() => openEdit(ev)}>
                      <i className="bi bi-pencil me-1"></i> Edit
                    </button>
                    <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(ev)}>
                      <i className="bi bi-trash"></i>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <Modal
        show={showForm}
        title={editingId ? 'Edit Event' : 'New Event'}
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
            <div className="col-12">
              <label className="form-label small fw-semibold">Title</label>
              <input className="form-control" required value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="col-6">
              <label className="form-label small fw-semibold">Date</label>
              <input type="date" className="form-control" required value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="col-6">
              <label className="form-label small fw-semibold">Type</label>
              <input className="form-control" placeholder="Meeting, Assembly, etc." value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })} />
            </div>
            <div className="col-6">
              <label className="form-label small fw-semibold">Location</label>
              <input className="form-control" value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div className="col-6">
              <label className="form-label small fw-semibold">Status</label>
              <select className="form-select" value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="upcoming">Upcoming</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="col-12">
              <label className="form-label small fw-semibold">Description</label>
              <textarea className="form-control" rows="3" value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
