/**
 * Header bar — package title, npm install snippet, replay button.
 *
 * @module Header
 */

import { useCallback, useState } from "react";

import { COPY_FEEDBACK_MS } from "../lib/utils";

const INSTALL_CMD = "npm i graphql-query-depth-limit-esm";
const REPO_URL = "https://github.com/lafittemehdy/graphql-query-depth-limit-esm";

interface HeaderProps {
  onReplay?: () => void;
}

/** Compact header with title, install snippet, and replay trigger. */
export function Header({ onReplay }: HeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(INSTALL_CMD).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
      },
      () => {
        /* clipboard unavailable — fail silently in non-secure contexts */
      },
    );
  }, []);

  return (
    <header className="header">
      <div className="header-left">
        <a className="header-title" href={REPO_URL} rel="noopener noreferrer" target="_blank">
          GraphQL Depth Limit
        </a>

        <span className="header-install">
          <span>{INSTALL_CMD}</span>
          <button
            aria-label={copied ? "Copied!" : "Copy install command"}
            className="header-install-copy"
            onClick={handleCopy}
            type="button"
          >
            {copied ? (
              <svg
                aria-hidden="true"
                fill="none"
                height="14"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="14"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg
                aria-hidden="true"
                fill="none"
                height="14"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="14"
              >
                <rect height="13" rx="2" ry="2" width="13" x="9" y="9" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </span>
      </div>

      <div className="header-right">
        {onReplay && (
          <button
            aria-label="Replay intro animation"
            className="header-action-btn"
            onClick={onReplay}
            type="button"
          >
            <svg aria-hidden="true" fill="currentColor" height="10" viewBox="0 0 24 24" width="10">
              <polygon points="5,3 19,12 5,21" />
            </svg>
            play
          </button>
        )}
      </div>
    </header>
  );
}
