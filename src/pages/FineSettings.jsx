import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { logAction } from '../utils/audit'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'

const emptyForm = { fine_type: '', amount: '', description: '' }

export default function FineSettings() {
  const { profile } = useAuth()
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  const loadRules = async () => {
    setLoading(true)
    const { data } = await supabase.from('fine_settings').select('*').order('created_at', { ascending: false })
    setRules(data || [])
    setLoading(false)
  }

  useEffect(() => { loadRules() }, [])

  const openCreate = () => {
    setForm(emptyForm)
    setEditingId(null)
    setError('')
    setShowForm(true)
  }

  const openEdit = (rule) => {
    setForm({ fine_type: rule.fine_type, amount: rule.amount, description: rule.description || '' })
    setEditingId(rule.id)
    setError('')
    setShowForm(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const payload = { ...form, amount: Number(form.amount) }
      if (editingId) {
        const { error: updateError } = await supabase.from('fine_settings').update(payload).eq('id', editingId)
        if (updateError) throw updateError
        await logAction(profile?.id, 'update', 'fine_settings', editingId, payload)
      } else {
        const { data, error: insertError } = await supabase.from('fine_settings').insert(payload).select().single()
        if (insertError) throw insertError
        await logAction(profile?.id, 'create', 'fine_settings', data.id, payload)
      }
      setShowForm(false)
      loadRules()
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleActive = async (rule) => {
    await supabase.from('fine_settings').update({ is_active: !rule.is_active }).eq('id', rule.id)
    await logAction(profile?.id, 'update', 'fine_settings', rule.id, { is_active: !rule.is_active })
    loadRules()
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="text-muted small">Configure standard fine amounts applied across the organization.</div>
        <button className="btn btn-navy" onClick={openCreate}>
          <i className="bi bi-plus-lg me-1"></i> New Rule
        </button>
      </div>

      <div className="table-surface">
        <div className="table-responsive">
          <table className="table mb-0">
            <thead>
              <tr><th>Fine Type</th><th>Amount</th><th>Description</th><th>Status</th><th className="text-end">Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="text-center text-muted py-4">Loading…</td></tr>
              ) : rules.length === 0 ? (
                <tr><td colSpan="5" className="text-center text-muted py-4">No fine rules configured yet.</td></tr>
              ) : (
                rules.map((r) => (
                  <tr key={r.id}>
                    <td className="fw-semibold text-capitalize">{r.fine_type}</td>
                    <td>₱{Number(r.amount).toLocaleString()}</td>
                    <td className="small text-muted">{r.description || '—'}</td>
                    <td><StatusBadge status={r.is_active ? 'active' : 'inactive'} /></td>
                    <td className="text-end">
                      <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => openEdit(r)}><i className="bi bi-pencil"></i></button>
                      <button className="btn btn-sm btn-outline-secondary" onClick={() => toggleActive(r)}><i className="bi bi-power"></i></button>
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
        title={editingId ? 'Edit Fine Rule' : 'New Fine Rule'}
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
              <label className="form-label small fw-semibold">Fine type</label>
              <input className="form-control" required placeholder="e.g. Absence, Tardiness" value={form.fine_type}
                onChange={(e) => setForm({ ...form, fine_type: e.target.value })} />
            </div>
            <div className="col-12">
              <label className="form-label small fw-semibold">Amount (₱)</label>
              <input type="number" min="0" step="0.01" className="form-control" required value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="col-12">
              <label className="form-label small fw-semibold">Description</label>
              <textarea className="form-control" rows="2" value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
