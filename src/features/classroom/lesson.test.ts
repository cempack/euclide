import { describe, expect, it } from "vitest";
import type { Course, CourseClass, ScheduleEntry, SequenceItem } from "../../lib/api";
import {
  currentStep,
  groupOf,
  matiereMatches,
  placeEntry,
  stepAfter,
  subjectHasClass,
  teachingOrder,
} from "./lesson";

const course = (id: number, name: string, matiere: string): Course => ({
  id,
  name,
  matiere,
  emoji: "book",
  color: "",
  description: "",
  created_at: "",
});
const cls = (id: number, course_id: number, class_name: string, last_item_id: number | null = null) =>
  ({
    id,
    course_id,
    class_name,
    last_item_id,
    last_file_id: null,
    progress_updated_at: "",
    notes: "",
  }) as CourseClass;
const entry = (subject: string, course_id: number | null = null) =>
  ({
    id: 1,
    day_of_week: 2,
    start_time: "10:15",
    end_time: "11:15",
    subject,
    room: "",
    course_id,
    source: "pronote",
  }) as ScheduleEntry;

describe("subjectHasClass", () => {
  it("finds the class whatever the spacing and case", () => {
    expect(subjectHasClass("MATHEMATIQUES · 2NDE7", "2NDE7")).toBe(true);
    expect(subjectHasClass("Maths 2nde 7", "2NDE7")).toBe(true);
    expect(subjectHasClass("MATHEMATIQUES · 2NDE7", "2nde 7")).toBe(true);
    expect(subjectHasClass("MATHEMATIQUES · 2NDE7 GR1", "2NDE7")).toBe(true);
  });
  it("does not confuse neighbours", () => {
    expect(subjectHasClass("MATHEMATIQUES · 2NDE10", "2NDE1")).toBe(false);
    expect(subjectHasClass("MATHEMATIQUES · 2NDE7", "2NDE4")).toBe(false);
    expect(subjectHasClass("NSI · TNSI", "")).toBe(false);
  });
});

describe("matiereMatches", () => {
  it("reads Pronote subjects without accents", () => {
    expect(matiereMatches("Mathématiques", "MATHEMATIQUES · 2NDE7")).toBe(true);
    expect(matiereMatches("Mathématiques", "MATHEMATIQUES EXPERTES · TEXP1")).toBe(false);
    expect(matiereMatches("Maths expertes", "MATHEMATIQUES EXPERTES · TEXP1")).toBe(true);
    expect(matiereMatches("NSI", "NUMERIQUE SC.INFORM. · 1G3")).toBe(true);
    expect(matiereMatches("NSI", "NSI · TNSI")).toBe(true);
    expect(matiereMatches("NSI", "MATHEMATIQUES · 2NDE7")).toBe(false);
  });
});

describe("placeEntry", () => {
  const courses = [
    course(1, "Mathématiques", "Mathématiques"),
    course(2, "NSI", "NSI"),
    course(3, "Maths expertes", "Maths expertes"),
  ];
  const classes = [cls(1, 1, "2NDE4"), cls(2, 1, "2NDE7"), cls(3, 2, "TNSI"), cls(4, 3, "TEXP1")];

  it("finds the course and the class of a Pronote lesson", () => {
    const p = placeEntry(entry("MATHEMATIQUES · 2NDE7"), courses, classes);
    expect(p?.course.id).toBe(1);
    expect(p?.courseClass?.class_name).toBe("2NDE7");
    expect(placeEntry(entry("MATHEMATIQUES EXPERTES · TEXP1"), courses, classes)?.course.id).toBe(3);
    expect(placeEntry(entry("NSI · TNSI"), courses, classes)?.course.id).toBe(2);
  });

  it("finds the course of a class not attached yet", () => {
    const p = placeEntry(entry("MATHEMATIQUES · 1SPE3"), courses, classes);
    expect(p?.course.id).toBe(1);
    expect(p?.courseClass).toBeUndefined();
  });

  it("does not put a class in a course of another subject", () => {
    expect(placeEntry(entry("SNT · 2NDE7"), courses, classes)).toBeUndefined();
  });

  it("trusts an entry linked by hand", () => {
    expect(placeEntry(entry("Soutien", 2), courses, classes)?.course.id).toBe(2);
  });
});

describe("steps", () => {
  const items = [1, 2, 3].map((id) => ({
    id,
    sequence_id: 1,
    title: `É${id}`,
    position: id,
    resources: [],
  })) as SequenceItem[];
  it("starts at the first step and follows the marked one", () => {
    expect(currentStep(items)?.id).toBe(1);
    expect(currentStep(items, cls(1, 1, "2NDE7", 2))?.id).toBe(2);
    expect(currentStep([], cls(1, 1, "2NDE7", 2))).toBeUndefined();
    expect(stepAfter(items, 2)?.id).toBe(3);
    expect(stepAfter(items, 3)).toBeUndefined();
  });
  it("reads the class out of a subject", () => {
    expect(groupOf("MATHEMATIQUES · 2NDE7")).toBe("2NDE7");
    expect(groupOf("Soutien")).toBeNull();
  });
});

describe("teachingOrder", () => {
  it("goes chapter by chapter, whatever order the steps come in", () => {
    const sequences = [
      { id: 7, course_id: 1, title: "Statistiques", position: 1, created_at: "" },
      { id: 3, course_id: 1, title: "Fonctions", position: 0, created_at: "" },
    ];
    const step = (id: number, sequence_id: number, position: number) =>
      ({ id, sequence_id, title: "", position, resources: [] }) as SequenceItem;
    const items = [step(10, 7, 0), step(1, 3, 0), step(11, 7, 1), step(2, 3, 1)];
    expect(teachingOrder(sequences, items).map((i) => i.id)).toEqual([1, 2, 10, 11]);
    expect(stepAfter(teachingOrder(sequences, items), 2)?.id).toBe(10);
  });
});
