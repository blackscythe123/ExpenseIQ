import { useState, useRef, useEffect, useCallback } from 'react'
import { Sun, Moon, Download, Upload, QrCode, Eye, EyeOff, Lock, Palette, Check, AlertCircle, Camera, X, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { exportAllData, importAllData, getSetting, setSetting } from '../lib/db'
import { encryptData, decryptData, splitIntoChunks, reassembleChunks } from '../lib/crypto'
import { motion, AnimatePresence } from 'framer-motion'
import QRCode from 'qrcode'
import { Html5Qrcode } from 'html5-qrcode'

const COLOR_THEMES = [
    { id: 'violet', label: 'Violet', color: '#7c3aed' },
    { id: 'blue', label: 'Ocean', color: '#2563eb' },
    { id: 'rose', label: 'Rose', color: '#e11d48' },
    { id: 'amber', label: 'Amber', color: '#d97706' },
    { id: 'emerald', label: 'Emerald', color: '#059669' },
]

// QR chunk size in base64 chars — tuned for V40-L QR (~2800 bytes capacity)
// We use 1800 chars to leave headroom for EIQ prefix + error correction
const QR_CHUNK_SIZE = 1800

export default function ProfileTab({ theme, colorTheme, onThemeChange, onColorThemeChange, onDataChange }) {
    // Export state
    const [exportPassword, setExportPassword] = useState('')
    const [showExportPwd, setShowExportPwd] = useState(false)
    const [exportStatus, setExportStatus] = useState('idle') // idle|loading|done|error
    const [qrChunks, setQrChunks] = useState([]) // array of data-URL strings
    const [qrPage, setQrPage] = useState(0)
    const [exportMsg, setExportMsg] = useState('')

    // Import state
    const [importPassword, setImportPassword] = useState('')
    const [showImportPwd, setShowImportPwd] = useState(false)
    const [importStatus, setImportStatus] = useState('idle') // idle|scanning|done|error
    const [importMsg, setImportMsg] = useState('')
    const [scannedChunks, setScannedChunks] = useState([]) // { idx, total, data } objects
    const [scannerActive, setScannerActive] = useState(false)
    const [lastScan, setLastScan] = useState('')
    const scannerRef = useRef(null)
    const html5QrRef = useRef(null)

    // PDF password
    const [pdfPassword, setPdfPassword] = useState('')
    const [newPdfPwd, setNewPdfPwd] = useState('')
    const [showPdfPwd, setShowPdfPwd] = useState(false)

    useEffect(() => {
        getSetting('pdfPassword').then(p => { if (p) setPdfPassword(p) })
    }, [])

    // Cleanup scanner on unmount
    useEffect(() => {
        return () => { stopScanner() }
    }, [])

    const handleThemeChange = (t) => { onThemeChange(t); setSetting('theme', t) }
    const handleColorThemeChange = (c) => { onColorThemeChange(c); setSetting('colorTheme', c) }

    // ─── EXPORT ────────────────────────────────────────────────────────────────

    const handleExport = async () => {
        if (!exportPassword) return
        setExportStatus('loading')
        setExportMsg('Compressing & encrypting data…')
        setQrChunks([])
        try {
            const data = await exportAllData()
            const encrypted = await encryptData(data, exportPassword)

            // Split into QR-sized chunks
            const chunks = splitIntoChunks(encrypted, QR_CHUNK_SIZE)

            setExportMsg(`Generating ${chunks.length} QR code${chunks.length > 1 ? 's' : ''}…`)

            // Generate QR image for each chunk
            const qrImages = await Promise.all(chunks.map(chunk =>
                QRCode.toDataURL(chunk, {
                    errorCorrectionLevel: 'L', // lowest EC = most data capacity
                    width: 320,
                    margin: 1,
                    color: {
                        dark: colorTheme.startsWith('#') ? colorTheme : {
                            violet: '#7c3aed', blue: '#2563eb', rose: '#e11d48',
                            amber: '#d97706', emerald: '#059669'
                        }[colorTheme] || '#7c3aed',
                        light: '#00000000' // transparent background
                    },
                })
            ))

            setQrChunks(qrImages)
            setQrPage(0)
            setExportStatus('done')
            const savings = Math.round((1 - encrypted.length / JSON.stringify(data).length) * 100)
            setExportMsg(`${chunks.length} QR${chunks.length > 1 ? 's' : ''} ready • ${savings}% smaller than uncompressed`)
        } catch (err) {
            setExportStatus('error')
            setExportMsg(err.message || 'Export failed.')
        }
    }

    // ─── IMPORT / SCANNER ──────────────────────────────────────────────────────

    const startScanner = useCallback(async () => {
        setScannerActive(true)
        setImportStatus('scanning')
        setImportMsg('Point camera at QR code…')

        // Wait a tick for the DOM element to mount
        await new Promise(r => setTimeout(r, 100))

        try {
            const qr = new Html5Qrcode('qr-reader')
            html5QrRef.current = qr

            const cameras = await Html5Qrcode.getCameras()
            if (!cameras?.length) throw new Error('No camera found.')

            // Prefer back camera
            const cam = cameras.find(c => /back|rear|environment/i.test(c.label)) || cameras[cameras.length - 1]

            await qr.start(
                cam.id,
                { fps: 10, qrbox: { width: 260, height: 260 } },
                (decodedText) => handleQrScan(decodedText),
                () => {} // ignore errors
            )
        } catch (err) {
            setImportStatus('error')
            setImportMsg(err.message || 'Camera access failed.')
            setScannerActive(false)
        }
    }, [scannedChunks])

    const stopScanner = useCallback(async () => {
        if (html5QrRef.current) {
            try { await html5QrRef.current.stop() } catch {}
            html5QrRef.current = null
        }
        setScannerActive(false)
    }, [])

    const handleQrScan = useCallback((text) => {
        // Only process EIQ-format chunks
        const match = text.match(/^EIQ:(\d+)\/(\d+):(.+)$/)
        if (!match) return

        const idx = parseInt(match[1])
        const total = parseInt(match[2])
        const data = match[3]

        setScannedChunks(prev => {
            // Skip duplicates
            if (prev.some(c => c.idx === idx)) return prev
            const updated = [...prev, { idx, total, data }]
            const got = updated.length

            if (got === total) {
                setLastScan(`✓ All ${total} QR${total > 1 ? 's' : ''} scanned!`)
                setImportMsg(`All ${total} QR code${total > 1 ? 's' : ''} captured. Enter password and import.`)
                setImportStatus('ready')
                // Auto-stop scanner
                setTimeout(() => stopScanner(), 300)
            } else {
                setLastScan(`Scanned ${got}/${total} QR codes`)
                setImportMsg(`Got ${got}/${total} — scan the remaining QR code${total - got > 1 ? 's' : ''}`)
            }
            return updated
        })
    }, [stopScanner])

    const handleImport = async () => {
        if (!importPassword || !scannedChunks.length) return
        setImportStatus('loading')
        setImportMsg('Reassembling & decrypting…')
        try {
            const base64 = reassembleChunks(
                scannedChunks.map(c => `EIQ:${c.idx}/${c.total}:${c.data}`)
            )
            if (!base64) throw new Error('Chunks are incomplete or mismatched. Rescan all QR codes.')

            const data = await decryptData(base64, importPassword)
            await importAllData(data)
            setImportStatus('done')
            const txCount = data.transactions?.length ?? 0
            setImportMsg(`Imported ${txCount} transaction${txCount !== 1 ? 's' : ''} successfully!`)
            onDataChange()
        } catch (err) {
            setImportStatus('error')
            setImportMsg(err.message || 'Import failed. Wrong password?')
        }
    }

    const resetImport = () => {
        stopScanner()
        setScannedChunks([])
        setImportStatus('idle')
        setImportMsg('')
        setLastScan('')
        setImportPassword('')
    }

    const handleChangePdfPassword = async () => {
        if (!newPdfPwd) return
        await setSetting('pdfPassword', newPdfPwd)
        setPdfPassword(newPdfPwd)
        setNewPdfPwd('')
    }

    // ─── RENDER ────────────────────────────────────────────────────────────────

    const totalChunks = qrChunks.length
    const scannedTotal = scannedChunks[0]?.total ?? 0
    const scannedCount = scannedChunks.length

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 pb-6">
            <div className="pt-4 pb-4">
                <h2 className="text-xl font-bold gradient-text">Profile</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Customize your experience</p>
            </div>

            {/* Appearance */}
            <div className="glass-card p-4 mb-3">
                <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                    {theme === 'dark' ? <Moon className="w-4 h-4 text-primary" /> : <Sun className="w-4 h-4 text-amber-400" />}
                    Appearance
                </p>
                <div className="glass-card p-1 flex gap-1">
                    {[{ id: 'dark', label: '🌙 Dark' }, { id: 'light', label: '☀️ Light' }].map(({ id, label }) => (
                        <button
                            key={id}
                            onClick={() => handleThemeChange(id)}
                            className={`flex-1 py-2.5 text-xs font-semibold rounded-xl transition-all duration-200 ${theme === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                        >{label}</button>
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
                        <button key={id} onClick={() => handleColorThemeChange(id)} className="flex flex-col items-center gap-1.5">
                            <div
                                className={`w-10 h-10 rounded-xl transition-all duration-200 relative ${colorTheme === id ? 'ring-2 ring-white ring-offset-2 ring-offset-background scale-110' : ''}`}
                                style={{ background: `linear-gradient(135deg, ${color}, ${color}88)` }}
                            >
                                {colorTheme === id && <Check className="w-4 h-4 text-white absolute inset-0 m-auto" />}
                            </div>
                            <span className="text-[10px] text-muted-foreground">{label}</span>
                        </button>
                    ))}
                    <div className="flex flex-col items-center gap-1.5 cursor-pointer relative">
                        <div
                            className={`w-10 h-10 rounded-xl transition-all duration-200 relative overflow-hidden ${colorTheme.startsWith('#') ? 'ring-2 ring-white ring-offset-2 ring-offset-background scale-110' : ''}`}
                            style={{ background: colorTheme.startsWith('#') ? `linear-gradient(135deg, ${colorTheme}, ${colorTheme}88)` : 'conic-gradient(from 90deg, red, yellow, lime, aqua, blue, magenta, red)' }}
                        >
                            <input type="color" className="absolute inset-0 w-[200%] h-[200%] -top-1/2 -left-1/2 opacity-0 cursor-pointer"
                                value={colorTheme.startsWith('#') ? colorTheme : '#7c3aed'}
                                onChange={(e) => handleColorThemeChange(e.target.value)} />
                            {colorTheme.startsWith('#') && <Check className="w-4 h-4 text-white absolute inset-0 m-auto pointer-events-none" />}
                        </div>
                        <span className="text-[10px] text-muted-foreground">Custom</span>
                    </div>
                </div>
            </div>

            {/* PDF Password */}
            <div className="glass-card p-4 mb-3">
                <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-primary" /> PDF Password
                </p>
                {pdfPassword && (
                    <p className="text-xs text-muted-foreground mb-2">Current: <span className="font-mono">{'•'.repeat(pdfPassword.length)}</span></p>
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
                >Update Password</button>
            </div>

            {/* ── EXPORT ── */}
            <div className="glass-card p-4 mb-3">
                <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Download className="w-4 h-4 text-primary" /> Export via QR
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                    Data is gzip-compressed then AES-256 encrypted before being encoded as QR code(s). No file needed.
                </p>
                <div className="relative mb-3">
                    <input
                        type={showExportPwd ? 'text' : 'password'}
                        value={exportPassword}
                        onChange={e => setExportPassword(e.target.value)}
                        placeholder="Encryption password"
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
                        <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {exportMsg}</>
                    ) : (
                        <><QrCode className="w-4 h-4" /> Generate QR Export</>
                    )}
                </button>

                {/* QR carousel */}
                <AnimatePresence>
                    {qrChunks.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mt-4"
                        >
                            {/* Status pill */}
                            <div className={`text-[11px] text-center mb-2 px-2 py-1 rounded-full ${exportStatus === 'error' ? 'text-red-400 bg-red-500/10' : 'text-green-400 bg-green-500/10'}`}>
                                {exportMsg}
                            </div>

                            {/* QR display */}
                            <div className="flex flex-col items-center gap-3">
                                {/* QR image */}
                                <div className="relative rounded-2xl overflow-hidden p-3"
                                    style={{ background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.08)' }}>
                                    <img
                                        src={qrChunks[qrPage]}
                                        alt={`QR ${qrPage + 1} of ${totalChunks}`}
                                        className="w-64 h-64 rounded-xl"
                                    />
                                    {/* Chunk badge */}
                                    {totalChunks > 1 && (
                                        <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                                            {qrPage + 1}/{totalChunks}
                                        </div>
                                    )}
                                </div>

                                {/* Pagination controls */}
                                {totalChunks > 1 && (
                                    <div className="flex items-center gap-4">
                                        <button
                                            onClick={() => setQrPage(p => Math.max(0, p - 1))}
                                            disabled={qrPage === 0}
                                            className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center disabled:opacity-30 transition"
                                        ><ChevronLeft className="w-4 h-4" /></button>

                                        <div className="flex gap-1.5">
                                            {qrChunks.map((_, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => setQrPage(i)}
                                                    className={`h-1.5 rounded-full transition-all duration-200 ${i === qrPage ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/40'}`}
                                                />
                                            ))}
                                        </div>

                                        <button
                                            onClick={() => setQrPage(p => Math.min(totalChunks - 1, p + 1))}
                                            disabled={qrPage === totalChunks - 1}
                                            className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center disabled:opacity-30 transition"
                                        ><ChevronRight className="w-4 h-4" /></button>
                                    </div>
                                )}

                                <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
                                    {totalChunks > 1
                                        ? `Scan all ${totalChunks} QR codes in order on the other device`
                                        : 'Scan this QR code on the other device'}
                                    <br />AES-256 encrypted · password required to import
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── IMPORT ── */}
            <div className="glass-card p-4 mb-3">
                <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold flex items-center gap-2">
                        <Upload className="w-4 h-4 text-primary" /> Import via QR
                    </p>
                    {(scannedChunks.length > 0 || importStatus !== 'idle') && (
                        <button onClick={resetImport} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition">
                            <RefreshCw className="w-3 h-3" /> Reset
                        </button>
                    )}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                    Scan the QR code(s) from another device, then enter the password to import.
                </p>

                {/* Progress bar for multi-chunk */}
                {scannedTotal > 1 && (
                    <div className="mb-3">
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                            <span>QR codes scanned</span>
                            <span>{scannedCount}/{scannedTotal}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                            <motion.div
                                className="h-full rounded-full bg-primary"
                                animate={{ width: `${(scannedCount / scannedTotal) * 100}%` }}
                                transition={{ duration: 0.3 }}
                            />
                        </div>
                        {/* Chunk indicators */}
                        <div className="flex gap-1 flex-wrap mt-2">
                            {Array.from({ length: scannedTotal }, (_, i) => {
                                const got = scannedChunks.some(c => c.idx === i + 1)
                                return (
                                    <div
                                        key={i}
                                        className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${got ? 'bg-green-500' : 'bg-secondary'}`}
                                    />
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Single chunk status */}
                {scannedTotal === 1 && scannedCount === 1 && (
                    <div className="flex items-center gap-2 mb-3 text-xs text-green-400">
                        <Check className="w-4 h-4" /> QR captured!
                    </div>
                )}

                {/* Last scan info */}
                {lastScan && (
                    <p className="text-[11px] text-primary mb-2">{lastScan}</p>
                )}

                {/* Camera */}
                <div className="mb-3">
                    {!scannerActive ? (
                        <button
                            onClick={startScanner}
                            disabled={importStatus === 'done' || importStatus === 'loading'}
                            className="w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/80 transition disabled:opacity-40"
                        >
                            <Camera className="w-4 h-4" />
                            {scannedChunks.length > 0 ? `Continue Scanning (${scannedCount} done)` : 'Open Camera to Scan'}
                        </button>
                    ) : (
                        <div className="relative rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                            {/* html5-qrcode mounts here */}
                            <div id="qr-reader" className="w-full" />
                            <button
                                onClick={stopScanner}
                                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center"
                            ><X className="w-4 h-4 text-white" /></button>
                            {importMsg && (
                                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs text-center py-2 px-3">
                                    {importMsg}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Password input — show once we have scanned chunks or are ready */}
                <AnimatePresence>
                    {(scannedChunks.length > 0 && (importStatus === 'ready' || importStatus === 'idle' || importStatus === 'error')) && (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
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
                                disabled={!importPassword || importStatus === 'loading'}
                                className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
                                style={{ background: importPassword ? 'linear-gradient(135deg, #059669, #06b6d4)' : undefined }}
                            >
                                {importStatus === 'loading'
                                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Importing…</>
                                    : <><Download className="w-4 h-4" /> Decrypt & Import</>
                                }
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Import status messages */}
                <AnimatePresence>
                    {importMsg && importStatus !== 'scanning' && !scannerActive && (
                        <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className={`mt-3 p-3 rounded-xl flex items-center gap-2 text-xs ${importStatus === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-400' : importStatus === 'done' ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-primary/10 border border-primary/20 text-primary'}`}
                        >
                            {importStatus === 'error' ? <AlertCircle className="w-4 h-4 flex-shrink-0" /> : <Check className="w-4 h-4 flex-shrink-0" />}
                            {importMsg}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* App info */}
            <div className="mt-6 text-center">
                <p className="text-xs text-muted-foreground">ExpenseIQ v1.0.0</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">All data stored locally · exported via compressed QR</p>
            </div>
        </motion.div>
    )
}
