/** Regex patterns that indicate bot probing or reconnaissance */
export const SUSPICIOUS_PATH_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  label: string;
}> = [
  { pattern: /\.env/i, label: ".env probe" },
  { pattern: /\.git/i, label: ".git probe" },
  { pattern: /wp-admin/i, label: "WordPress probe" },
  { pattern: /wp-login/i, label: "WordPress probe" },
  { pattern: /wp-includes/i, label: "WordPress probe" },
  { pattern: /phpinfo/i, label: "phpinfo probe" },
  { pattern: /\.php$/i, label: "PHP probe" },
  { pattern: /\/admin(?:\/|$)/i, label: "Admin panel probe" },
  { pattern: /\.sql/i, label: "SQL dump probe" },
  { pattern: /\.bak/i, label: "Backup file probe" },
  { pattern: /\.aws/i, label: "AWS credentials probe" },
  { pattern: /\.ssh/i, label: "SSH config probe" },
  { pattern: /\/actuator/i, label: "Spring Actuator probe" },
  { pattern: /\/debug/i, label: "Debug endpoint probe" },
  { pattern: /\/cgi-bin/i, label: "CGI probe" },
  { pattern: /web\.config/i, label: "IIS config probe" },
  { pattern: /\.htaccess/i, label: "Apache config probe" },
  { pattern: /\/xmlrpc/i, label: "XML-RPC probe" },
];

/** Auth endpoints to track for brute-force detection */
export const AUTH_PATHS = new Set(["/auth/login", "/auth/refresh"]);

/** Paths that should never trigger alerts */
export const SAFE_PATHS = new Set(["/_health", "/readiness"]);

// --- Thresholds ---

/** Minimum ms between alerts for the same IP + pattern combo */
export const DEFAULT_ALERT_COOLDOWN_MS = 300_000; // 5 min

/** Number of 404s from a single IP within the sliding window before alerting */
export const BURST_404_THRESHOLD = 10;

/** Number of auth failures from a single IP within the sliding window before alerting */
export const AUTH_FAIL_THRESHOLD = 8;

/** Sliding window size in ms for burst counters */
export const SLIDING_WINDOW_MS = 60_000; // 60s

/** How often to run in-memory cleanup of expired entries */
export const CLEANUP_INTERVAL_MS = 120_000; // 2 min

/** Global requests per minute threshold before alerting */
export const REQUEST_RATE_THRESHOLD = 500;

/** Lower-noise warning thresholds that should be logged before alerting */
export const REQUEST_RATE_LOG_THRESHOLDS = [250, 400] as const;
export const BURST_404_LOG_THRESHOLD = 5;
export const AUTH_FAIL_LOG_THRESHOLD = 4;
