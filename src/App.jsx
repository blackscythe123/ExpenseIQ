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

  useEffect(() => {
    // Dynamically update the document's theme-color meta tag for PWA/Mobile top bars
    let metaTheme = document.querySelector('meta[name="theme-color"]')
    if (!metaTheme) {
      metaTheme = document.createElement('meta')
      metaTheme.name = 'theme-color'
      document.head.appendChild(metaTheme)
    }
    // Update color based on dark/light mode background
    metaTheme.content = theme === 'light' ? '#f4f4f5' : '#0a0a0c'
  }, [theme])

  const handleDataChange = () => setRefreshKey(k => k + 1)

  // Apply theme classes to the root container
  const themeClass = `${theme === 'light' ? 'light' : ''} theme-${colorTheme}`

  return (
    <div className="min-h-screen w-full flex flex-col bg-background text-foreground">
      <div className={`flex flex-col flex-1 h-[100dvh] w-full ${themeClass} relative`}>


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
