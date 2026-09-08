export default function StatusBadge({ status }) {
  const key = String(status || '').toLowerCase()
  return <span className={`badge-status badge-${key}`}>{status}</span>
}
