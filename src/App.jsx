import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Officers from './pages/Officers'
import StudentsDirectory from './pages/StudentsDirectory'
import BulkImportStudents from './pages/BulkImportStudents'
import Events from './pages/Events'
import Attendance from './pages/Attendance'
import StudentAttendanceOverview from './pages/StudentAttendanceOverview'
import StudentScan from './pages/StudentScan'
import StudentAttendanceRecords from './pages/StudentAttendanceRecords'
import FinesPage from './pages/Fines'
import FineSettings from './pages/FineSettings'
import AuditLogs from './pages/AuditLogs'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="officers" element={<Officers />} />
        <Route path="students" element={<StudentsDirectory />} />
        <Route
          path="students/bulk-import"
          element={
            <ProtectedRoute adminOnly>
              <BulkImportStudents />
            </ProtectedRoute>
          }
        />
        <Route path="events" element={<Events />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="student-attendance" element={<StudentAttendanceOverview />} />
        <Route path="student-attendance/:eventId/scan" element={<StudentScan />} />
        <Route path="student-attendance/:eventId/records" element={<StudentAttendanceRecords />} />
        <Route path="fines" element={<FinesPage />} />
        <Route
          path="fine-settings"
          element={
            <ProtectedRoute adminOnly>
              <FineSettings />
            </ProtectedRoute>
          }
        />
        <Route
          path="audit-logs"
          element={
            <ProtectedRoute adminOnly>
              <AuditLogs />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  )
}
