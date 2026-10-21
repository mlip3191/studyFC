export default function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string
  onDismiss?: () => void
}) {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      <span>{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="font-medium underline">
          Dismiss
        </button>
      )}
    </div>
  )
}
