import { APP_VERSION, BUILD_TIME, formatBuildTime } from '../lib/app-version'

export default function AppFooter() {
  const built = formatBuildTime(BUILD_TIME)
  return (
    <footer className="app-footer">
      <span>
        <strong>v{APP_VERSION}</strong>
        {built ? <> · build {built}</> : null}
      </span>
      <span className="app-footer-note">Incrementa <code>package.json</code> em cada deploy</span>
    </footer>
  )
}
