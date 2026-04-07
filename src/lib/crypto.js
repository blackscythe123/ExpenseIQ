/**
 * AES-GCM encryption/decryption with gzip compression for QR code export/import
 * Uses fflate for maximum compression to minimize QR code size.
 */
import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate'

async function getKey(password, salt) {
    const enc = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    )
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: 100000,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    )
}

/**
 * Compress + Encrypt data into a compact Base64 string.
 * Pipeline: JSON → gzip → AES-GCM encrypt → Base64
 */
export async function encryptData(data, password) {
    const jsonStr = JSON.stringify(data)

    // 1. Compress with gzip (level 9 = max compression)
    const compressed = gzipSync(strToU8(jsonStr), { level: 9 })

    // 2. Encrypt
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const key = await getKey(password, salt)
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed)

    // 3. Combine: salt(16) + iv(12) + encrypted data
    const combined = new Uint8Array(16 + 12 + encrypted.byteLength)
    combined.set(salt, 0)
    combined.set(iv, 16)
    combined.set(new Uint8Array(encrypted), 28)

    // 4. Base64 encode
    // Use chunk-based btoa for large buffers
    let binary = ''
    const chunkSize = 8192
    for (let i = 0; i < combined.length; i += chunkSize) {
        binary += String.fromCharCode(...combined.subarray(i, i + chunkSize))
    }
    return btoa(binary)
}

/**
 * Decrypt + Decompress Base64 string back to original data object.
 * Pipeline: Base64 → AES-GCM decrypt → gunzip → JSON
 */
export async function decryptData(encryptedBase64, password) {
    try {
        const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0))
        const salt = combined.slice(0, 16)
        const iv = combined.slice(16, 28)
        const cipherData = combined.slice(28)

        const key = await getKey(password, salt)
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherData)

        // Decompress
        const decompressed = gunzipSync(new Uint8Array(decrypted))
        return JSON.parse(strFromU8(decompressed))
    } catch {
        throw new Error('Decryption failed. Wrong password or corrupted data.')
    }
}

/**
 * Split a base64 string into chunks for multi-QR export.
 * Each chunk contains metadata: "EIQ:{chunkIndex}/{totalChunks}:{data}"
 * Max QR V40 with binary encoding ~2953 bytes, but we use alphanumeric-safe base64
 * so we cap at ~1200 chars per chunk to ensure reliable scanning.
 */
export function splitIntoChunks(base64Str, chunkSize = 1200) {
    const chunks = []
    for (let i = 0; i < base64Str.length; i += chunkSize) {
        chunks.push(base64Str.slice(i, i + chunkSize))
    }
    const total = chunks.length
    return chunks.map((data, idx) => `EIQ:${idx + 1}/${total}:${data}`)
}

/**
 * Reassemble chunks back into the original base64 string.
 * Expects array of chunk strings in "EIQ:{index}/{total}:{data}" format.
 * Returns null if chunks are incomplete.
 */
export function reassembleChunks(chunkStrings) {
    if (!chunkStrings.length) return null

    const parsed = []
    let total = null

    for (const chunk of chunkStrings) {
        const match = chunk.match(/^EIQ:(\d+)\/(\d+):(.+)$/)
        if (!match) return null
        const idx = parseInt(match[1])
        const tot = parseInt(match[2])
        const data = match[3]
        if (total === null) total = tot
        else if (total !== tot) return null // mismatched chunks
        parsed.push({ idx, data })
    }

    if (parsed.length !== total) return null

    // Sort by index and join
    parsed.sort((a, b) => a.idx - b.idx)
    // Verify sequence is complete
    for (let i = 0; i < parsed.length; i++) {
        if (parsed[i].idx !== i + 1) return null
    }

    return parsed.map(p => p.data).join('')
}
