import { useEffect, useRef, useState } from "react";
import { errorCode } from "./i18n";
export function useTask<T = any>() {
  const worker = useRef<Worker | null>(null);
  const sequence = useRef(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<T | null>(null);
  const [error, setError] = useState("");
  const stop = () => {
    sequence.current++;
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
  };
  const clear = () => {
    stop();
    setError("");
    setResult(null);
    setProgress(0);
  };
  const cancel = () => {
    stop();
    setError("CANCELLED");
    setResult(null);
  };
  const run = (operation: string, payload: unknown) => {
    clear();
    setBusy(true);
    const id = sequence.current;
    try {
      const active = new Worker(
        new URL("./workers/task.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = active;
      active.onmessage = ({ data }) => {
        if (data.id !== sequence.current) return;
        if (data.progress !== undefined) setProgress(data.progress);
        else {
          if (data.error) setError(errorCode(new Error(data.error)));
          else {
            setResult(data.result);
            setProgress(100);
          }
          active.terminate();
          worker.current = null;
          setBusy(false);
        }
      };
      active.onerror = () => {
        if (id !== sequence.current) return;
        setError("UNKNOWN");
        active.terminate();
        worker.current = null;
        setBusy(false);
      };
      active.postMessage({ id, operation, payload });
    } catch {
      stop();
      setError("UNKNOWN");
    }
  };
  useEffect(
    () => () => {
      sequence.current++;
      worker.current?.terminate();
    },
    [],
  );
  return { busy, progress, result, error, setError, run, cancel, clear };
}
