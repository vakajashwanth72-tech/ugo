import Constants from 'expo-constants';

const extra = (Constants.expoConfig as any)?.extra || {};
const BASE_N8N_URL = (
  process.env.EXPO_PUBLIC_N8N_BASE_URL ||
  extra.n8nBaseUrl ||
  'https://ugonitk.app.n8n.cloud/webhook'
).replace(/\/(?=$)/, '');

/**
 * Type-safe helper for all n8n webhook calls
 */
export async function callN8nWebhook<T = any>(endpoint: string, payload: any): Promise<T> {
  const cleanEndpoint = endpoint.replace(/^\//, '');
  const url = `${BASE_N8N_URL}/${cleanEndpoint}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      const errMsg =
        typeof data === 'object' && data?.message
          ? data.message
          : `Request to ${cleanEndpoint} failed (${response.status})`;
      throw new Error(errMsg);
    }

    return data as T;
  } catch (err: any) {
    console.error(`n8n webhook error [${endpoint}]:`, err);
    throw err;
  }
}
