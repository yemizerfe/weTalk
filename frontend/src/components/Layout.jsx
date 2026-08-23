import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import WebRTCManager from './WebRTCManager'
import IncomingCall from './IncomingCall'
import ActiveCall from './ActiveCall'

export default function Layout() {
  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      <Sidebar />
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <Outlet />
      </main>
      <WebRTCManager />
      <IncomingCall />
      <ActiveCall />
    </div>
  )
}