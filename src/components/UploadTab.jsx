import { useState, useRef, useEffect } from 'react'
import { Upload, FileText, Lock, CheckCircle, AlertCircle, X, Eye, EyeOff, Trash2 } from 'lucide-react'
import { parsePdf } from '../lib/parser'
import { upsertTransactions, getTransactionCount, getSetting, setSetting, clearTransactions } from '../lib/db'
import { motion, AnimatePresence } from 'framer-motion'

export default function UploadTab({ onDataChange }) {
    const [file, setFile] = useState(null)
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [status, setStatus] = useState('idle') // idle | parsing | success | error
    const [errorMsg, setErrorMsg] = useState('')
    const [txCount, setTxCount] = useState(0)
    const [parsedCount, setParsedCount] = useState(0)
    const [isDragging, setIsDragging] = useState(false)
    const [totalCount, setTotalCount] = useState(0)
    const [hasSavedPassword, setHasSavedPassword] = useState(false)
    const fileRef = useRef()

    useEffect(() => {
        getTransactionCount().then(setTotalCount)
        getSetting('pdfPassword').then(p => {
            if (p) {
                setPassword(p)
                setHasSavedPassword(true)
            }
        })
    }, [])

    const handleDrop = (e) => {
        e.preventDefault()
        setIsDragging(false)
        const dropped = e.dataTransfer.files[0]
        if (dropped?.type === 'application/pdf') setFile(dropped)
    }

    const handleParse = async () => {
        if (!file) return
        setStatus('parsing')
        setErrorMsg('')

        try {
            // Save password for future use
            if (password) {
                await setSetting('pdfPassword', password)
                setHasSavedPassword(true)
            }

            const { transactions, openingBalance } = await parsePdf(file, password)
            if (!transactions.length) {
                setStatus('error')
                setErrorMsg('No transactions found. Check your password or file format.')
                return
            }

            if (openingBalance) {
                await setSetting('openingBalance', openingBalance)
            }

            await upsertTransactions(transactions)
            const newCount = await getTransactionCount()
            setParsedCount(transactions.length)
            setTotalCount(newCount)
            setStatus('success')
            onDataChange()
        } catch (err) {
            setStatus('error')
            if (err.message?.includes('password') || err.message?.includes('encrypted')) {
                setErrorMsg('Wrong password. Please check and try again.')
            } else {
                setErrorMsg(err.message || 'Failed to parse PDF. Please try again.')
            }
        }
    }

    const handleClear = async () => {
        await clearTransactions()
        setTotalCount(0)
        setStatus('idle')
        setFile(null)
        onDataChange()
    }

    const handleClearPassword = async () => {
        await setSetting('pdfPassword', null)
        setPassword('')
        setHasSavedPassword(false)
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="px-4 pb-6"
        >
            {/* Header */}
            <div className="pt-4 pb-4">
                <h2 className="text-xl font-bold gradient-text">Upload Statement</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Import your bank PDF statement</p>
            </div>

            {/* Stats card */}
            {totalCount > 0 && (
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="glass-card p-4 mb-4 flex items-center gap-3"
                >
                    <div className="w-10 h-10 rounded-xl balance-card flex items-center justify-center flex-shrink-0">
                        <CheckCircle className="w-5 h-5 text-green-400" />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-semibold">{totalCount} transactions loaded</p>
                        <p className="text-xs text-muted-foreground">Data is stored in your browser</p>
                    </div>
                    <button
                        onClick={handleClear}
                        className="p-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors"
                        title="Clear all data"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </motion.div>
            )}

            {/* Drop zone */}
            <div
                className={`upload-zone mb-4 ${isDragging ? 'drag-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
            >
                <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={e => setFile(e.target.files[0])}
                />
                {file ? (
                    <div className="flex flex-col items-center gap-2">
                        <FileText className="w-10 h-10 text-primary" />
                        <p className="text-sm font-semibold text-primary">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl balance-card flex items-center justify-center">
                            <Upload className="w-7 h-7 text-primary opacity-80" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold">Tap to upload or drag & drop</p>
                            <p className="text-xs text-muted-foreground mt-1">Bank of Baroda UPI statement (PDF)</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Password field */}
            <div className="glass-card p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                    <Lock className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">PDF Password</span>
                    {hasSavedPassword && (
                        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
                            Saved
                        </span>
                    )}
                </div>
                <div className="relative">
                    <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Enter PDF password (e.g. 9876543210)"
                        className="w-full bg-input border border-border rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                    />
                    <button
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                </div>
                {hasSavedPassword && (
                    <button
                        onClick={handleClearPassword}
                        className="text-xs text-red-400 mt-2 hover:underline flex items-center gap-1"
                    >
                        <X className="w-3 h-3" /> Clear saved password
                    </button>
                )}
                <p className="text-[10px] text-muted-foreground mt-2">
                    Password is saved locally in your browser for future uploads.
                </p>
            </div>

            {/* Status messages */}
            <AnimatePresence>
                {status === 'success' && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="glass-card p-4 mb-4 border-green-500/30 bg-green-500/5"
                    >
                        <div className="flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-green-400">Parsed Successfully!</p>
                                <p className="text-xs text-muted-foreground">{parsedCount} transactions imported</p>
                            </div>
                        </div>
                    </motion.div>
                )}
                {status === 'error' && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="glass-card p-4 mb-4 border-red-500/30 bg-red-500/5"
                    >
                        <div className="flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-red-400">Parse Failed</p>
                                <p className="text-xs text-muted-foreground">{errorMsg}</p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Parse button */}
            <button
                onClick={handleParse}
                disabled={!file || status === 'parsing'}
                className="w-full py-4 rounded-2xl font-bold text-sm transition-all duration-200 relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                    background: !file ? 'hsl(var(--secondary))' : 'var(--grad-primary)',
                    boxShadow: file ? '0 0 30px hsl(var(--primary) / 0.4)' : 'none',
                }}
            >
                {status === 'parsing' ? (
                    <span className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        Parsing PDF...
                    </span>
                ) : (
                    <span className="flex items-center justify-center gap-2">
                        <FileText className="w-4 h-4" />
                        {file ? 'Parse & Import' : 'Select a PDF first'}
                    </span>
                )}
                {file && status !== 'parsing' && (
                    <div className="absolute inset-0 shimmer" />
                )}
            </button>

            {/* Format guide */}
            <div className="glass-card p-4 mt-4">
                <p className="text-xs font-semibold mb-2 text-muted-foreground">Supported Formats</p>
                <div className="flex flex-col gap-1.5">
                    {['Bank of Baroda UPI Statement', 'UPI/IMPS/NEFT transactions', 'Encrypted PDFs (password required)'].map(f => (
                        <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                            {f}
                        </div>
                    ))}
                </div>
            </div>
        </motion.div>
    )
}
