// netlify/functions/spm.js
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxwbyRevKGFLGqtj47vAUP9Zxh7YrDfiYQarTpeygdBAXqRqccbaj7ehSPQRGipMylx/exec'; // <--- WSTAW swój /exec

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok:false, error:'Method not allowed' }) };
  }

  try {
    const upstream = await fetch(WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Apps Script doPost(e)
      body: event.body || '{}'
    });

    // spróbuj JSON; jeśli Google odda HTML — zawijamy w JSON, by front się nie wywalił
    try {
      const data = await upstream.json();
      return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
    } catch {
      const raw = await upstream.text();
      return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok:false, error:'Apps Script returned non-JSON', upstreamStatus: upstream.status, raw: raw.slice(0,1200) }) };
    }
  } catch (err) {
    return { statusCode: 502, headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok:false, error:'Fetch to Apps Script failed', detail: String(err) }) };
  }
};
