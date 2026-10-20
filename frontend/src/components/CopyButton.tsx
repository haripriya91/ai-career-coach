import { useState } from "react";

export default function CopyButton({ text }: { text: string }) {
  const [message, setMessage] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied");
    } catch {
      setMessage("Copy failed. Select and copy the text manually.");
    }
  }

  return (
    <div className="copy-control">
      <button
        type="button"
        className="secondary-button"
        onClick={() => void copy()}
      >
        Copy suggested wording
      </button>

      <span className="field-help" role="status">
        {message}
      </span>
    </div>
  );
}