import { useEffect, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { logAction } from '../utils/audit'
import { buildOfficerQrPayload } from '../utils/qr'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'

const emptyForm = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  position: '',
  type: 'officer',
  permissions: { manage_events: false, manage_attendance: false, manage_fines: false },
}

export default function Officers() {
  const { profile, isAdmin } = useAuth()
  const [officers, setOfficers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('') // '' | 'officer' | 'admin'
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [badgeOfficer, setBadgeOfficer] = useState(null)
  const [detailsOfficer, setDetailsOfficer] = useState(null)
  const [detailsAttendance, setDetailsAttendance] = useState([])
  const [detailsFines, setDetailsFines] = useState([])
  const [error, setError] = useState('')

  const loadOfficers = async () => {
    setLoading(true)
    const { data } = await supabase.from('people').select('*').order('created_at', { ascending: false })
    setOfficers(data || [])
    setLoading(false)
  }

  useEffect(() => { loadOfficers() }, [])

  const openCreate = () => {
    setForm(emptyForm)
    setEditingId(null)
    setError('')
    setShowForm(true)
  }

  const openEdit = (officer) => {
    setForm({
      first_name: officer.first_name,
      last_name: officer.last_name,
      email: officer.email || '',
      phone: officer.phone || '',
      position: officer.position || '',
      type: officer.type,
      is_active: officer.is_active,
      permissions: {
        manage_events: !!officer.permissions?.manage_events,
        manage_attendance: !!officer.permissions?.manage_attendance,
        manage_fines: !!officer.permissions?.manage_fines,
      },
    })
    setEditingId(officer.id)
    setError('')
    setShowForm(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (editingId) {
        const { error: updateError } = await supabase.from('people').update(form).eq('id', editingId)
        if (updateError) throw updateError
        await logAction(profile?.id, 'update', 'people', editingId, form)
      } else {
        const { data: newId, error: rpcError } = await supabase.rpc('next_officers_id')
        if (rpcError) throw rpcError
        const officersId = newId
        const qrData = buildOfficerQrPayload(officersId, `${form.first_name} ${form.last_name}`)
        const { data: inserted, error: insertError } = await supabase
          .from('people')
          .insert({ ...form, officers_id: officersId, qr_data: qrData })
          .select()
          .single()
        if (insertError) throw insertError
        await logAction(profile?.id, 'create', 'people', inserted.id, form)
      }
      setShowForm(false)
      loadOfficers()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleToggleActive = async (officer) => {
    await supabase.from('people').update({ is_active: !officer.is_active }).eq('id', officer.id)
    await logAction(profile?.id, 'update', 'people', officer.id, { is_active: !officer.is_active })
    loadOfficers()
  }

  const handleDelete = async (officer) => {
    if (!window.confirm(`Remove ${officer.full_name} from the roster?`)) return
    await supabase.from('people').delete().eq('id', officer.id)
    await logAction(profile?.id, 'delete', 'people', officer.id, {})
    loadOfficers()
  }

  const openDetails = async (o) => {
    setDetailsOfficer(o)
    const [{ data: att }, { data: fin }] = await Promise.all([
      supabase.from('attendance').select('*, events:event_id(title)').eq('person_id', o.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('fines').select('*').eq('person_id', o.id).order('created_at', { ascending: false }),
    ])
    setDetailsAttendance(att || [])
    setDetailsFines(fin || [])
  }

  const filtered = officers.filter((o) => {
    if (filterType && o.type !== filterType) return false
    return `${o.full_name} ${o.officers_id} ${o.position || ''}`.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div className="d-flex gap-2 flex-wrap">
          <input
            className="form-control"
            style={{ maxWidth: 280 }}
            placeholder="Search by name, ID, email, position…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="btn-group">
            <button className={`btn btn-sm ${filterType === '' ? 'btn-navy' : 'btn-outline-navy'}`} onClick={() => setFilterType('')}>All</button>
            <button className={`btn btn-sm ${filterType === 'officer' ? 'btn-navy' : 'btn-outline-navy'}`} onClick={() => setFilterType('officer')}>Officers</button>
            <button className={`btn btn-sm ${filterType === 'admin' ? 'btn-navy' : 'btn-outline-navy'}`} onClick={() => setFilterType('admin')}>Admins</button>
          </div>
        </div>
        {isAdmin && (
          <button className="btn btn-navy" onClick={openCreate}>
            <i className="bi bi-plus-lg me-1"></i> Add User
          </button>
        )}
      </div>

      <div className="table-surface">
        <div className="table-responsive">
          <table className="table mb-0">
            <thead>
              <tr>
                <th>Officer ID</th>
                <th>Name</th>
                <th>Position</th>
                <th>Type</th>
                <th>Status</th>
                <th>Contact</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="text-center text-muted py-4">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="7" className="text-center text-muted py-4">No officers found.</td></tr>
              ) : (
                filtered.map((o) => (
                  <tr key={o.id}>
                    <td className="fw-semibold">{o.officers_id}</td>
                    <td>{o.full_name}</td>
                    <td>{o.position || '—'}</td>
                    <td className="text-capitalize">{o.type}</td>
                    <td><StatusBadge status={o.is_active ? 'active' : 'inactive'} /></td>
                    <td className="small text-muted">{o.email || o.phone || '—'}</td>
                    <td className="text-end">
                      <button className="btn btn-sm btn-outline-navy me-1" onClick={() => openDetails(o)} title="View">
                        <i className="bi bi-eye"></i>
                      </button>
                      <button className="btn btn-sm btn-outline-navy me-1" onClick={() => setBadgeOfficer(o)} title="View QR badge">
                        <i className="bi bi-qr-code"></i>
                      </button>
                      {isAdmin && (
                        <>
                          <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => openEdit(o)} title="Edit">
                            <i className="bi bi-pencil"></i>
                          </button>
                          <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => handleToggleActive(o)} title="Toggle active">
                            <i className="bi bi-power"></i>
                          </button>
                          <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(o)} title="Delete">
                            <i className="bi bi-trash"></i>
                          </button>
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

      <Modal
        show={showForm}
        title={editingId ? 'Edit User' : 'Add User'}
        onClose={() => setShowForm(false)}
        footer={
          <>
            <button className="btn btn-outline-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-navy" onClick={handleSave}>{editingId ? 'Update User' : 'Create User'}</button>
          </>
        }
      >
        {error && <div className="alert alert-danger py-2">{error}</div>}
        <form onSubmit={handleSave}>
          <div className="row g-3">
            <div className="col-6">
              <label className="form-label small fw-semibold">First name *</label>
              <input className="form-control" required value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div className="col-6">
              <label className="form-label small fw-semibold">Last name *</label>
              <input className="form-control" required value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
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
            <div className="col-6">
              <label className="form-label small fw-semibold">Position</label>
              <input className="form-control" placeholder="e.g. President, Secretary" value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })} />
            </div>
            <div className="col-6">
              <label className="form-label small fw-semibold">Type *</label>
              <select className="form-select" value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="officer">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {editingId && (
              <div className="col-12">
                <div className="form-check">
                  <input className="form-check-input" type="checkbox" id="activeCheck"
                    checked={form.is_active !== false}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                  <label className="form-check-label small" htmlFor="activeCheck">Active</label>
                </div>
              </div>
            )}
            <div className="col-12">
              <label className="form-label small fw-semibold d-block">Permissions</label>
              <div className="d-flex gap-4 flex-wrap">
                {[
                  ['manage_events', 'Manage Events'],
                  ['manage_attendance', 'Manage Attendance'],
                  ['manage_fines', 'Manage Fines'],
                ].map(([key, label]) => (
                  <div className="form-check" key={key}>
                    <input className="form-check-input" type="checkbox" id={key}
                      checked={!!form.permissions?.[key]}
                      onChange={(e) => setForm({ ...form, permissions: { ...form.permissions, [key]: e.target.checked } })} />
                    <label className="form-check-label small" htmlFor={key}>{label}</label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        show={!!badgeOfficer}
        title="Officer QR Badge"
        onClose={() => setBadgeOfficer(null)}
        footer={<button className="btn btn-navy" onClick={() => setBadgeOfficer(null)}>Close</button>}
      >
        {badgeOfficer && (
          <div className="text-center">
            <div className="d-inline-block p-3 bg-white rounded-3 border mb-3">
              <QRCodeCanvas value={badgeOfficer.qr_data || badgeOfficer.officers_id} size={200} fgColor="#12203d" />
            </div>
            <div className="fw-bold" style={{ color: 'var(--navy-900)' }}>{badgeOfficer.full_name}</div>
            <div className="text-muted small">{badgeOfficer.officers_id} · {badgeOfficer.position || badgeOfficer.type}</div>
          </div>
        )}
      </Modal>

      <Modal
        show={!!detailsOfficer}
        title="User Details"
        onClose={() => setDetailsOfficer(null)}
        size="modal-lg"
        footer={<button className="btn btn-outline-secondary" onClick={() => setDetailsOfficer(null)}>Close</button>}
      >
        {detailsOfficer && (
          <div>
            <div className="d-flex justify-content-between align-items-start mb-3">
              <div>
                <div className="fw-bold fs-5" style={{ color: 'var(--navy-900)' }}>{detailsOfficer.full_name}</div>
                <div className="text-muted small">{detailsOfficer.officers_id} · {detailsOfficer.position || detailsOfficer.type}</div>
              </div>
              <StatusBadge status={detailsOfficer.is_active ? 'active' : 'inactive'} />
            </div>
            <div className="row g-3 mb-3">
              <div className="col-6"><div className="small text-muted">Email</div><div>{detailsOfficer.email || '—'}</div></div>
              <div className="col-6"><div className="small text-muted">Phone</div><div>{detailsOfficer.phone || '—'}</div></div>
            </div>

            <h6 className="fw-bold mt-4 mb-2" style={{ color: 'var(--navy-900)' }}>Recent Attendance</h6>
            <div className="table-surface mb-4">
              <table className="table mb-0 small">
                <thead><tr><th>Event</th><th>Status</th><th>Method</th></tr></thead>
                <tbody>
                  {detailsAttendance.length === 0 ? (
                    <tr><td colSpan="3" className="text-center text-muted py-3">No attendance recorded.</td></tr>
                  ) : detailsAttendance.map((a) => (
                    <tr key={a.id}>
                      <td>{a.events?.title || '—'}</td>
                      <td><StatusBadge status={a.status} /></td>
                      <td className="text-capitalize text-muted">{a.method?.replace('_', ' ')}</td>
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
