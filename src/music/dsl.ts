import type { ArrangementDocument } from "./arrangementCompiler";

type TimeValue = string | number;
type PitchValue = string | number;
type ArrangementPart = ArrangementDocument["parts"][number];
type ArrangementMotif = NonNullable<ArrangementDocument["motifs"]>[string];
type ArrangementGroove = NonNullable<ArrangementDocument["grooves"]>[string];
type Section = ArrangementDocument["sections"][number];
type HarmonyPoint = ArrangementDocument["harmony"][number];
type MotifNote = ArrangementMotif["notes"][number];
type ArrangementNote = NonNullable<ArrangementPart["notes"]>[number];
type PartRole = ArrangementPart["role"];
type PartMix = NonNullable<ArrangementPart["mix"]>;
type PartPerformance = NonNullable<ArrangementPart["performance"]>;
type PartSound = NonNullable<ArrangementPart["sound"]>;
type PartVoicing = NonNullable<ArrangementPart["voicing"]>;
type Automation = NonNullable<PartMix["automation"]>;
type AutomationLane = keyof Automation;
type AutomationPoint = NonNullable<Automation[AutomationLane]>[number];
type AutomationPointInput = AutomationPoint | readonly [time: TimeValue, value: number];
type NoteOptions = Omit<ArrangementNote, "time" | "duration" | "pitch" | "pitches">;
type HitOptions = NoteOptions & { duration?: TimeValue };
type PhraseStep = readonly [beatOffset: number, duration: TimeValue, pitch: PitchValue | readonly PitchValue[], options?: NoteOptions];

type PartInput = ArrangementPart | PartBuilder;
type MotifInput = ArrangementMotif | MotifBuilder;

export type ArrangementInput = Omit<ArrangementDocument, "parts" | "motifs"> & {
  motifs?: Record<string, MotifInput>;
  parts: PartInput[];
};

export function defineArrangement(input: ArrangementInput): ArrangementDocument {
  return {
    ...input,
    motifs: input.motifs ? mapValues(input.motifs, asMotif) : undefined,
    parts: input.parts.map(asPart)
  };
}

export function section(
  id: string,
  name: string,
  start: TimeValue,
  duration: TimeValue,
  scene: Section["scene"] = "nebula",
  intensity?: number
): Section {
  return prune({ id, name, start, duration, scene, intensity });
}

export function chords(points: Array<[time: TimeValue, duration: TimeValue, chord: string]>): HarmonyPoint[] {
  return points.map(([time, duration, chord]) => ({ time, duration, chord }));
}

export function chord(time: TimeValue, duration: TimeValue, symbol: string): HarmonyPoint {
  return { time, duration, chord: symbol };
}

export function note(time: TimeValue, duration: TimeValue, pitch: PitchValue, options: NoteOptions = {}): ArrangementNote {
  return prune({ time, duration, pitch, ...options });
}

export function chordNote(
  time: TimeValue,
  duration: TimeValue,
  pitches: readonly PitchValue[],
  options: NoteOptions = {}
): ArrangementNote {
  return prune({ time, duration, pitches: [...pitches], ...options });
}

export function hit(time: TimeValue, pitch: PitchValue, options: HitOptions = {}): ArrangementNote {
  const { duration = "8n", ...rest } = options;
  return note(time, duration, pitch, rest);
}

export function phrase(start: TimeValue, steps: readonly PhraseStep[], beatsPerMeasure = 4): ArrangementNote[] {
  return steps.map(([beatOffset, duration, pitchOrPitches, options]) => {
    const time = addBeats(start, beatOffset, beatsPerMeasure);
    return isPitchList(pitchOrPitches)
      ? chordNote(time, duration, pitchOrPitches, options)
      : note(time, duration, pitchOrPitches, options);
  });
}

export function automationPoints(...points: readonly AutomationPointInput[]): AutomationPoint[] {
  return points.map((point): AutomationPoint => (isAutomationTuple(point) ? { time: point[0], value: point[1] } : point));
}

export function motif(notes: MotifNote[] = []): MotifBuilder {
  return new MotifBuilder({ notes });
}

