import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { logAction } from '../utils/audit'
import { parseOfficerQrPayload } from '../utils/qr'
import StatusBadge from '../components/StatusBadge'

export default function Attendance() {
  const { profile } = useAuth()
  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState('')
  const [officers, setOfficers] = useState([])
  const [records, setRecords] = useState([])
  const [scanning, setScanning] = useState(false)
  const [scanMessage, setScanMessage] = useState(null)
  const [manualOfficer, setManualOfficer] = useState('')
  const scannerRef = useRef(null)
  const readerElId = 'qr-reader'

  useEffect(() => {
    supabase.from('events').select('*').in('status', ['upcoming', 'ongoing']).order('date').then(({ data }) => {
      setEvents(data || [])
      if (data?.length) setSelectedEvent(data[0].id)
    })
    supabase.from('people').select('*').eq('is_active', true).order('full_name').then(({ data }) => setOfficers(data || []))
  }, [])

  const loadRecords = async (eventId) => {
    if (!eventId) return setRecords([])
    const { data } = await supabase
      .from('attendance')
      .select('*, people:person_id(full_name, officers_id)')
      .eq('event_id', eventId)
      .order('check_in_time', { ascending: false })
    setRecords(data || [])
  }

  useEffect(() => { loadRecords(selectedEvent) }, [selectedEvent])

  const markAttendance = async (personId, method) => {
    if (!selectedEvent) {
      setScanMessage({ type: 'danger', text: 'Select an event first.' })
      return
    }
    const { error, data } = await supabase
      .from('attendance')
      .upsert(
        { event_id: selectedEvent, person_id: personId, status: 'present', method, check_in_time: new Date().toISOString() },
        { onConflict: 'event_id,person_id' }
      )
      .select()
      .single()

    if (error) {
      setScanMessage({ type: 'danger', text: error.message })
      return
    }
    await logAction(profile?.id, 'create', 'attendance', data.id, { method, event_id: selectedEvent })
    setScanMessage({ type: 'success', text: 'Attendance recorded.' })
    loadRecords(selectedEvent)
  }

  const handleManualSubmit = (e) => {
    e.preventDefault()
    if (!manualOfficer) return
    markAttendance(manualOfficer, 'manual')
    setManualOfficer('')
  }

  const startScanner = async () => {
    setScanMessage(null)
    setScanning(true)
    const qr = new Html5Qrcode(readerElId)
    scannerRef.current = qr
    try {
      await qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 240 },
        async (decodedText) => {
          const parsed = parseOfficerQrPayload(decodedText)
          if (!parsed) {
            setScanMessage({ type: 'danger', text: 'Unrecognized QR code.' })
            return
          }
          const officer = officers.find((o) => o.officers_id === parsed.officersId)
          if (!officer) {
            setScanMessage({ type: 'danger', text: `No officer found for ${parsed.officersId}` })
            return
          }
          await markAttendance(officer.id, 'qr_code')
          await stopScanner()
        }
      )
    } catch (err) {
      setScanMessage({ type: 'danger', text: 'Camera access failed: ' + err.message })
      setScanning(false)
    }
  }

  const stopScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); await scannerRef.current.clear() } catch { /* noop */ }
    }
    setScanning(false)
  }

  useEffect(() => () => { stopScanner() }, [])

  return (
    <div className="row g-3">
      <div className="col-lg-5">
        <div className="card-surface p-3 mb-3">
          <label className="form-label small fw-semibold">Event</label>
          <select className="form-select" value={selectedEvent} onChange={(e) => setSelectedEvent(e.target.value)}>
            <option value="">Select an event…</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.title} — {ev.date}</option>
            ))}
          </select>
        </div>

        <div className="card-surface p-3 mb-3">
          <h6 className="fw-bold mb-2" style={{ color: 'var(--navy-900)' }}>QR Scan</h6>
          <div id={readerElId} style={{ minHeight: scanning ? 260 : 0 }}></div>
          {!scanning ? (
            <button className="btn btn-navy w-100 mt-2" onClick={startScanner} disabled={!selectedEvent}>
              <i className="bi bi-camera me-1"></i> Start Scanner
            </button>
          ) : (
            <button className="btn btn-outline-danger w-100 mt-2" onClick={stopScanner}>
              <i className="bi bi-stop-circle me-1"></i> Stop Scanner
            </button>
          )}
        </div>

        <div className="card-surface p-3">
          <h6 className="fw-bold mb-2" style={{ color: 'var(--navy-900)' }}>Manual Entry</h6>
          <form onSubmit={handleManualSubmit} className="d-flex gap-2">
            <select className="form-select" value={manualOfficer} onChange={(e) => setManualOfficer(e.target.value)}>
              <option value="">Select officer…</option>
              {officers.map((o) => (
                <option key={o.id} value={o.id}>{o.full_name} ({o.officers_id})</option>
              ))}
            </select>
            <button className="btn btn-outline-navy" type="submit" disabled={!selectedEvent}>Add</button>
          </form>
        </div>

        {scanMessage && (
          <div className={`alert alert-${scanMessage.type} mt-3 py-2`}>{scanMessage.text}</div>
        )}
      </div>

      <div className="col-lg-7">
        <div className="table-surface">
          <div className="table-responsive">
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>Officer ID</th>
                  <th>Name</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Check-in</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr><td colSpan="5" className="text-center text-muted py-4">No attendance recorded for this event.</td></tr>
                ) : (
                  records.map((r) => (
                    <tr key={r.id}>
                      <td className="fw-semibold">{r.people?.officers_id}</td>
                      <td>{r.people?.full_name}</td>
                      <td className="text-capitalize">{r.method?.replace('_', ' ')}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="small text-muted">
                        {r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString() : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
