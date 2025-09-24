// Netlify Function: spm
// Endpoints (POST JSON):
//  - { action: "upload", fileBase64, mimeType, fileName }  -> upload na Google Drive (Shared Drive)
//  - { action: "meta",   meta }                             -> dopis w Google Sheets (opcjonalnie)

const { google } = require('googleapis');
const { Readable } = require('stream');

// === Env ===
const SERVICE_JSON     = process.env.GOOGLE_SERVICE_ACCOUNT_JSON; // pełny JSON klucza SA
const DRIVE_FOLDER_ID  = process.env.DRIVE_FOLDER_ID;             // ID folderu (Shared Drive)
const SHEETS_ID        = process.env.SHEETS_ID || '';             // (opcjonalnie) Arkusz
const SHEET_NAME       = process.env.SHEET_NAME || 'Wysylki';     // (opcjonalnie) nazwa arkusza
const MAKE_PUBLIC      = (process.env.MAKE_PUBLIC ?? '1') !== '0';// domyślnie: publikuj (anyone:reader)

// === Auth ===
function getAuth() {
  if (!SERVICE_JSON) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON env');
  const creds = JSON.parse(SERVICE_JSON);

  // Używamy pełnego zakresu Drive (bezpieczniej dla Shared Drive i uprawnień),
  // plus Sheets (opcjonalnie).
  const scopes = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets'
  ];

  return new google.auth.JWT(
    creds.client_email,
    null,
    creds.private_key,
    scopes
  );
}

// === Helpers ===
function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(data)
  };
}
const ok  = (data = {}) => jsonResponse(200, { ok: true,  ...data });
const err = (message)   => jsonResponse(200, { ok: false, error: message });

// === Handler ===
exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return err('Method not allowed');
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const action = body.action;

    // ====== UPLOAD ======
    if (action === 'upload') {
      const { fileBase64, mimeType, fileName } = body;
      if (!fileBase64 || !mimeType || !fileName) return err('Missing upload fields');
      if (!DRIVE_FOLDER_ID) return err('Missing DRIVE_FOLDER_ID env');

      const auth  = getAuth();
      const drive = google.drive({ version: 'v3', auth });

      // Buffer -> strumień
      const buffer = Buffer.from(fileBase64, 'base64');
      const stream = Readable.from(buffer);

      // KLUCZ: supportsAllDrives = true, parent = folder na Shared Drive
      const createRes = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [DRIVE_FOLDER_ID]
        },
        media: {
          mimeType,
          body: stream
        },
        supportsAllDrives: true,
        fields: 'id, name, mimeType, webViewLink, webContentLink'
      });

      const fileId       = createRes.data.id;
      const webViewLink  = createRes.data.webViewLink  || `https://drive.google.com/file/d/${fileId}/view`;
      const downloadLink = createRes.data.webContentLink || `https://drive.google.com/uc?id=${fileId}&export=download`;

      // (Opcjonalnie) ustaw „kto ma link → reader”
      if (MAKE_PUBLIC) {
        try {
          await drive.permissions.create({
            fileId,
            supportsAllDrives: true,
            requestBody: { type: 'anyone', role: 'reader' }
          });
        } catch (e) {
          // Niektóre Shared Drive mają polityki ograniczające udostępnianie — ignorujmy 403/400.
          // Logując na Netlify można to podejrzeć, ale nie blokujemy całego uploadu.
          console.warn('permissions.create failed:', e.message || e);
        }
      }

      return ok({ fileId, viewLink: webViewLink, downloadLink });
    }

    // ====== META (opcjonalne) ======
    if (action === 'meta') {
      if (!SHEETS_ID) return ok({ note: 'Sheets not configured' });

      const meta   = body.meta || {};
      const auth   = getAuth();
      const sheets = google.sheets({ version: 'v4', auth });

      const row = [
        new Date().toISOString(),
        meta.imie || '',
        meta.nazwisko || '',
        meta.email || '',
        meta.miejscowosc || '',
        meta.tytul || '',
        meta.durationMs || '',
        meta.fileName || '',
        meta.mimeType || '',
        meta.fileId || '',
        meta.viewLink || '',
        meta.downloadLink || '',
        meta.trackUrl || ''
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEETS_ID,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] }
      });

      return ok({ rowAppended: true });
    }

    // ====== Nieznana akcja ======
    return err('Unknown action');

  } catch (e) {
    return err(e.message || String(e));
  }
};
