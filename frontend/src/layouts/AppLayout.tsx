import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IoGridOutline,
  IoPeopleOutline,
  IoPulseOutline,
  IoBarChartOutline,
  IoHardwareChipOutline,
  IoSettingsOutline,
  IoLogOutOutline,
  IoMenuOutline,
  IoHeartOutline,
  IoPersonCircleOutline,
  IoChevronDownOutline,
} from 'react-icons/io5';
import { useLogout } from '@/hooks/useAuth';
import { useAuthContext } from '@/contexts/AuthContext';

const navItems = [
  { to: '/', icon: IoGridOutline, label: 'Dashboard' },
  { to: '/patients', icon: IoPeopleOutline, label: 'Responden' },
  { to: '/monitoring', icon: IoPulseOutline, label: 'Monitoring' },
  { to: '/reports', icon: IoBarChartOutline, label: 'Laporan' },
  { to: '/devices', icon: IoHardwareChipOutline, label: 'Device' },
];

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/patients': 'Responden',
  '/monitoring': 'Monitoring',
  '/reports': 'Laporan',
  '/settings': 'Pengaturan',
  '/devices': 'Device',
};

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const handleLogout = useLogout();
  const { user } = useAuthContext();

  // Close user menu on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleSidebar = () => {
    if (window.innerWidth < 1024) {
      setSidebarOpen((prev) => !prev);
    } else {
      setSidebarCollapsed((prev) => !prev);
    }
  };

  const currentPageTitle = pageTitles[location.pathname] || '';

  return (
    <div className="min-h-screen bg-[#F8FAFC] lg:flex lg:h-screen">
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full bg-white border-r border-gray-100 shadow-lg lg:shadow-none lg:relative lg:z-auto lg:flex-shrink-0 transition-[width] duration-200 ease-in-out will-change-[width] ${
          sidebarOpen ? 'translate-x-0 w-[260px]' : '-translate-x-full w-[260px]'
        } lg:translate-x-0 ${
          sidebarCollapsed ? 'lg:w-[68px]' : 'lg:w-[260px]'
        }`}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Logo */}
          <div className={`flex items-center border-b border-gray-100 px-6 py-5 ${
            sidebarCollapsed ? 'lg:justify-center lg:px-0 lg:py-5' : ''
          }`}>
            <div className={`flex items-center gap-3 ${
              sidebarCollapsed ? 'lg:flex-col lg:gap-0' : ''
            }`}>
              <div className="w-10 h-10 rounded-xl bg-primary-500 flex items-center justify-center flex-shrink-0">
                <IoHeartOutline className="w-5 h-5 text-white" />
              </div>
              <div className={`whitespace-nowrap ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
                <h1 className="text-base font-bold text-slate-900">VitalMonitor</h1>
                <p className="text-xs text-slate-400">BPM & SpO₂ Dashboard</p>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => {
                  if (window.innerWidth < 1024) setSidebarOpen(false);
                }}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium ${
                    sidebarCollapsed
                      ? 'lg:justify-center lg:px-0 lg:py-2.5'
                      : ''
                  } ${
                    isActive
                      ? 'bg-primary-50 text-primary-600'
                      : 'text-slate-600 hover:bg-gray-50 hover:text-slate-800'
                  }`
                }
              >
                <item.icon className="flex-shrink-0 w-5 h-5" />
                <span className={`whitespace-nowrap ${sidebarCollapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* User info (mobile only) */}
          {user && (
            <div className="px-3 py-4 border-t border-gray-100 lg:hidden">
              <div className="px-3.5 py-2">
                <p className="text-sm font-medium text-slate-800 truncate">{user.name}</p>
                <p className="text-xs text-slate-400 truncate">{user.email}</p>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top navbar */}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between px-4 lg:px-6 h-16">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSidebar}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                aria-label={sidebarCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
              >
                <IoMenuOutline className="w-5 h-5 text-slate-600" />
              </button>

              <span className="hidden sm:block text-base font-semibold text-slate-800">
                {currentPageTitle}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-primary-50 rounded-lg">
                <IoPulseOutline className="w-4 h-4 text-primary-500" />
                <span className="text-xs font-medium text-primary-600">Live</span>
              </div>

              {/* User dropdown */}
              {user && (
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    <IoPersonCircleOutline className="w-7 h-7 text-slate-500" />
                    <IoChevronDownOutline className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {userMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50"
                      >
                        {/* User info */}
                        <div className="px-4 py-2.5 border-b border-gray-100">
                          <p className="text-sm font-medium text-slate-800 truncate">{user.name}</p>
                          <p className="text-xs text-slate-400 truncate">{user.email}</p>
                        </div>

                        {/* Settings */}
                        <button
                          onClick={() => { navigate('/settings'); setUserMenuOpen(false); }}
                          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-600 hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                          <IoSettingsOutline className="w-4 h-4" />
                          Pengaturan
                        </button>

                        {/* Logout */}
                        <button
                          onClick={() => { setUserMenuOpen(false); handleLogout(); }}
                          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-danger-500 hover:bg-danger-50 transition-colors cursor-pointer"
                        >
                          <IoLogOutOutline className="w-4 h-4" />
                          Keluar
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
