// Netlify Function: spm
// Obsługuje dwa endpointy z frontu:
//  - { action: "upload", fileBase64, mimeType, fileName }  -> upload na Google Drive
//  - { action: "meta",   meta }                             -> dopis metadanych do Google Sheets (opcjonalnie)

const { google } = require('googleapis');

const SERVICE_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;   // CAŁY JSON klucza konta serwisowego
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;            // ID folderu na Drive
const SHEETS_ID = process.env.SHEETS_ID || '';                  // (opcjonalnie) ID Arkusza
const SHEET_NAME = process.env.SHEET_NAME || 'Wysylki';         // (opcjonalnie) nazwa arkusza

// ====== AUTH ======
function getAuth() {
  if (!SERVICE_JSON) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON env');
  const creds = JSON.parse(SERVICE_JSON);
  const scopes = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets'
  ];
  return new google.auth.JWT(
    creds.client_email,
    null,
    creds.private_key,
    scopes
  );
}

// ====== Utils ======
function ok(res, data) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify({ ok: true, ...data }));
}
function err(res, message, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify({ ok: false, error: message }));
}

exports.handler = async (event, context) => {
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
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: false, error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const action = body.action;

    // ====== UPLOAD ======
    if (action === 'upload') {
      const { fileBase64, mimeType, fileName } = body;
      if (!fileBase64 || !mimeType || !fileName) {
        return err({ setHeader(){}, end(){} }, 'Missing upload fields');
      }
      if (!DRIVE_FOLDER_ID) throw new Error('Missing DRIVE_FOLDER_ID env');

      const auth = getAuth();
      const drive = google.drive({ version: 'v3', auth });

      // Node Buffer z base64
      const buffer = Buffer.from(fileBase64, 'base64');

      // Upload pojedynczego pliku
      const createRes = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [DRIVE_FOLDER_ID]
        },
        media: {
          mimeType,
          body: require('stream').Readable.from(buffer)
        },
        fields: 'id, webViewLink, webContentLink'
      });

      const fileId = createRes.data.id;
      const viewLink = createRes.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
      const downloadLink = createRes.data.webContentLink || `https://drive.google.com/uc?id=${fileId}&export=download`;

      return ok({ setHeader(){}, end(){} }, { fileId, viewLink, downloadLink });
    }

    // ====== META (opcjonalne – dopis do Sheets) ======
    if (action === 'meta') {
      if (!SHEETS_ID) {
        // jeśli nie skonfigurowano Arkusza – zwróć OK i nic nie rób
        return ok({ setHeader(){}, end(){} }, { note: 'Sheets not configured' });
      }
      const meta = body.meta || {};
      const auth = getAuth();
      const sheets = google.sheets({ version: 'v4', auth });

      // Zrób płaską tablicę wartości – możesz dostosować kolejność kolumn
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

      return ok({ setHeader(){}, end(){} }, { rowAppended: true });
    }

    // ====== nieznana akcja ======
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: false, error: 'Unknown action' })
    };

  } catch (e) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: false, error: e.message || String(e) })
    };
  }
};