export function degree(degree: number, duration: TimeValue = "8n", options: Omit<MotifNote, "degree" | "duration"> = {}): MotifNote {
  return { degree, duration, ...options };
}

export function groove(spec: ArrangementGroove): ArrangementGroove {
  return spec;
}

export function drums(id: string, name?: string): PartBuilder {
  return part(id, "drums", name).instrument("drum_kit");
}

export function bass(id: string, name?: string): PartBuilder {
  return part(id, "bass", name).instrument("upright_bass");
}

export function harmony(id: string, name?: string): PartBuilder {
  return part(id, "harmony", name).instrument("electric_piano");
}

export function lead(id: string, name?: string): PartBuilder {
  return part(id, "lead", name).instrument("analog_lead");
}

export function counterline(id: string, name?: string): PartBuilder {
  return part(id, "counterline", name).instrument("solo_cello");
}

export function pad(id: string, name?: string): PartBuilder {
  return part(id, "pad", name).instrument("glass_pad");
}

export function earCandy(id: string, name?: string): PartBuilder {
  return part(id, "ear_candy", name).instrument("glass_pad");
}

export function customPart(id: string, role: PartRole = "custom", name?: string): PartBuilder {
  return part(id, role, name);
}

export function part(id: string, role: PartRole, name?: string): PartBuilder {
  return new PartBuilder(prune({ id, role, name }));
}

export class MotifBuilder {
  constructor(private readonly value: ArrangementMotif) {}

  degree(degreeValue: number, duration: TimeValue = "8n", options: Omit<MotifNote, "degree" | "duration"> = {}) {
    return new MotifBuilder({
      notes: [...this.value.notes, degree(degreeValue, duration, options)]
    });
  }

  note(note: MotifNote) {
    return new MotifBuilder({ notes: [...this.value.notes, note] });
  }

  transpose(degrees: number) {
    return new MotifBuilder({
      notes: this.value.notes.map((note) => ({
        ...note,
        degree: note.degree + degrees
      }))
    });
  }

  invert(axis = 1) {
    return new MotifBuilder({
      notes: this.value.notes.map((note) => ({
        ...note,
        degree: axis * 2 - note.degree
      }))
    });
  }

  sequence(repetitions: number, stepOffset: number, degreeOffset = 0) {
    const count = Math.max(1, Math.floor(repetitions));
    return new MotifBuilder({
      notes: Array.from({ length: count }).flatMap((_, repetition) =>
        this.value.notes.map((note, index) => ({
          ...note,
          degree: note.degree + degreeOffset * repetition,
          step: (note.step ?? index) + stepOffset * repetition
        }))
      )
    });
  }

  repeat(repetitions: number, stepOffset: number, degreeOffset = 0) {
    return this.sequence(repetitions, stepOffset, degreeOffset);
  }

  thin(every = 2, offset = 0) {
    const stride = Math.max(1, Math.floor(every));
    return new MotifBuilder({
      notes: this.value.notes.filter((_, index) => (index - offset) % stride === 0)
    });
  }

  take(count: number) {
    return new MotifBuilder({ notes: this.value.notes.slice(0, Math.max(0, Math.floor(count))) });
  }

  build(): ArrangementMotif {
    return this.value;
  }
}

export class PartBuilder {
  constructor(private readonly value: ArrangementPart) {}

  instrument(instrument: ArrangementPart["instrument"]) {
    return this.patch({ instrument });
  }

  intent(intent: string) {
    return this.patch({ intent });
  }

  sections(ids: string[]) {
    return this.patch({ sections: ids });
  }

  sound(sound: NonNullable<ArrangementPart["sound"]>) {
    return this.patch({ sound });
  }

  soundfont(soundfont: string, envelope: Omit<PartSound, "source" | "samplePack" | "soundfont"> = {}) {
    return this.mergeSound({ soundfont, ...envelope });
  }

  samplePack(samplePack: string) {
    return this.mergeSound({ source: "sample_pack", samplePack });
  }

