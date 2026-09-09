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
    return `${o.full_name} ${o.officers_id} ${o.email || ''} ${o.position || ''}`.toLowerCase().includes(search.toLowerCase())
  })

  const totalUsers = officers.length
  const totalAdmins = officers.filter(o => o.type === 'admin').length
  const totalOfficers = totalUsers - totalAdmins

  return (
    <div>
      {/* Top Title & Header */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h5 className="fw-bold mb-0 d-flex align-items-center gap-2" style={{ color: 'var(--navy-900)' }}>
            <i className="bi bi-people"></i> System Users & Officers
          </h5>
          <div className="small text-muted">
            <span style={{ color: 'var(--gold-500, #c8a45e)' }}>Dashboard</span> / Users
          </div>
        </div>
        {isAdmin && (
          <button className="btn btn-navy d-flex align-items-center gap-1" onClick={openCreate} style={{ backgroundColor: '#12203d', borderColor: '#12203d' }}>
            <i className="bi bi-plus-lg"></i> Add User
          </button>
        )}
      </div>

      {/* Summary Stat Cards */}
      <div className="row g-3 mb-4">
        <div className="col-12 col-md-4">
          <div className="card-surface p-3" style={{ borderLeft: '4px solid #12203d' }}>
            <div className="small text-muted fw-bold text-uppercase" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>TOTAL USERS</div>
            <div className="fs-2 fw-bold" style={{ color: 'var(--navy-900)' }}>{totalUsers}</div>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="card-surface p-3" style={{ borderLeft: '4px solid var(--gold-500, #c8a45e)' }}>
            <div className="small text-muted fw-bold text-uppercase" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>ADMINS</div>
            <div className="fs-2 fw-bold" style={{ color: 'var(--navy-900)' }}>{totalAdmins}</div>
          </div>
        </div>
        <div className="col-12 col-md-4">
          <div className="card-surface p-3" style={{ borderLeft: '4px solid #3a5a8c' }}>
            <div className="small text-muted fw-bold text-uppercase" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>OFFICERS / STAFF</div>
            <div className="fs-2 fw-bold" style={{ color: 'var(--navy-900)' }}>{totalOfficers}</div>
          </div>
        </div>
      </div>

      {/* Search Bar & Filter Toggle */}
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div className="position-relative" style={{ maxWidth: 360, width: '100%' }}>
          <i className="bi bi-search position-absolute top-50 start-0 translate-middle-y ms-3 text-muted"></i>
          <input
            className="form-control ps-5"
            placeholder="Search by name, ID, email, or position..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="btn-group">
          <button 
            className={`btn btn-sm ${filterType === '' ? 'btn-navy' : 'btn-outline-navy'}`} 
            onClick={() => setFilterType('')}
            style={{ backgroundColor: filterType === '' ? '#12203d' : 'transparent', color: filterType === '' ? '#fff' : '#12203d' }}
          >
            All
          </button>
          <button 
            className={`btn btn-sm ${filterType === 'officer' ? 'btn-navy' : 'btn-outline-navy'}`} 
            onClick={() => setFilterType('officer')}
            style={{ backgroundColor: filterType === 'officer' ? '#12203d' : 'transparent', color: filterType === 'officer' ? '#fff' : '#12203d' }}
          >
            Officers
          </button>
          <button 
            className={`btn btn-sm ${filterType === 'admin' ? 'btn-navy' : 'btn-outline-navy'}`} 
            onClick={() => setFilterType('admin')}
            style={{ backgroundColor: filterType === 'admin' ? '#12203d' : 'transparent', color: filterType === 'admin' ? '#fff' : '#12203d' }}
          >
            Admins
          </button>
        </div>
      </div>

      {/* Roster Table */}
      <div className="table-surface card-surface p-0">
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead style={{ backgroundColor: '#f8f9fa' }}>
              <tr className="small text-muted text-uppercase" style={{ fontSize: '0.75rem' }}>
                <th style={{ width: 40 }} className="ps-3"><input type="checkbox" className="form-check-input" /></th>
                <th>ID</th>
                <th>NAME</th>
                <th>EMAIL</th>
                <th>POSITION</th>
                <th>TYPE</th>
                <th>STATUS</th>
                <th className="text-end pe-3">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="text-center text-muted py-4">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="8" className="text-center text-muted py-4">No system users found.</td></tr>
              ) : (
                filtered.map((o) => (
                  <tr key={o.id}>
                    <td className="ps-3"><input type="checkbox" className="form-check-input" /></td>
                    <td className="fw-bold" style={{ color: '#c8a45e' }}>{o.officers_id}</td>
                    <td className="fw-semibold text-capitalize">{o.full_name}</td>
                    <td className="small text-muted">{o.email || '—'}</td>
                    <td className="small text-muted text-uppercase">{o.position || '—'}</td>
                    <td>
                      <span className="badge rounded-pill px-2 py-1 small" style={{
                        backgroundColor: o.type === 'admin' ? '#ffe5ec' : '#e7f5ff',
                        color: o.type === 'admin' ? '#ff4d6d' : '#1c7ed6',
                        fontWeight: 600,
                        fontSize: '0.75rem'
                      }}>
                        {o.type === 'admin' ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td><StatusBadge status={o.is_active ? 'active' : 'inactive'} /></td>
                    <td className="text-end pe-3">
                      <button className="btn btn-sm btn-outline-navy me-1 px-3" onClick={() => openDetails(o)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit User Modal */}
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
              <input className="form-control" placeholder="e.g. President, Senator" value={form.position}
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

      {/* User Details Modal */}
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
