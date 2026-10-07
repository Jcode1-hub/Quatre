export async function* readEventStream(response: Response): AsyncGenerator<string> {
  if (!response.body) throw new Error("The provider did not return a response stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
        if (data && data !== "[DONE]") yield data;
      }
      if (done) break;
    }
  } finally { reader.releaseLock(); }
}