  envelope(envelope: Omit<PartSound, "source" | "samplePack" | "soundfont">) {
    return this.mergeSound(envelope);
  }

  kit(kit: NonNullable<ArrangementPart["kit"]>) {
    return this.patch({ kit });
  }

  pattern(pattern: NonNullable<ArrangementPart["pattern"]>) {
    return this.patch({ pattern });
  }

  groove(grooveValue: NonNullable<ArrangementPart["groove"]>) {
    return this.patch({ groove: grooveValue });
  }

  mix(mix: NonNullable<ArrangementPart["mix"]>) {
    return this.patch({ mix });
  }

  gain(gain: number) {
    return this.mergeMix({ gain });
  }

  pan(pan: number) {
    return this.mergeMix({ pan });
  }

  reverb(reverb: number) {
    return this.mergeMix({ reverb });
  }

  delay(delay: number, delayTime?: number, delayFeedback?: number) {
    return this.mergeMix(prune({ delay, delayTime, delayFeedback }));
  }

  filter(filter: Pick<PartMix, "highpass" | "lowpass">) {
    return this.mergeMix(filter);
  }

  eq(eq: NonNullable<PartMix["eq"]>) {
    return this.mergeMix({ eq });
  }

  compressor(compressor: NonNullable<PartMix["compressor"]>) {
    return this.mergeMix({ compressor });
  }

  saturate(saturation: number) {
    return this.mergeMix({ saturation });
  }

  duck(duck: string, duckAmount = 0.35) {
    return this.mergeMix({ duck, duckAmount });
  }

  automate(lane: AutomationLane, points: readonly AutomationPointInput[]) {
    return this.mergeAutomation({ [lane]: automationPoints(...points) } as Partial<Automation>);
  }

  performance(performance: NonNullable<ArrangementPart["performance"]>) {
    return this.patch({ performance });
  }

  humanize(humanize: number) {
    return this.mergePerformance({ humanize });
  }

  velocity(velocity: number) {
    return this.mergePerformance({ velocity });
  }

  velocityRamp(from: number, to: number) {
    return this.mergePerformance({ velocityRamp: [from, to] });
  }

  strum(strum: number) {
    return this.mergePerformance({ strum });
  }

  octave(octave: number) {
    return this.mergePerformance({ octave });
  }

  articulation(articulation: NonNullable<PartPerformance["articulation"]>) {
    return this.mergePerformance({ articulation });
  }

  voicing(voicing: NonNullable<ArrangementPart["voicing"]>) {
    return this.patch({ voicing });
  }

  range(low: string, high: string) {
    return this.mergeVoicing({ range: `${low}-${high}` });
  }

  voices(maxVoices: number) {
    return this.mergeVoicing({ maxVoices });
  }

  spread(enabled = true) {
    return this.mergeVoicing({ spread: enabled });
  }

  motif(id: string) {
    return this.patch({ motif: id });
  }

  motifPlacement(placement: NonNullable<ArrangementPart["motifPlacement"]>) {
    return this.patch({ motifPlacement: placement });
  }

  bassStyle(style: NonNullable<ArrangementPart["bassStyle"]>) {
    return this.patch({ bassStyle: style });
  }

  lockToKick(amount = 0.35, duck = "kick") {
    return this.duck(duck, amount);
  }

  approachNextChord() {
    return this.patch({ bassStyle: "walking" });
  }

  drop2() {
    return this.mergeVoicing({ inversion: 1, spread: true });
  }

  avoidLowThirds(low = "C3", high = "C6") {
    return this.mergeVoicing({ range: `${low}-${high}` });
  }

  fillIntoSections(enabled = true) {
    return this.patch({ fills: enabled });
  }

  fills(enabled = true) {
    return this.patch({ fills: enabled });
  }

  notes(notes: NonNullable<ArrangementPart["notes"]>) {
    return this.patch({ notes });
  }

  withNotes(notes: readonly ArrangementNote[]) {
    return this.patch({ notes: [...(this.value.notes ?? []), ...notes] });
  }

  note(time: TimeValue, duration: TimeValue, pitch: PitchValue, options: NoteOptions = {}) {
    return this.withNotes([note(time, duration, pitch, options)]);
  }

