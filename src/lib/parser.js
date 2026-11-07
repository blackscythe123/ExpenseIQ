import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// ── helpers ────────────────────────────────────────────────────────────────────
function parseAmount(s) {
    if (!s || s.trim() === '-') return 0;
    return parseFloat(s.replace(/,/g, '').trim()) || 0;
}

function parseDate(s) {
    if (!s) return null;
    const trimmed = s.trim();
    const dmy = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (dmy) {
        return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    }
    const monMap = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    const monMatch = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
    if (monMatch) {
        const dd = monMatch[1].padStart(2, '0');
        const mm = monMap[monMatch[2].toLowerCase()];
        const yyyy = monMatch[3];
        if (mm) return `${yyyy}-${mm}-${dd}`;
    }
    return null;
}

function extractUpiId(desc) {
    if (!desc) return 'other:unknown';
    const cleanDesc = desc.replace(/\s*\/\s*/g, '/');
    const m = cleanDesc.match(/UPI\/[^/]+\/[^/]+\/UPI\/([^/\s,]+)/i);
    if (m) return m[1].toLowerCase().replace(/\/$/, '');
    const imps = cleanDesc.match(/IMPS\/(?:P\s*2\s*A|P2A)\/[^/]+\/([^/\s]+)/i);
    if (imps) return `imps:${imps[1].trim().slice(0, 30).toLowerCase()}`;
    const neft = cleanDesc.match(/NEFT[-/]([A-Z0-9]+)[-/](.+)/i);
    if (neft) return `neft:${neft[2].trim().slice(0, 30).toLowerCase()}`;
    if (/upilite|load\/lite/i.test(cleanDesc)) return 'upi:lite';
    if (/int\.pd|interest/i.test(cleanDesc)) return 'bank:interest';
    const any = cleanDesc.match(/([a-z0-9._-]+@[a-z]+)/i);
    if (any) return any[1].toLowerCase();
    return 'other:unknown';
}

function detectCategory(uid, desc) {
    const s = (uid + ' ' + desc).toLowerCase();
    if (/swiggy|zomato/.test(s)) return 'Food';
    if (/flipkart|amazon|meesho/.test(s)) return 'Shopping';
    if (/redbus|irctc|uber|ola/.test(s)) return 'Travel';
    if (/goog|google/.test(s)) return 'Google';
    if (/airtel|jio|vodafone|bsnl/.test(s)) return 'Recharge';
    if (/paytm|ptys|ptyb/.test(s)) return 'Paytm';
    if (/sbipmopad|emi|loan|equit/.test(s)) return 'Loan/EMI';
    if (/auragoldin|cfp@cash/.test(s)) return 'Gold';
    if (/simiyonvinscent|simiyon/.test(s)) return 'Self Transfer';
    if (/milaap/.test(s)) return 'Donation';
    if (/iitmadras|ssn|university|school|rzp@axis/.test(s)) return 'Education';
    if (/pinelabs|pos/.test(s)) return 'POS';
    if (/vyapar/.test(s)) return 'Business';
    if (/cavinkar|bigbasket/.test(s)) return 'Groceries';
    if (/bharatpe|phonepe|supercard/.test(s)) return 'Payments';
    if (/int\.pd|interest/.test(s)) return 'Interest';
    if (/neft:|imps:/.test(uid)) return 'Bank Transfer';
    return 'Others';
}

async function makeId(date, desc, amount, type) {
    const raw = `${date}|${desc.substring(0, 100).trim().toLowerCase()}|${amount.toFixed(2)}|${type}`;
    if (crypto?.subtle) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
    }
    let h = 0;
    for (const c of raw) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
    return Math.abs(h).toString(16).padStart(8, '0');
}

// ── Legacy row extraction for old Bob World format ────────────────────────────
function extractRowsOld(lines) {
    const rows = [];
    let current = "";

    for (let i = 0; i < lines.length; i++) {
        const word = lines[i];

        const isSerial = /^\d+$/.test(word);
        const nextIsDate =
            i + 1 < lines.length &&
            /^\d{2}-\d{2}-\d{4}$/.test(lines[i + 1]);

        if (isSerial && nextIsDate) {
            if (current !== "") rows.push(current);
            current = word + " " + lines[i + 1];
            i++;
        } else {
            if (current !== "") {
                current += " " + word;
            }
        }
    }

    if (current !== "") rows.push(current);
    return rows;
}

// ── PARSER IMPLEMENTATIONS ───────────────────────────────────────────────────

