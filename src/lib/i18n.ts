// Internationalization (Phase 4): i18next with English + Spanish.
// Scope v1: the safety-critical surfaces — lock screen, panic PIN gate,
// watcher emergency/ack/safe strings, and session quick signals. Spanish
// strings are written for clarity under stress: short, plain, unambiguous.
// Coverage expands screen-by-screen; untranslated keys fall back to English.

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const en = {
  lock: {
    enterPin: "Enter PIN to continue",
    unlock: "Unlock",
    wrongPin: "Wrong PIN",
    passkey: "🖐 Unlock with fingerprint / Face ID",
    passkeyFail: "Passkey didn't verify — PIN still works.",
  },
  pinlock: {
    title: "Alarm locked",
    sub: "This panic alarm can only be silenced with your PIN — the one you set in Settings.",
    enter: "Enter PIN — silence alarm",
    keep: "Keep it sounding",
    wrong: "Wrong PIN — alarm keeps sounding",
    passkey: "🖐 Silence with fingerprint / Face ID",
    passkeyFail: "Passkey didn't verify — alarm keeps sounding",
  },
  watch: {
    emergency: "Emergency signal active",
    emergencyHint: "If you can't reach them, consider contacting local emergency services with the location below.",
    letHerKnow: "Let her know a human is responding",
    ackSeen: "👁 I see it",
    ackWay: "🚗 On my way",
    ackHelp: "📞 Called help",
    ackedSeen: "👁 You acknowledged the alert.",
    ackedWay: "🚗 You told her you're on your way.",
    ackedHelp: "📞 You told her help has been called.",
    safe: "She's Safe ✅",
    checkedOut: "Checked out",
    safeThanks: "You can close this page — thank you for watching over her.",
    yourName: "Your name (she'll see who's watching & responding)",
  },
  session: {
    watchingNow: "Watching now",
    quickSignals: "Quick signals — tap to send your circle a coded message",
    imOk: "I'm OK",
    callMe: "Call me",
    comeGetMe: "Come get me",
    needToTalk: "Need to talk",
  },
};

const es: typeof en = {
  lock: {
    enterPin: "Ingresa tu PIN para continuar",
    unlock: "Desbloquear",
    wrongPin: "PIN incorrecto",
    passkey: "🖐 Desbloquear con huella / Face ID",
    passkeyFail: "La clave de acceso no se verificó — el PIN sigue funcionando.",
  },
  pinlock: {
    title: "Alarma bloqueada",
    sub: "Esta alarma de pánico solo se puede silenciar con tu PIN — el que configuraste en Ajustes.",
    enter: "Ingresar PIN — silenciar alarma",
    keep: "Dejar que siga sonando",
    wrong: "PIN incorrecto — la alarma sigue sonando",
    passkey: "🖐 Silenciar con huella / Face ID",
    passkeyFail: "La clave de acceso no se verificó — la alarma sigue sonando",
  },
  watch: {
    emergency: "Señal de emergencia activa",
    emergencyHint: "Si no puedes contactarla, considera llamar a los servicios de emergencia locales con la ubicación de abajo.",
    letHerKnow: "Avísale que una persona está respondiendo",
    ackSeen: "👁 Lo vi",
    ackWay: "🚗 Voy en camino",
    ackHelp: "📞 Ya pedí ayuda",
    ackedSeen: "👁 Confirmaste la alerta.",
    ackedWay: "🚗 Le avisaste que vas en camino.",
    ackedHelp: "📞 Le avisaste que ya pediste ayuda.",
    safe: "Está a salvo ✅",
    checkedOut: "Salió y está bien",
    safeThanks: "Ya puedes cerrar esta página — gracias por cuidarla.",
    yourName: "Tu nombre (ella verá quién está mirando y respondiendo)",
  },
  session: {
    watchingNow: "Mirando ahora",
    quickSignals: "Señales rápidas — toca para enviar un mensaje en clave a tu círculo",
    imOk: "Estoy bien",
    callMe: "Llámame",
    comeGetMe: "Ven por mí",
    needToTalk: "Necesito hablar",
  },
};

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
export type AppLanguage = "en" | "es";
