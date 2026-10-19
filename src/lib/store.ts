// Device-local persistent store (localStorage). Nothing leaves the device
// except what the user explicitly shares (encrypted session sync, SMS, payments).

export interface CircleMember {
  id: string;
  name: string;
  phone: string; // E.164, for SMS alerts
}

export interface Settings {
  displayName: string;
  pinHash: string; // sha256, "" = no lock
  duressPinHash: string; // "" = disabled
  discreetMode: boolean;
  mqttBroker: string; // wss:// URL
  twilioWorkerUrl: string; // Cloudflare Worker relay (see worker/sms-relay.js); "" = demo mode
  twilioFrom: string;
  btcpayUrl: string; // e.g. https://pay.example.com
  btcpayApiKey: string;
  btcpayStoreId: string;
  stripePaymentLink: string; // fixed Stripe payment link (dashboard-created)
  defaultCurrency: string;
  checkOutGraceMin: number;
  arrivalRadiusM: number;
}

export interface ActiveSession {
  id: string;
  keyB64: string; // session AES key (also embedded in share links)
  alias: string; // discreet label for the date, device-local only
  startedAt: number;
  expectedMin: number;
  incall: { lat: number; lng: number } | null;
  state: "active" | "panic" | "done";
}

const K = {
  settings: "guardian.settings.v1",
  circle: "guardian.circle.v1",
  session: "guardian.session.v1",
};

export const DEFAULT_SETTINGS: Settings = {
  displayName: "",
  pinHash: "",
  duressPinHash: "",
  discreetMode: true,
  mqttBroker: "wss://broker.emqx.io:8084/mqtt",
  twilioWorkerUrl: "",
  twilioFrom: "",
  btcpayUrl: "",
  btcpayApiKey: "",
  btcpayStoreId: "",
  stripePaymentLink: "",
  defaultCurrency: "USD",
  checkOutGraceMin: 5,
  arrivalRadiusM: 150,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export const store = {
  getSettings(): Settings {
    return read<Settings>(K.settings, DEFAULT_SETTINGS);
  },
  saveSettings(s: Settings) {
    write(K.settings, s);
  },
  getCircle(): CircleMember[] {
    try {
      return JSON.parse(localStorage.getItem(K.circle) || "[]");
    } catch {
      return [];
    }
  },
  saveCircle(c: CircleMember[]) {
    write(K.circle, c);
  },
  getSession(): ActiveSession | null {
    try {
      const raw = localStorage.getItem(K.session);
      return raw ? (JSON.parse(raw) as ActiveSession) : null;
    } catch {
      return null;
    }
  },
  saveSession(s: ActiveSession | null) {
    if (s) write(K.session, s);
    else localStorage.removeItem(K.session);
  },
};
