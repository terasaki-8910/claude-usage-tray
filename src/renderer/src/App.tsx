import { useEffect, useLayoutEffect, useState } from 'preact/hooks'
import type { BucketDto, PopupState } from '../../core/types'
import type { PreloadApi } from '../../preload/index'

declare global {
  interface Window {
    api: PreloadApi
  }
}

function formatResetsAt(iso: string | null): string {
  if (!iso) return '不明'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '不明'
  return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function Row({ bucket }: { bucket: BucketDto }): preact.JSX.Element {
  return (
    <div class="row">
      <div class="row-top">
        <span class="row-label">{bucket.label}</span>
        <span class={`row-percent sev-${bucket.severity}`}>{bucket.percent}%</span>
      </div>
      <div class="row-reset">{formatResetsAt(bucket.resetsAtIso)} にリセット</div>
    </div>
  )
}

function RefreshIcon({ spinning }: { spinning: boolean }): preact.JSX.Element {
  return (
    <svg
      class={spinning ? 'spin' : ''}
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M13.65 2.35A7.958 7.958 0 0 0 8 0C3.58 0 0 3.58 0 8h2c0-3.31 2.69-6 6-6 1.66 0 3.14.68 4.22 1.78L9 7h7V0l-2.35 2.35Z"
        fill="currentColor"
      />
      <path
        d="M14 8c0 3.31-2.69 6-6 6-1.66 0-3.14-.68-4.22-1.78L7 9H0v7l2.35-2.35A7.958 7.958 0 0 0 8 16c4.42 0 8-3.58 8-8h-2Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function App(): preact.JSX.Element {
  const [state, setState] = useState<PopupState | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!window.api) {
      // The preload script failed to load — without this the popup would
      // just sit on "読み込み中…" forever with no explanation.
      setError('preloadが読み込まれていません')
      return undefined
    }
    // Pull once on mount rather than relying only on the main process's
    // push: the push can land before this listener is registered.
    window.api
      .getState()
      .then(setState)
      .catch((e: Error) => setError(e.message))
    return window.api.onState(setState)
  }, [])

  // Report the real rendered height so the main process can size the
  // window to it — content height changes with the stale banner and the
  // last-ping line, and a fixed window height clipped the footer.
  useLayoutEffect(() => {
    if (!window.api) return
    const height = document.body.getBoundingClientRect().height
    if (height > 0) window.api.reportHeight(height)
  })

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      setState(await window.api.requestRefresh())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRefreshing(false)
    }
  }

  if (error) {
    return <div class="loading">エラー: {error}</div>
  }

  if (!state) {
    return <div class="loading">読み込み中…</div>
  }

  return (
    <div class="popup">
      <header>
        <span class="title">Claude使用量</span>
        <button
          class="icon-button"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="今すぐ更新"
          title="今すぐ更新"
        >
          <RefreshIcon spinning={refreshing} />
        </button>
      </header>

      {state.stale && (
        <div class="stale-banner">データを取得できません。Claude Codeを一度実行してから開き直してください。</div>
      )}

      {state.session && <Row bucket={state.session} />}
      {state.weeklyAll && <Row bucket={state.weeklyAll} />}
      {state.weeklyFable && <Row bucket={state.weeklyFable} />}

      <footer>
        <label class="toggle-row">
          <input
            type="checkbox"
            checked={state.pingEnabled}
            onChange={(e) => {
              void window.api.setPingEnabled((e.target as HTMLInputElement).checked)
            }}
          />
          自動ping({state.pingEnabled ? '有効' : '無効'})
        </label>
        {state.lastPingSummary && <div class="last-ping">最終ping: {state.lastPingSummary}</div>}
        {state.fetchedAtMs && (
          <div class="fetched-at">最終取得: {new Date(state.fetchedAtMs).toLocaleTimeString()}</div>
        )}
      </footer>
    </div>
  )
}
