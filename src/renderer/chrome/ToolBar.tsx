import React from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../state/ui.store'
import {
  FloppyPlus, FolderOpen, Code, Save, Format, Eject,
  Play, Terminal, Disc, Settings, Question,
} from '../components/icons'

interface Props {
  hasDisk?: boolean
}

export const ToolBar: React.FC<Props> = ({ hasDisk = false }) => {
  const { t } = useTranslation()
  const openDialog = useUIStore((s) => s.openDialog)

  const btn = (
    title: string,
    Icon: React.FC<{ size?: number }>,
    onClick?: () => void,
    disabled = false,
  ) => (
    <button
      className={`im-tool-btn${disabled ? ' is-disabled' : ''}`}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={18} />
    </button>
  )

  return (
    <div className="im-toolbar">
      <div className="im-toolbar-group">
        {btn(t('miNewDisk'),     FloppyPlus, () => openDialog('newDisk'))}
        {btn(t('miOpenDisk'),    FolderOpen, () => openDialog('fileBrowser'))}
        {btn(t('miOpenProgram'), Code)}
      </div>
      <div className="im-toolbar-divider" />
      <div className="im-toolbar-group">
        {btn(t('miWriteToDisk'), Save,   () => openDialog('writeFile'), !hasDisk)}
        {btn(t('miFormatDisk'),  Format, () => openDialog('format'),    !hasDisk)}
        {btn(t('miEjectDisk'),   Eject,  () => openDialog('delete'),    !hasDisk)}
      </div>
      <div className="im-toolbar-divider" />
      <div className="im-toolbar-group">
        {btn(t('miOpenInVice'), Play,     undefined)}
        {btn(t('miBlankVice'),  Terminal, undefined)}
      </div>
      <div className="im-toolbar-divider" />
      <div className="im-toolbar-group">
        {btn(t('miCreateIso'), Disc, () => openDialog('iso'))}
      </div>
      <div className="im-grow" />
      <div className="im-toolbar-group">
        {btn(t('miPreferences'), Settings, () => openDialog('settings'))}
        {btn(t('menuHelp'),      Question, () => openDialog('about'))}
      </div>
    </div>
  )
}
