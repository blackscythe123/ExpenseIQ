import { useState, useEffect } from 'react'
import { Home, Upload, Tag, User } from 'lucide-react'
import HomeTab from './components/HomeTab'
import UploadTab from './components/UploadTab'
import CategorizeTab from './components/CategorizeTab'
import ProfileTab from './components/ProfileTab'
import { getSetting } from './lib/db'

const TABS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'upload', label: 'Upload', icon: Upload },
  { id: 'categorize', label: 'Categorize', icon: Tag },
  { id: 'profile', label: 'Profile', icon: User },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('home')
  const [theme, setTheme] = useState('dark')
  const [colorTheme, setColorTheme] = useState('violet')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    // Load saved theme settings
    Promise.all([
      getSetting('theme'),
      getSetting('colorTheme'),
    ]).then(([t, c]) => {
      if (t) setTheme(t)
      if (c) setColorTheme(c)
    })
  }, [])

  const handleDataChange = () => setRefreshKey(k => k + 1)

  // Apply theme classes to the root container
  const themeClass = `${theme === 'light' ? 'light' : ''} theme-${colorTheme}`

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#050508]"
      style={{ background: 'radial-gradient(ellipse at center, #0f0520 0%, #050508 70%)' }}>
      <div className={`mobile-frame ${themeClass} shadow-2xl relative`}
        style={{ boxShadow: '0 0 80px rgba(124,58,237,0.15), 0 0 200px rgba(124,58,237,0.05)' }}>

        {/* Status bar */}
        <div className="flex justify-between items-center px-6 py-2 text-xs font-medium opacity-60 flex-shrink-0">
          <span>9:41</span>
          <div className="flex gap-1 items-center">
            <div className="w-4 h-2 border border-current rounded-sm">
              <div className="w-3 h-1.5 bg-current rounded-sm m-px" />
            </div>
          </div>
        </div>

        {/* Page content */}
        <div className="content-scroll flex-1">
          {activeTab === 'home' && <HomeTab key={refreshKey} />}
          {activeTab === 'upload' && <UploadTab onDataChange={handleDataChange} />}
          {activeTab === 'categorize' && <CategorizeTab key={refreshKey} onDataChange={handleDataChange} />}
          {activeTab === 'profile' && (
            <ProfileTab
              theme={theme}
              colorTheme={colorTheme}
              onThemeChange={setTheme}
              onColorThemeChange={setColorTheme}
              onDataChange={handleDataChange}
            />
          )}
        </div>

        {/* Bottom navbar */}
        <nav className="navbar flex-shrink-0 pb-safe">
          <div className="flex">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`nav-item ${activeTab === id ? 'active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                <Icon
                  className="nav-icon"
                  strokeWidth={activeTab === id ? 2.5 : 1.8}
                />
                <span>{label}</span>
                {activeTab === id && <div className="nav-dot" />}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