async function parseNewFormat(pdf) {
    let fullText = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        for (const item of content.items) {
            fullText += item.str;
            if (item.hasEOL) fullText += ' ';
        }
        fullText += ' ';
    }

    // Strip header and footer noise
    let text = fullText
        .replace(/This\s+is\s+a\s+computer[- ]generated\s+statement\s+hence\s+does\s+not\s+require\s+signature\./gi, '')
        .replace(/Statement\s+is\s+generated\s+on\s+[\d/]+\s+[\d:]+\s+[AP]M\s+\(through\s+bob\s+World\s+mobile\s+app\)/gi, '')
        .replace(/from\s+the\s+system\s+maintained\s+in\s+the\s+bank\s+containing\s+transactions\s+carried\s+out\s+in\s+normal\s+course\s+of\s+business\./gi, '')
        .replace(/Note:\s+In\s+case\s+you\s+find\s+any\s+discrepancy[^.]+\./gi, '')
        .replace(/Page\s+\d+\s+of\s+\d+/gi, '')
        .replace(/Account\s+statement\s+from\s+[\d\s-]+to\s+[\d\s-]+/gi, '')
        .replace(/Sr\s+no\s+Transaction\s+date\s+Value\s+date\s+Description\s+Cheque\s+number\s+Debit\s+Credit\s+Balance/gi, '')
        .replace(/Account Details[\s\S]*?Customer Account Details/gi, '');

    // Normalize comma and dot separation in numbers (e.g. "25, 143.44" or "27. 15")
    text = text.replace(/(\d+),\s+(\d+)/g, '$1,$2');
    text = text.replace(/(\d+)\.\s+(\d+)/g, '$1.$2');

    const monthRe = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
    const rowStartRegex = new RegExp('(^|\\s)(\\d+)\\s+(\\d{2}\\s+' + monthRe + '\\s+\\d{4})\\s+(\\d{2}\\s+' + monthRe + '\\s+\\d{4})\\s+', 'g');
    
    const matches = [...text.matchAll(rowStartRegex)];
    const transactions = [];
    let openingBalance = 0;
    const seen = new Set();

    for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        const nextM = matches[i + 1];
        const startIdx = m.index + m[1].length;
        const endIdx = nextM ? nextM.index + nextM[1].length : text.length;
        const rowStr = text.substring(startIdx, endIdx).trim();

        const txDateStr = m[3];
        const txDate = parseDate(txDateStr);
        if (!txDate) continue;

        const prefixLen = m[0].trim().length;
        const remainder = rowStr.substring(prefixLen).trim();

        const endRegex = /([0-9,]+\.\d{2}|-)\s+([0-9,]+\.\d{2}|-)\s+([0-9,]+\.\d{2})\s*(CR|DR)?$/i;
        const endMatch = remainder.match(endRegex);
        if (!endMatch) continue;

        const debitStr = endMatch[1];
        const creditStr = endMatch[2];
        const balanceStr = endMatch[3];

        const description = remainder.substring(0, endMatch.index).trim();
        const debitAmt = parseAmount(debitStr);
        const creditAmt = parseAmount(creditStr);
        const balanceAmt = parseAmount(balanceStr);

        if (i === 0) {
            // Infer opening balance from the very first transaction:
            openingBalance = Math.round((balanceAmt + debitAmt - creditAmt) * 100) / 100;
        }

        const type = debitAmt > 0 ? 'debit' : 'credit';
        const amount = debitAmt > 0 ? debitAmt : creditAmt;
        const upiId = extractUpiId(description);

        const id = await makeId(txDate, description, amount, type);
        if (seen.has(id)) continue;
        seen.add(id);

        transactions.push({
            id,
            date: txDate,
            description: description.substring(0, 150),
            upiId,
            amount,
            type,
            balance: balanceAmt,
            category: detectCategory(upiId, description),
            createdAt: new Date(Date.now() + i).toISOString()
        });
    }

    return { transactions, openingBalance };
}

