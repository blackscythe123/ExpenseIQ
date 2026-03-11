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
    const isCustom = colorTheme.startsWith('#')
    const primaryHex = isCustom ? colorTheme : {
      'violet': '#7c3aed', 'blue': '#2563eb', 'rose': '#e11d48', 'amber': '#d97706', 'emerald': '#059669'
    }[colorTheme] || '#7c3aed'

    // Dynamically update the document's theme-color meta tag for PWA/Mobile top bars
    let metaTheme = document.querySelector('meta[name="theme-color"]')
    if (!metaTheme) {
      metaTheme = document.createElement('meta')
      metaTheme.name = 'theme-color'
      document.head.appendChild(metaTheme)
    }
    metaTheme.content = theme === 'light' ? '#ffffff' : '#0a0a0c' // or primaryHex if preferred

    // Apply exact background bounds
    const baseClasses = `${theme === 'light' ? 'light' : ''} bg-background text-foreground`
    
    if (isCustom) {
      document.body.className = baseClasses
      let r = parseInt(colorTheme.substring(1,3), 16) / 255
      let g = parseInt(colorTheme.substring(3,5), 16) / 255
      let b = parseInt(colorTheme.substring(5,7), 16) / 255
      let cmin = Math.min(r,g,b), cmax = Math.max(r,g,b), delta = cmax - cmin, h = 0, s = 0, l = 0
      if (delta !== 0) {
        if (cmax === r) h = ((g - b) / delta) % 6
        else if (cmax === g) h = (b - r) / delta + 2
        else h = (r - g) / delta + 4
      }
      h = Math.round(h * 60)
      if (h < 0) h += 360
      l = (cmax + cmin) / 2
      s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1))
      s = +(s * 100).toFixed(1)
      l = +(l * 100).toFixed(1)
      
      document.body.style.setProperty('--primary', `${h} ${s}% ${l}%`)
      document.body.style.setProperty('--grad-primary', `linear-gradient(135deg, ${colorTheme}, ${colorTheme}cc)`)
      document.body.style.setProperty('--primary-foreground', l > 50 ? '240 10% 10%' : '0 0% 100%')
    } else {
      document.body.className = `${baseClasses} theme-${colorTheme}`
      document.body.style.removeProperty('--primary')
      document.body.style.removeProperty('--grad-primary')
      document.body.style.removeProperty('--primary-foreground')
    }

    // Dynamic Manifest for PWA to adopt exact theme
    fetch('/manifest.json').then(r => r.json()).then(manifest => {
      manifest.theme_color = primaryHex
      manifest.background_color = theme === 'light' ? '#ffffff' : '#0a0c10'
      const stringManifest = JSON.stringify(manifest)
      const blob = new Blob([stringManifest], {type: 'application/json'})
      const manifestURL = URL.createObjectURL(blob)
      let manifestLink = document.querySelector('link[rel="manifest"]')
      if (manifestLink) manifestLink.href = manifestURL
    }).catch(e => console.error(e))

  }, [theme, colorTheme])

  const handleDataChange = () => setRefreshKey(k => k + 1)

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden relative">
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
  )
}
