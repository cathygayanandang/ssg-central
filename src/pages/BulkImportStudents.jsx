import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { logAction } from '../utils/audit'
import { parseStudentFile } from '../utils/importParser'
import { buildStudentQrPayload } from '../utils/qr'

export default function BulkImportStudents() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setResult(null)
    setFileName(file.name)
    setParsing(true)
    try {
      const { rows } = await parseStudentFile(file)
      setRows(rows)
    } catch (err) {
      setError(err.message)
      setRows([])
    } finally {
      setParsing(false)
    }
  }

  const validRows = rows.filter((r) => r.errors.length === 0)
  const invalidRows = rows.filter((r) => r.errors.length > 0)

  const handleImport = async () => {
    if (validRows.length === 0) return
    setImporting(true)
    setError('')
    try {
      const { data: studentNos, error: rpcError } = await supabase.rpc('next_student_no_batch', { n: validRows.length })
      if (rpcError) throw rpcError

      const payload = validRows.map((r, i) => ({
        student_no: studentNos[i],
        first_name: r.first_name,
        last_name: r.last_name,
        course: r.course,
        year_level: r.year_level,
        email: r.email || null,
        phone: r.phone || null,
        qr_data: buildStudentQrPayload(studentNos[i], `${r.first_name} ${r.last_name}`),
      }))

      const { data: inserted, error: insertError } = await supabase.from('students').insert(payload).select('id')
      if (insertError) throw insertError

      await logAction(profile?.id, 'create', 'students_bulk_import', null, {
        count: inserted.length,
        file: fileName,
      })
      setResult({ imported: inserted.length })
      setRows([])
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="row justify-content-center">
      <div className="col-lg-8">
        <div className="card-surface p-4">
          <h6 className="fw-bold mb-3" style={{ color: 'var(--navy-900)' }}>
            <i className="bi bi-upload me-2"></i>Bulk Import Students
          </h6>
          <p className="text-muted small">
            Upload a CSV or Excel file to add multiple student records at once. The file should
            include these column headers (case-insensitive):
          </p>
          <div className="table-surface mb-3">
            <table className="table table-sm mb-0">
              <thead><tr><th>Column</th><th>Required</th><th>Notes</th></tr></thead>
              <tbody>
                <tr><td><code>first_name</code></td><td>Yes</td><td>—</td></tr>
                <tr><td><code>last_name</code></td><td>Yes</td><td>—</td></tr>
                <tr><td><code>course</code></td><td>Yes</td><td>e.g. BSIT, BSED</td></tr>
                <tr><td><code>year_level</code></td><td>No</td><td>Defaults to 1 if blank/invalid</td></tr>
                <tr><td><code>email</code></td><td>No</td><td>—</td></tr>
                <tr><td><code>phone</code></td><td>No</td><td>—</td></tr>
              </tbody>
            </table>
          </div>

          <div className="border border-2 border-dashed rounded-3 p-4 text-center mb-3" style={{ borderColor: 'var(--gray-300)' }}>
            <i className="bi bi-file-earmark-arrow-up fs-1 text-muted"></i>
            <p className="small text-muted mb-2">Choose a .csv or .xlsx file to begin.</p>
            <label className="btn btn-navy mb-0">
              <i className="bi bi-folder2-open me-1"></i> Choose File
              <input type="file" accept=".csv,.xlsx,.xls" hidden onChange={handleFile} />
            </label>
            {fileName && <div className="small text-muted mt-2">Selected: {fileName}</div>}
          </div>

          {error && <div className="alert alert-danger py-2">{error}</div>}
          {parsing && <div className="text-muted small">Parsing file…</div>}

          {rows.length > 0 && (
            <>
              <div className="d-flex gap-3 mb-3">
                <span className="badge-status badge-active">{validRows.length} ready to import</span>
                {invalidRows.length > 0 && <span className="badge-status badge-unpaid">{invalidRows.length} row(s) with errors</span>}
              </div>
              <div className="table-surface mb-3" style={{ maxHeight: 320, overflowY: 'auto' }}>
                <table className="table table-sm mb-0">
                  <thead><tr><th>Row</th><th>Name</th><th>Course</th><th>Year</th><th>Issue</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.rowNumber} className={r.errors.length ? 'table-danger' : ''}>
                        <td>{r.rowNumber}</td>
                        <td>{r.first_name} {r.last_name}</td>
                        <td>{r.course}</td>
                        <td>{r.year_level}</td>
                        <td className="small text-danger">{r.errors.join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="btn btn-navy w-100" disabled={validRows.length === 0 || importing} onClick={handleImport}>
                {importing ? 'Importing…' : `Import ${validRows.length} Student(s)`}
              </button>
            </>
          )}

          {result && (
            <div className="alert alert-success mt-3 py-2">
              Successfully imported {result.imported} student(s).
            </div>
          )}

          <button className="btn btn-outline-secondary w-100 mt-3" onClick={() => navigate('/students')}>
            <i className="bi bi-arrow-left me-1"></i> Back to Students
          </button>
        </div>
      </div>
    </div>
  )
}
