export function AppFooter({ className = "" }) {
  return (
    <footer className={`text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2 ${className}`} data-testid="app-footer">
      <span>© {new Date().getFullYear()} Maiharta Finance</span>
      <span>
        Design dan develop by{" "}
        <a
          href="https://www.maiharta.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[#0f52ba] hover:underline underline-offset-4"
          data-testid="footer-maiharta-link"
        >
          MaiHarta
        </a>
      </span>
    </footer>
  );
}
