import { describe, it, expect } from "vitest";
import { PERSONAS, getPersona, classifyIntent } from "../personas";

describe("personas", () => {
  it("ships 5 default personas with complete scripts", () => {
    expect(PERSONAS).toHaveLength(5);
    for (const p of PERSONAS) {
      expect(p.opening.length).toBeGreaterThan(0);
      expect(p.closing.length).toBeGreaterThan(0);
      for (const k of ["agree", "distress", "stall", "question", "goodbye", "other"] as const) {
        expect(p.replies[k].length).toBeGreaterThan(0);
      }
    }
  });
  it("falls back to Mom for unknown ids", () => {
    expect(getPersona("nope").id).toBe("mom");
  });
});

describe("classifyIntent", () => {
  it("routes the exit lines", () => {
    expect(classifyIntent("Okay, I'm coming right now")).toBe("agree");
    expect(classifyIntent("Give me five minutes")).toBe("stall");
    expect(classifyIntent("What happened? Where are you?")).toBe("question");
    expect(classifyIntent("I have to go, bye")).toBe("goodbye");
  });
  it("distress beats small talk", () => {
    expect(classifyIntent("He won't let me leave, I'm scared")).toBe("distress");
  });
  it("unknown speech is 'other'", () => {
    expect(classifyIntent("la la la")).toBe("other");
  });
});
