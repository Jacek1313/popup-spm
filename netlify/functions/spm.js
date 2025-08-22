// netlify/functions/spm.js
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwLhFgHxtQ7Dk0zQBG7YxQrcEb8uJHPw1od7SJ2_lP04QetOvQf0XKd5eBHkm-hmANRng/exec';

exports.handler = async (event) => {
  // CORS (opcjonalnie, ułatwia testy z przeglądarki)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST,OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok:false, error:'Method not allowed' })
    };
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok:false, error:'Bad JSON' })
    };
  }

  try {
    const resp = await fetch(WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    const text = await resp.text();
    // przekaż dalej to, co zwrócił Apps Script
    // (jeśli nie-JSON, zapakujemy w błąd)
    try {
      JSON.parse(text);
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: text
      };
    } catch {
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ ok:false, error:'Apps Script non-JSON', status:resp.status, body:text.slice(0,800) })
      };
    }
  } catch (err) {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok:false, error:String(err) })
    };
  }
};
