type OAuthProvider = "google" | "github";

type Props = {
  provider: OAuthProvider;
  onClick: () => void;
};

export default function OAuthButton({ provider, onClick }: Props) {
  const isGoogle = provider === "google";

  const styles = isGoogle
    ? "bg-white text-black hover:opacity-90"
    : "bg-slate-800 border border-slate-600 text-white hover:bg-slate-700";

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-center gap-3 py-2 rounded-lg font-medium transition ${styles}`}
    >
      {isGoogle ? <GoogleIcon /> : <GithubIcon />}

      Continue with {isGoogle ? "Google" : "GitHub"}
    </button>
  );
}

/* ================= ICONS ================= */

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.7 1.22 9.19 3.61l6.85-6.85C35.9 2.24 30.35 0 24 0 14.64 0 6.52 5.4 2.58 13.28l7.98 6.2C12.45 13.08 17.7 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.5 24.5c0-1.64-.15-3.22-.42-4.75H24v9h12.7c-.55 2.98-2.23 5.5-4.75 7.19l7.39 5.74C43.91 37.41 46.5 31.44 46.5 24.5z"/>
      <path fill="#FBBC05" d="M10.56 28.48c-.5-1.48-.78-3.05-.78-4.68s.28-3.2.78-4.68l-7.98-6.2C.92 16.94 0 20.36 0 24c0 3.64.92 7.06 2.58 10.08l7.98-6.2z"/>
      <path fill="#34A853" d="M24 48c6.35 0 11.9-2.09 15.87-5.68l-7.39-5.74c-2.05 1.38-4.67 2.2-8.48 2.2-6.3 0-11.55-3.58-13.44-8.68l-7.98 6.2C6.52 42.6 14.64 48 24 48z"/>
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38 
      0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
      -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
      .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 
      0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 
      .67-.21 2.2.82a7.66 7.66 0 012-.27c.68 0 1.36.09 2 .27
      1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 
      2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 
      3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 
      2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 
      8c0-4.42-3.58-8-8-8z"/>
    </svg>
  );
}
