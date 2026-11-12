const CTRL_C = String.fromCharCode(3);
const CTRL_D = String.fromCharCode(4);
const BACKSPACE = String.fromCharCode(127);

export interface LineEdit {
  readonly value: string;
  /** Enter, or end of input: the line is complete. */
  readonly done: boolean;
  /** Ctrl+C: the person gave up. */
  readonly cancelled: boolean;
}

/** Applies what the terminal sent (one or several keystrokes) to the line typed so far. Pure, so the key handling is unit tested. */
export function editLine(typed: string, input: string): LineEdit {
  let value = typed;
  for (const char of input) {
    if (char === CTRL_C) return { value: "", done: false, cancelled: true };
    if (char === "\r" || char === "\n" || char === CTRL_D) return { value, done: true, cancelled: false };
    if (char === BACKSPACE || char === "\b") value = value.slice(0, -1);
    else value += char;
  }
  return { value, done: false, cancelled: false };
}

/** The first line of a piped stdin, for scripts that run without a terminal. */
async function readFirstLine(stream: NodeJS.ReadableStream): Promise<string> {
  let text = "";
  for await (const chunk of stream) text += String(chunk);
  return text.split(/\r?\n/)[0] ?? "";
}

/**
 * One line from the terminal, not echoed, so a password never appears on screen or in a shell history. When standard
 * input is not a terminal (a pipe or a file) it returns the first line instead, without a prompt, which is how a script
 * or a test supplies one. In a terminal, type each line and press Enter; pasting two lines at once is not supported.
 */
export async function readHiddenLine(prompt: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) return readFirstLine(stdin);

  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.resume();
  return new Promise<string>((resolve, reject) => {
    let typed = "";
    const finish = (): void => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    const onData = (chunk: string): void => {
      const edit = editLine(typed, chunk);
      typed = edit.value;
      if (edit.cancelled) {
        finish();
        reject(new Error("Cancelled."));
      } else if (edit.done) {
        finish();
        resolve(typed);
      }
    };
    stdin.on("data", onData);
  });
}
