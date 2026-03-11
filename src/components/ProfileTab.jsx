import { useState, useRef, useEffect } from 'react'
import { Sun, Moon, Download, Upload, QrCode, Eye, EyeOff, Lock, Palette, Check, AlertCircle } from 'lucide-react'
import { exportAllData, importAllData, getSetting, setSetting } from '../lib/db'
import { encryptData, decryptData } from '../lib/crypto'
import { motion, AnimatePresence } from 'framer-motion'
import QRCode from 'qrcode'

const COLOR_THEMES = [
    { id: 'violet', label: 'Violet', color: '#7c3aed' },
    { id: 'blue', label: 'Ocean', color: '#2563eb' },
    { id: 'rose', label: 'Rose', color: '#e11d48' },
    { id: 'amber', label: 'Amber', color: '#d97706' },
    { id: 'emerald', label: 'Emerald', color: '#059669' },
]

export default function ProfileTab({ theme, colorTheme, onThemeChange, onColorThemeChange, onDataChange }) {
    const [exportPassword, setExportPassword] = useState('')
    const [importPassword, setImportPassword] = useState('')
    const [importData, setImportData] = useState('')
    const [showExportPwd, setShowExportPwd] = useState(false)
    const [showImportPwd, setShowImportPwd] = useState(false)
    const [qrDataUrl, setQrDataUrl] = useState(null)
    const [exportStatus, setExportStatus] = useState('idle')
    const [importStatus, setImportStatus] = useState('idle')
    const [statusMsg, setStatusMsg] = useState('')
    const [pdfPassword, setPdfPassword] = useState('')
    const [newPdfPwd, setNewPdfPwd] = useState('')
    const [showPdfPwd, setShowPdfPwd] = useState(false)
    const importRef = useRef()

    useEffect(() => {
        getSetting('pdfPassword').then(p => { if (p) setPdfPassword(p) })
    }, [])

    const handleThemeChange = (t) => {
        onThemeChange(t)
        setSetting('theme', t)
    }

    const handleColorThemeChange = (c) => {
        onColorThemeChange(c)
        setSetting('colorTheme', c)
    }

    const handleExport = async () => {
        if (!exportPassword) return
        setExportStatus('loading')
        try {
            const data = await exportAllData()
            const encrypted = await encryptData(data, exportPassword)

            // Generate QR code (may be large, so use a truncated preview + full data)
            const qr = await QRCode.toDataURL(encrypted, {
                errorCorrectionLevel: 'L',
                width: 280,
                margin: 1,
                color: { dark: '#7c3aed', light: '#0a0a0f' },
            })
            setQrDataUrl(qr)

            // Also offer download as file
            const blob = new Blob([encrypted], { type: 'text/plain' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `expenseiq-backup-${new Date().toISOString().slice(0, 10)}.eiq`
            a.click()
            URL.revokeObjectURL(url)

            setExportStatus('success')
            setStatusMsg('Data exported! QR code and .eiq file generated.')
        } catch (err) {
            setExportStatus('error')
            setStatusMsg(err.message || 'Export failed.')
        }
    }

    const handleImportFile = async (e) => {
        const file = e.target.files[0]
        if (!file) return
        const text = await file.text()
        setImportData(text.trim())
    }

    const handleImport = async () => {
        if (!importData || !importPassword) return
        setImportStatus('loading')
        try {
            const data = await decryptData(importData.trim(), importPassword)
            await importAllData(data)
            setImportStatus('success')
            setStatusMsg('Data imported successfully!')
            onDataChange()
        } catch (err) {
            setImportStatus('error')
            setStatusMsg(err.message || 'Import failed. Wrong password?')
        }
    }

    const handleChangePdfPassword = async () => {
        if (!newPdfPwd) return
        await setSetting('pdfPassword', newPdfPwd)
        setPdfPassword(newPdfPwd)
        setNewPdfPwd('')
        setStatusMsg('PDF password updated!')
        setExportStatus('success')
        setTimeout(() => setExportStatus('idle'), 2000)
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 pb-6">
            <div className="pt-4 pb-4">
                <h2 className="text-xl font-bold gradient-text">Profile</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Customize your experience</p>
            </div>

            {/* Dark / Light mode */}
            <div className="glass-card p-4 mb-3">
                <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                    {theme === 'dark' ? <Moon className="w-4 h-4 text-primary" /> : <Sun className="w-4 h-4 text-amber-400" />}
                    Appearance
                </p>
                <div className="glass-card p-1 flex gap-1">
                    {[
                        { id: 'dark', label: '🌙 Dark', icon: Moon },
                        { id: 'light', label: '☀️ Light', icon: Sun },
                    ].map(({ id, label }) => (
                        <button
                            key={id}
                            onClick={() => handleThemeChange(id)}
                            className={`flex-1 py-2.5 text-xs font-semibold rounded-xl transition-all duration-200 ${theme === id ? 'bg-primary text-white' : 'text-muted-foreground'
                                }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Color themes */}
            <div className="glass-card p-4 mb-3">
                <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Palette className="w-4 h-4 text-primary" /> Color Theme
                </p>
                <div className="flex gap-2 flex-wrap">
                    {COLOR_THEMES.map(({ id, label, color }) => (
                        <button
                            key={id}
                            onClick={() => handleColorThemeChange(id)}
                            className="flex flex-col items-center gap-1.5"
                        >
                            <div
                                className={`w-10 h-10 rounded-xl transition-all duration-200 relative ${colorTheme === id ? 'ring-2 ring-white ring-offset-2 ring-offset-background scale-110' : ''}`}
                                style={{ background: `linear-gradient(135deg, ${color}, ${color}88)` }}
                            >
                                {colorTheme === id && (
                                    <Check className="w-4 h-4 text-white absolute inset-0 m-auto" />
                                )}
                            </div>
                            <span className="text-[10px] text-muted-foreground">{label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* PDF Password management */}
            <div className="glass-card p-4 mb-3">
                <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-primary" /> PDF Password
                </p>
                {pdfPassword && (
                    <p className="text-xs text-muted-foreground mb-2">
                        Current: <span className="font-mono">{"•".repeat(pdfPassword.length)}</span>
                    </p>
                )}
                <div className="relative mb-2">
                    <input
                        type={showPdfPwd ? 'text' : 'password'}
                        value={newPdfPwd}
                        onChange={e => setNewPdfPwd(e.target.value)}
                        placeholder="Enter new PDF password"
                        className="w-full bg-input border border-border rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button onClick={() => setShowPdfPwd(!showPdfPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showPdfPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                </div>
                <button
                    onClick={handleChangePdfPassword}
                    disabled={!newPdfPwd}
                    className="w-full py-2.5 rounded-xl text-sm font-medium disabled:opacity-40 transition-all"
                    style={{ background: newPdfPwd ? 'var(--grad-primary)' : undefined }}
                >
                    Update Password
                </button>
            </div>

            {/* Export */}
            <div className="glass-card p-4 mb-3">
                <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Download className="w-4 h-4 text-primary" /> Export Data
                </p>
                <div className="relative mb-3">
                    <input
                        type={showExportPwd ? 'text' : 'password'}
                        value={exportPassword}
                        onChange={e => setExportPassword(e.target.value)}
                        placeholder="Encryption password for export"
                        className="w-full bg-input border border-border rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button onClick={() => setShowExportPwd(!showExportPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showExportPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                </div>
                <button
                    onClick={handleExport}
                    disabled={!exportPassword || exportStatus === 'loading'}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
                    style={{ background: exportPassword ? 'var(--grad-primary)' : undefined }}
                >
                    {exportStatus === 'loading' ? (
                        <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Encrypting...</>
                    ) : (
                        <><QrCode className="w-4 h-4" /> Export as QR + File</>
                    )}
                </button>

                {/* QR Code display */}
                <AnimatePresence>
                    {qrDataUrl && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="mt-4 flex flex-col items-center gap-2"
                        >
                            <p className="text-xs text-muted-foreground">Scan to import on another device</p>
                            <div className="p-3 rounded-2xl" style={{ background: '#0a0a0f' }}>
                                <img src={qrDataUrl} alt="Export QR Code" className="w-48 h-48 rounded-xl" />
                            </div>
                            <p className="text-[10px] text-muted-foreground text-center">
                                AES-256 encrypted. You need the password to decrypt.
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Import */}
            <div className="glass-card p-4 mb-3">
                <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Upload className="w-4 h-4 text-primary" /> Import Data
                </p>
                <button
                    onClick={() => importRef.current?.click()}
                    className="w-full py-2.5 rounded-xl text-sm font-medium bg-secondary text-muted-foreground hover:bg-secondary/80 transition mb-3 flex items-center justify-center gap-2"
                >
                    <Upload className="w-4 h-4" /> Select .eiq backup file
                </button>
                <input ref={importRef} type="file" accept=".eiq,.txt" className="hidden" onChange={handleImportFile} />

                {importData && (
                    <p className="text-xs text-green-400 mb-2 flex items-center gap-1">
                        <Check className="w-3 h-3" /> File loaded ({importData.length} chars)
                    </p>
                )}

                <div className="relative mb-3">
                    <input
                        type={showImportPwd ? 'text' : 'password'}
                        value={importPassword}
                        onChange={e => setImportPassword(e.target.value)}
                        placeholder="Decryption password"
                        className="w-full bg-input border border-border rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button onClick={() => setShowImportPwd(!showImportPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showImportPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                </div>
                <button
                    onClick={handleImport}
                    disabled={!importData || !importPassword || importStatus === 'loading'}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 transition-all"
                    style={{ background: (importData && importPassword) ? 'linear-gradient(135deg, #059669, #06b6d4)' : undefined }}
                >
                    {importStatus === 'loading' ? 'Importing...' : 'Import & Decrypt'}
                </button>
            </div>

            {/* Status message */}
            <AnimatePresence>
                {statusMsg && (exportStatus !== 'idle' || importStatus !== 'idle') && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className={`glass-card p-3 flex items-center gap-2 text-sm ${(exportStatus === 'error' || importStatus === 'error') ? 'border-red-500/30 bg-red-500/5' : 'border-green-500/30 bg-green-500/5'
                            }`}
                    >
                        {(exportStatus === 'error' || importStatus === 'error') ? (
                            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        ) : (
                            <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                        )}
                        <p className={`text-xs ${(exportStatus === 'error' || importStatus === 'error') ? 'text-red-400' : 'text-green-400'}`}>
                            {statusMsg}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* App info */}
            <div className="mt-6 text-center">
                <p className="text-xs text-muted-foreground">ExpenseIQ v1.0.0</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">All data stored locally in your browser</p>
            </div>
        </motion.div>
    )
}
