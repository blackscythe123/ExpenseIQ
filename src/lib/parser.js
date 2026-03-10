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
    const [dd, mm, yyyy] = s.trim().split('-');
    if (!yyyy || yyyy.length !== 4) return null;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function extractUpiId(desc) {
    const m = desc.match(/UPI\/[^/]+\/[^/]+\/UPI\/([^/\s,]+)/i);
    if (m) return m[1].toLowerCase().replace(/\/$/, '');
    const imps = desc.match(/IMPS\/P2A\/[^/]+\/([^/\s]+)/i);
    if (imps) return `imps:${imps[1].trim().slice(0, 30)}`;
    const neft = desc.match(/NEFT[-/]([A-Z0-9]+)[-/](.+)/i);
    if (neft) return `neft:${neft[2].trim().slice(0, 30)}`;
    if (/upilite|load\/lite/i.test(desc)) return 'upi:lite';
    if (/int\.pd|interest/i.test(desc)) return 'bank:interest';
    const any = desc.match(/([a-z0-9._\-]+@[a-z]+)/i);
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

// ── Row grouping logic ─────────────────────────────────────────────────────────
function extractRows(lines) {

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

// ── MAIN PARSER ────────────────────────────────────────────────────────────────
export async function parsePdf(file, password = '') {

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, password: password || '' }).promise;

    let textLines = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {

        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();

        // ✅ CRITICAL: Use the NATIVE document stream order — NO sorting.
        // The user's strategy is correct: pdf.js provides items in correct
        // reading order for this Bank of Baroda PDF natively. Any attempt to
        // sort by Y/X coordinates breaks the order for multi-column rows.
        content.items.forEach(item => {
            if (item.str && item.str.trim() !== "") {
                textLines.push(item.str.trim());
            }
        });
    }

    // ── Filter Page noise tokens ──────────────────────────────────────────────
    // pdf.js injects page footer/header tokens into some transactions' text stream
    // at every page boundary. These tokens corrupt rows at the page boundary.
    // Strategy: join all tokens with spaces into one big string, strip footer
    // sentences, then split back into individual tokens.
    let joinedText = textLines.join(' ');

    // Strip all known footer/header blocks (global, case-insensitive)
    joinedText = joinedText
        // "This is a computer-generated statement hence does not require signature."
        .replace(/This\s+is\s+a\s+computer[- ]generated\s+statement\s+hence\s+does\s+not\s+require\s+signature\./gi, '')
        // "Statement is generated on DD/MM/YYYY HH:MM:SS AM/PM (through bob World mobile app)"
        .replace(/Statement\s+is\s+generated\s+on\s+[\d/]+\s+[\d:]+\s+[AP]M\s+\(through\s+bob\s+World\s+mobile\s+app\)/gi, '')
        // "from the system maintained in the bank containing transactions carried out in normal course of business."
        .replace(/from\s+the\s+system\s+maintained\s+in\s+the\s+bank\s+containing\s+transactions\s+carried\s+out\s+in\s+normal\s+course\s+of\s+business\./gi, '')
        // "Note: In case you find any discrepancy, we advise you to take up with your base branch or raise a complaint using bob World."
        .replace(/Note:\s+In\s+case\s+you\s+find\s+any\s+discrepancy[^.]+\./gi, '')
        // "Page N of M"
        .replace(/Page\s+\d+\s+of\s+\d+/gi, '')
        // "Account Statement from DD-MM-YYYY to DD-MM-YYYY"
        .replace(/Account\s+Statement\s+from\s+\d{2}-\d{2}-\d{4}\s+to\s+\d{2}-\d{2}-\d{4}/gi, '')
        // Table column headers: "Serial No Transaction Date Value Date Description Cheque Number Debit Credit Balance"
        .replace(/Serial\s+No\s+Transaction\s+Date\s+Value\s+Date\s+Description\s+Cheque\s+Number\s+Debit\s+Credit\s+Balance/gi, '');

    textLines = joinedText.split(/\s+/).filter(s => s.length > 0);

    const rows = extractRows(textLines);

    console.log("Total Raw Rows grouped by Serial:", rows.length);

    const transactions = [];
    const seen = new Set();
    let skippedCount = 0;
    let openingBalance = 0;  // will be set from row 1 (Opening Balance row)

    for (let i = 0; i < rows.length; i++) {

        const rowStr = rows[i];
        const parts = rowStr.split(/\s+/);

        if (parts.length < 5) continue;

        const serial = parts[0];
        const txDateStr = parts[1];

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

            skippedCount++;
            continue;

        }

        const txDate = parseDate(txDateStr);

        if (!txDate) {
            skippedCount++;
            continue;
        }

        let valDate = null;

        if (/^\d{2}-\d{2}-\d{4}$/.test(parts[2])) {
            valDate = parts[2];
            parts.splice(2, 1);
        }

        parts.splice(0, 2);

        const description = parts.join(' ').trim();

        const debitAmt = parseAmount(debitStr);
        const creditAmt = parseAmount(creditStr);
        const balanceAmt = parseAmount(balanceStr);  // actual running balance from PDF

        if (debitAmt === 0 && creditAmt === 0) {
            // This is the Opening Balance row — capture its balance value
            openingBalance = balanceAmt;
            skippedCount++;
            continue;
        }

        const type = debitAmt > 0 ? 'debit' : 'credit';
        const amount = debitAmt > 0 ? debitAmt : creditAmt;

        const upiId = extractUpiId(description);

        const id = await makeId(txDate, description, amount, type);

        if (seen.has(id)) {
            skippedCount++;
            continue;
        }

        seen.add(id);

        transactions.push({
            id,
            date: txDate,
            description: description.substring(0, 150),
            upiId,
            amount,
            type,
            balance: balanceAmt,  // ← store actual PDF balance column
            category: detectCategory(upiId, description),
            createdAt: new Date(Date.now() + i).toISOString()  // +i ensures strict PDF order
        });
    }

    console.log("=== FINAL PARSER RESULT ===");
    console.log(`Successfully parsed: ${transactions.length}`);
    console.log(`Opening balance: ${openingBalance}`);
    console.log(`Skipped rows: ${skippedCount}`);

    return { transactions, openingBalance };
}

// ── DATE RANGE FILTER ──────────────────────────────────────────────────────────
export function getDateRange(filter, customStart, customEnd) {

    const now = new Date(), end = new Date(now);

    switch (filter) {
        case '12h': return { start: new Date(now.getTime() - 12 * 3600000), end };
        case '24h': return { start: new Date(now.getTime() - 24 * 3600000), end };
        case '48h': return { start: new Date(now.getTime() - 48 * 3600000), end };
        case '7d': return { start: new Date(now.getTime() - 7 * 86400000), end };
        case '1m': return { start: new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()), end };
        case 'custom': return { start: new Date(customStart), end: new Date(customEnd) };
        default: return { start: new Date(0), end };
    }

}