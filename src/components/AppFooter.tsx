import { APP_VERSION, BUILD_TIME, formatBuildTime } from '../lib/app-version'

export default function AppFooter() {
  const built = formatBuildTime(BUILD_TIME)
  return (
    <footer className="app-footer" aria-label="Versão da aplicação">
      <span className="app-footer-version">
        <strong>V{APP_VERSION}</strong>
        {built ? <span className="app-footer-build"> · {built}</span> : null}
      </span>
      <span className="app-footer-note">Crypto Signal Desk</span>
    </footer>
  )
}