async function parseOldFormat(pdf) {
    let textLines = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        content.items.forEach(item => {
            if (item.str && item.str.trim() !== "") {
                textLines.push(item.str.trim());
            }
        });
    }

    let joinedText = textLines.join(' ');
    joinedText = joinedText
        .replace(/This\s+is\s+a\s+computer[- ]generated\s+statement\s+hence\s+does\s+not\s+require\s+signature\./gi, '')
        .replace(/Statement\s+is\s+generated\s+on\s+[\d/]+\s+[\d:]+\s+[AP]M\s+\(through\s+bob\s+World\s+mobile\s+app\)/gi, '')
        .replace(/from\s+the\s+system\s+maintained\s+in\s+the\s+bank\s+containing\s+transactions\s+carried\s+out\s+in\s+normal\s+course\s+of\s+business\./gi, '')
        .replace(/Note:\s+In\s+case\s+you\s+find\s+any\s+discrepancy[^.]+\./gi, '')
        .replace(/Page\s+\d+\s+of\s+\d+/gi, '')
        .replace(/Account\s+Statement\s+from\s+\d{2}-\d{2}-\d{4}\s+to\s+\d{2}-\d{2}-\d{4}/gi, '')
        .replace(/Serial\s+No\s+Transaction\s+Date\s+Value\s+Date\s+Description\s+Cheque\s+Number\s+Debit\s+Credit\s+Balance/gi, '');

    textLines = joinedText.split(/\s+/).filter(s => s.length > 0);
    const rows = extractRowsOld(textLines);

    const transactions = [];
    const seen = new Set();
    let openingBalance = 0;

    for (let i = 0; i < rows.length; i++) {
        const rowStr = rows[i];
        const parts = rowStr.split(/\s+/);
        if (parts.length < 5) continue;

        const isAmt = (s) => s === '-' || /^[\d,]+\.\d{2}$/.test(s);
        let debitStr = null, creditStr = null, balanceStr = null;
        const len = parts.length;

        if (len >= 6 && isAmt(parts[len - 1]) && isAmt(parts[len - 2]) && isAmt(parts[len - 3])) {
            balanceStr = parts.pop();
            creditStr = parts.pop();
            debitStr = parts.pop();
        } else if (len >= 5 && isAmt(parts[len - 1]) && isAmt(parts[len - 2])) {
            creditStr = parts.pop();
            debitStr = parts.pop();
        } else {
            continue;
        }

        const txDate = parseDate(parts[1]);
        if (!txDate) continue;

        if (/^\d{2}-\d{2}-\d{4}$/.test(parts[2])) {
            parts.splice(2, 1);
        }
        parts.splice(0, 2);

        const description = parts.join(' ').trim();
        const debitAmt = parseAmount(debitStr);
        const creditAmt = parseAmount(creditStr);
        const balanceAmt = parseAmount(balanceStr);

        if (debitAmt === 0 && creditAmt === 0) {
            openingBalance = balanceAmt;
            continue;
        }

        const type = debitAmt > 0 ? 'debit' : 'credit';
        const amount = debitAmt > 0 ? debitAmt : creditAmt;
        const upiId = extractUpiId(description);

        const id = await makeId(txDate, description, amount, type);
        if (seen.has(id)) continue;
        seen.add(id);

        transactions.push({
            id,
            date: txDate,
            description: description.substring(0, 150),
            upiId,
            amount,
            type,
            balance: balanceAmt,
            category: detectCategory(upiId, description),
            createdAt: new Date(Date.now() + i).toISOString()
        });
    }

    return { transactions, openingBalance };
}

// ── MAIN PARSER ────────────────────────────────────────────────────────────────
export async function parsePdf(file, password = '') {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, password: password || '' }).promise;

    // Inspect page 1 to auto-detect format
    const page1 = await pdf.getPage(1);
    const content1 = await page1.getTextContent();
    const rawTokens1 = content1.items.map(it => it.str).join(' ');

    const isNewFormat = /Sr\s*no/i.test(rawTokens1) || /\b\d{2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\b/i.test(rawTokens1);

    if (isNewFormat) {
        return parseNewFormat(pdf);
    } else {
        return parseOldFormat(pdf);
    }
}

export function getDateRange(filter, customStart, customEnd) {
    const now = new Date();
    // Midnight of current local day
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // End of current local day
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    switch (filter) {
        case '12h': 
            // Representing "Today" since time is not available
            return { start: today, end };
        case '24h': 
            // Representing "Since Yesterday" 
            return { start: new Date(today.getTime() - 86400000), end };
        case '48h': 
            return { start: new Date(today.getTime() - 2 * 86400000), end };
        case '7d': 
            // Last 7 days including today means Today - 6 days
            return { start: new Date(today.getTime() - 6 * 86400000), end };
        case '1m': 
            return { start: new Date(today.getFullYear(), today.getMonth() - 1, today.getDate()), end };
        case 'custom': {
            let sDate = new Date(0);
            let eDate = end;
            if (customStart) {
                const [sY, sM, sD] = customStart.split('-');
                if (sY && sM && sD) sDate = new Date(sY, sM - 1, sD, 0, 0, 0);
            }
            if (customEnd) {
                const [eY, eM, eD] = customEnd.split('-');
                if (eY && eM && eD) eDate = new Date(eY, eM - 1, eD, 23, 59, 59, 999);
            }
            return { start: sDate, end: eDate };
        }
        default: 
            return { start: new Date(0), end };
    }
}
