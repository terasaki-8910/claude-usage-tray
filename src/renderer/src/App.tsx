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
  const [pinging, setPinging] = useState(false)
  const [pingMessage, setPingMessage] = useState<string | null>(null)

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

  const handlePingNow = async (): Promise<void> => {
    setPinging(true)
    setPingMessage(null)
    try {
      const result = await window.api.runPingNow()
      setPingMessage(result.message)
    } catch (e) {
      setPingMessage((e as Error).message)
    } finally {
      setPinging(false)
    }
  }

  if (error) {
    return <div class="card loading">エラー: {error}</div>
  }

  if (!state) {
    return <div class="card loading">読み込み中…</div>
  }

  const { pingStats } = state

  return (
    <div class="card">
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
        <label class="ping-toggle">
          <input
            type="checkbox"
            checked={state.pingEnabled}
            onChange={(e) => {
              void window.api.setPingEnabled((e.target as HTMLInputElement).checked)
            }}
          />
          自動ping
          <span class="ping-state">{state.pingEnabled ? '有効' : '無効'}</span>
        </label>

        <p class="ping-explain">
          使用量の枠が切れたら、Haikuに最小の1往復(約$0.001)を自動送信して新しい枠を開始します。
          放置すると次に使った時点から枠が始まるため、リセット時刻が後ろへずれていくのを防ぐ機能です。
        </p>

        <div class="ping-row">
          <span class="ping-stats">
            直近7日: {pingStats.count7d}回 / ${pingStats.spend7dUsd.toFixed(4)}
          </span>
          <button class="text-button" onClick={handlePingNow} disabled={pinging}>
            {pinging ? '送信中…' : '今すぐ1回送る'}
          </button>
        </div>

        {pingMessage && <div class="ping-message">{pingMessage}</div>}
        {state.lastPingSummary && <div class="ping-stats">最終: {state.lastPingSummary}</div>}

        {state.fetchedAtMs && (
          <div class="fetched-at">最終取得: {new Date(state.fetchedAtMs).toLocaleTimeString()}</div>
        )}
      </footer>
    </div>
  )
}
