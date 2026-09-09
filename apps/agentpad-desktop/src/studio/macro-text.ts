export type MacroSlot = {
  index: number;
  editable: boolean;
  text?: string;
  rawHex?: string;
};

type MacroRange = {
  start: number;
  end: number;
  terminated: boolean;
};

function validateInput(bytes: number[], count: number): void {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Macro count must be a positive integer.");
  }
  if (bytes.length < count + 1) {
    throw new Error("The macro buffer is too small for its declared macro count.");
  }
  if (bytes.some((value) => !Number.isInteger(value) || value < 0 || value > 0xff)) {
    throw new Error("The macro buffer contains an invalid byte.");
  }
}

function rangesFor(bytes: number[], count: number): MacroRange[] {
  const guardOffset = bytes.length - 1;
  let cursor = 0;
  const ranges: MacroRange[] = [];

  for (let index = 0; index < count; index += 1) {
    const terminator = bytes.indexOf(0, cursor);
    if (terminator === -1 || terminator >= guardOffset) {
      ranges.push({ start: cursor, end: guardOffset, terminated: false });
      cursor = guardOffset;
      continue;
    }
    ranges.push({ start: cursor, end: terminator, terminated: true });
    cursor = terminator + 1;
  }

  return ranges;
}

function isPrintableAscii(bytes: number[]): boolean {
  return bytes.every((value) => value >= 0x20 && value <= 0x7e);
}

function toAscii(bytes: number[]): string {
  return String.fromCharCode(...bytes);
}

function rawHex(bytes: number[]): string {
  return bytes.map((value) => value.toString(16).padStart(2, "0").toUpperCase()).join("");
}

function encodePrintableAscii(value: string): number[] {
  const bytes: number[] = [];
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code === 0) {
      throw new Error("Macro text cannot contain a NUL byte.");
    }
    if (code < 0x20 || code > 0x7e) {
      throw new Error("Macro text must contain printable ASCII characters only.");
    }
    bytes.push(code);
  }
  return bytes;
}

export function parseMacroSlots(bytes: number[], count: number): MacroSlot[] {
  validateInput(bytes, count);
  return rangesFor(bytes, count).map((range, index) => {
    const contents = bytes.slice(range.start, range.end);
    if (range.terminated && isPrintableAscii(contents)) {
      return { index, editable: true, text: toAscii(contents) };
    }
    return { index, editable: false, rawHex: rawHex(contents) };
  });
}

export function replaceTextMacro(
  bytes: number[],
  slot: number,
  value: string,
  count: number,
): number[] {
  validateInput(bytes, count);
  if (!Number.isInteger(slot) || slot < 0 || slot >= count) {
    throw new Error(`Macro slot ${slot} is outside the declared macro count.`);
  }

  const ranges = rangesFor(bytes, count);
  if (ranges.some((range) => !range.terminated)) {
    throw new Error("The macro buffer is malformed and cannot be safely edited.");
  }

  const target = ranges[slot];
  const targetBytes = bytes.slice(target.start, target.end);
  if (!isPrintableAscii(targetBytes)) {
    throw new Error("This advanced macro is preserved read-only.");
  }

  const replacement = encodePrintableAscii(value);
  const guardOffset = bytes.length - 1;
  const nextBody = [
    ...bytes.slice(0, target.start),
    ...replacement,
    0,
    ...bytes.slice(target.end + 1, guardOffset),
  ];
  while (nextBody.length > guardOffset && nextBody.at(-1) === 0) {
    nextBody.pop();
  }
  if (nextBody.length > guardOffset) {
    throw new Error("The macro text does not fit in the firmware buffer.");
  }

  const next = Array.from({ length: bytes.length }, () => 0);
  next.splice(0, nextBody.length, ...nextBody);
  next[guardOffset] = 0;
  return next;
}