  chord(time: TimeValue, duration: TimeValue, pitches: readonly PitchValue[], options: NoteOptions = {}) {
    return this.withNotes([chordNote(time, duration, pitches, options)]);
  }

  hit(time: TimeValue, pitch: PitchValue, options: HitOptions = {}) {
    return this.withNotes([hit(time, pitch, options)]);
  }

  phrase(start: TimeValue, steps: readonly PhraseStep[], beatsPerMeasure = 4) {
    return this.withNotes(phrase(start, steps, beatsPerMeasure));
  }

  build(): ArrangementPart {
    return this.value;
  }

  private patch(patch: Partial<ArrangementPart>) {
    return new PartBuilder(prune({ ...this.value, ...patch }));
  }

  private mergeMix(patch: NonNullable<ArrangementPart["mix"]>) {
    return this.patch({ mix: prune({ ...(this.value.mix ?? {}), ...patch }) });
  }

  private mergeAutomation(patch: Partial<Automation>) {
    const mix = this.value.mix ?? {};
    return this.mergeMix({
      automation: prune({ ...(mix.automation ?? {}), ...patch })
    });
  }

  private mergePerformance(patch: Partial<PartPerformance>) {
    return this.patch({ performance: prune({ ...(this.value.performance ?? {}), ...patch }) });
  }

  private mergeSound(patch: Partial<PartSound>) {
    return this.patch({ sound: prune({ ...(this.value.sound ?? {}), ...patch }) });
  }

  private mergeVoicing(patch: NonNullable<ArrangementPart["voicing"]>) {
    return this.patch({ voicing: prune({ ...(this.value.voicing ?? {}), ...patch }) });
  }
}

function asPart(input: PartInput): ArrangementPart {
  return input instanceof PartBuilder ? input.build() : input;
}

function asMotif(input: MotifInput): ArrangementMotif {
  return input instanceof MotifBuilder ? input.build() : input;
}

function mapValues<T, U>(input: Record<string, T>, mapper: (value: T) => U): Record<string, U> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, mapper(value)]));
}

function addBeats(time: TimeValue, beatOffset: number, beatsPerMeasure: number): TimeValue {
  if (typeof time === "number") return time + beatOffset;
  if (!/^\d+:\d+(:\d+)?$/.test(time)) {
    throw new Error(`phrase start must be a musical position like "5:1", received "${time}"`);
  }
  return beatsToTime(toBeats(time, beatsPerMeasure) + beatOffset, beatsPerMeasure);
}

function toBeats(value: string, beatsPerMeasure: number): number {
  const [measureText, beatText, tickText] = value.split(":");
  return (Number(measureText) - 1) * beatsPerMeasure + (Number(beatText) - 1) + (tickText ? Number(tickText) / 960 : 0);
}

function beatsToTime(beat: number, beatsPerMeasure: number): string {
  const safeBeat = Math.max(0, beat);
  const measure = Math.floor(safeBeat / beatsPerMeasure) + 1;
  const inMeasure = safeBeat - (measure - 1) * beatsPerMeasure;
  const beatNumber = Math.floor(inMeasure) + 1;
  const tick = Math.round((inMeasure - Math.floor(inMeasure)) * 960);
  return tick > 0 ? `${measure}:${beatNumber}:${tick}` : `${measure}:${beatNumber}`;
}

function isPitchList(value: PitchValue | readonly PitchValue[]): value is readonly PitchValue[] {
  return Array.isArray(value);
}

function isAutomationTuple(value: AutomationPointInput): value is readonly [TimeValue, number] {
  return Array.isArray(value);
}

function prune<T>(value: T): T {
  if (Array.isArray(value)) return value.map(prune).filter((item) => item !== undefined) as T;
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const next = prune(item);
    if (next === undefined) continue;
    if (Array.isArray(next) && next.length === 0) continue;
    if (typeof next === "object" && next && !Array.isArray(next) && Object.keys(next).length === 0) continue;
    out[key] = next;
  }
  return out as T;
}
