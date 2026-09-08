import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const ACTION_ICON = {
  create: 'bi-plus-circle text-success',
  update: 'bi-pencil-square text-warning',
  delete: 'bi-trash text-danger',
  login: 'bi-box-arrow-in-right',
}

export default function AuditLogs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState('')
  const [search, setSearch] = useState('')
  const [purging, setPurging] = useState(false)

  const loadLogs = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('audit_logs')
      .select('*, people:user_id(full_name, officers_id)')
      .order('created_at', { ascending: false })
      .limit(200)
    setLogs(data || [])
    setLoading(false)
  }

  useEffect(() => { loadLogs() }, [])

  const filtered = useMemo(() => logs.filter((log) => {
    if (actionFilter && log.action !== actionFilter) return false
    if (search) {
      const haystack = `${log.people?.full_name || 'system'} ${log.action} ${log.entity_type || ''} ${JSON.stringify(log.details || {})}`.toLowerCase()
      if (!haystack.includes(search.toLowerCase())) return false
    }
    return true
  }), [logs, actionFilter, search])

  const handlePurge = async () => {
    if (!window.confirm('Delete all audit log entries older than 30 days? This cannot be undone.')) return
    setPurging(true)
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await supabase.from('audit_logs').delete().lt('created_at', cutoff)
    setPurging(false)
    if (error) return window.alert(error.message)
    loadLogs()
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
        <div className="d-flex gap-2 flex-wrap">
          <input className="form-control form-control-sm" style={{ maxWidth: 240 }} placeholder="Search logs…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="form-select form-select-sm" style={{ maxWidth: 160 }} value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="">All actions</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="login">Login</option>
          </select>
        </div>
        <button className="btn btn-sm btn-outline-danger" onClick={handlePurge} disabled={purging}>
          <i className="bi bi-trash3 me-1"></i>{purging ? 'Purging…' : 'Purge 30d+'}
        </button>
      </div>
      <div className="text-muted small mb-3">Logs are retained for 30 days; older entries can be purged above.</div>

      <div className="table-surface">
        <div className="table-responsive">
          <table className="table mb-0">
            <thead>
              <tr><th>When</th><th>User</th><th>Action</th><th>Resource</th><th>Details</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="text-center text-muted py-4">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="5" className="text-center text-muted py-4">No activity recorded yet.</td></tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id}>
                    <td className="small text-muted">{new Date(log.created_at).toLocaleString()}</td>
                    <td>{log.people?.full_name || 'System'}</td>
                    <td className="text-capitalize">
                      <i className={`bi ${ACTION_ICON[log.action] || 'bi-dot'} me-1`}></i>{log.action}
                    </td>
                    <td className="small text-muted text-capitalize">{log.entity_type || '—'}</td>
                    <td className="small text-muted" style={{ maxWidth: 320, whiteSpace: 'pre-wrap' }}>
                      {log.details && Object.keys(log.details).length ? JSON.stringify(log.details) : '—'}
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
