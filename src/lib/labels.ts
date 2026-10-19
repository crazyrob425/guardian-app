// Discreet-mode label dictionary. With discreet mode ON the app never shows
// provider-specific wording anywhere on screen.

export interface Labels {
  date: string; Date: string;
  client: string; Client: string;
  panic: string; Panic: string;
  appointmentNoun: string;
}

export function getLabels(discreet: boolean): Labels {
  if (!discreet) {
    return { date: "date", Date: "Date", client: "client", Client: "Client", panic: "panic", Panic: "Panic", appointmentNoun: "date" };
  }
  return { date: "appointment", Date: "Appointment", client: "guest", Client: "Guest", panic: "alert", Panic: "Alert", appointmentNoun: "appointment" };
}
