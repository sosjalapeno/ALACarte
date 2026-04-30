import { useEffect, useState } from 'react'

import type { QualityPreference } from '../api/client'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { QualityPicker } from '../components/QualityPicker'
import { useAppSettings } from './useAppSettings'

type PendingPrompt = {
  resolve: (value: QualityPreference | false) => void
}

export function useDownloadQualityPrompt() {
  const settings = useAppSettings()
  const [selected, setSelected] = useState<QualityPreference>('flac')
  const [pending, setPending] = useState<PendingPrompt | null>(null)

  useEffect(() => {
    if (settings?.quality) setSelected(settings.quality)
  }, [settings?.quality])

  const chooseDownloadQuality = async (): Promise<QualityPreference | undefined | false> => {
    if (!settings?.promptForDownloadQuality) return undefined
    setSelected(settings.quality)
    return new Promise((resolve) => {
      setPending({ resolve })
    })
  }

  const close = () => {
    pending?.resolve(false)
    setPending(null)
  }

  const confirm = () => {
    pending?.resolve(selected)
    setPending(null)
  }

  const qualityPrompt = (
    <Modal
      open={pending !== null}
      onClose={close}
      placement="center"
      label="Choose download quality"
      className="!max-w-[30rem]"
    >
      <div className="p-6">
        <div>
          <div className="text-xs uppercase tracking-wider text-white/55">Download quality</div>
          <h2 className="mt-1 text-lg font-semibold text-white">Choose quality</h2>
          <p className="mt-2 text-sm text-white/60">
            This applies only to the download you are starting now.
          </p>
        </div>
        <QualityPicker value={selected} onChange={setSelected} className="mt-5" />
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={close} variant="ghost">
            Cancel
          </Button>
          <Button onClick={confirm}>
            Queue download
          </Button>
        </div>
      </div>
    </Modal>
  )

  return { chooseDownloadQuality, qualityPrompt }
}
