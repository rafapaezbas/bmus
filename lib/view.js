const { style } = require('bare-tui')
const pkg = require('../package.json')
const { formatDuration } = require('./utils.js')

const BOTTOM_PADDING = 10

const PANEL = {
  FILEPICKER: 0,
  PREVIEW: 1,
  PLAYLIST: 2,
  TEXT_INPUT: 3
}

const PANEL_COUNT = 4

const COLORS = {
  accent: '#00D7FF',
  border: '#44475A',
  muted: '#6272A4',
  pink: '#FF79C6'
}

function render(app) {
  const parts = [
    renderHeader(app),
    renderBody(app),
    renderTextInput(app),
    app.updateWidget ? app.updateWidget.view() : '',
    renderFooter(app)
  ].filter(Boolean)
  return style.joinVertical(style.position.left, ...parts)
}

function layout(app) {
  const column = app.width / 6
  return {
    panelHeight: app.height - BOTTOM_PADDING - 1,
    filepickerWidth: column,
    previewWidth: column * 2 - 8,
    playlistWidth: column * 3
  }
}

function panelBox(app, panel, label, content, width, height) {
  const box = style()
    .border(style.borders.rounded)
    .borderForeground(panelBorderColor(app, panel))
    .padding(0, 1)
    .width(width)
    .height(height)
    .render(content)

  return style.joinVertical(style.position.left, sectionLabel(app, label, panel), box)
}

function panelBorderColor(app, panel) {
  return app.selectedPanel === panel ? COLORS.accent : COLORS.border
}

function sectionLabel(app, text, panel) {
  return style()
    .foreground(panelBorderColor(app, panel))
    .bold(true)
    .render(' ' + text)
}

function countLabel(text, count) {
  return count ? `${text} (${count})` : text
}

function renderHeader(app) {
  const logo = style().foreground(COLORS.pink).bold(true).render('♫ bmus')
  const version = style()
    .foreground(COLORS.border)
    .render('v' + pkg.version)

  return style()
    .border(style.borders.rounded)
    .borderForeground(COLORS.border)
    .width(app.width - 2)
    .render(
      style.joinHorizontal(
        style.position.top,
        logo,
        '  ',
        version,
        '   ',
        renderHeaderNowPlaying(app)
      )
    )
}

function renderHeaderNowPlaying(app) {
  const current = app.player.current
  if (current) {
    return (
      style().foreground(COLORS.muted).render('playing: ') +
      style().foreground(COLORS.accent).render(current.name)
    )
  }

  return style()
    .foreground(COLORS.border)
    .render('─'.repeat(Math.max(0, app.width - 24)))
}

function renderBody(app) {
  const menu = app.textInput.input.menuView()
  const menuLines = menu ? menu.split('\n').length : 0

  return style()
    .height(app.height - BOTTOM_PADDING + 2 - menuLines)
    .render(
      style.joinHorizontal(
        style.position.top,
        ' ',
        renderFilepicker(app),
        renderPreview(app),
        renderPlaylist(app)
      )
    )
}

function renderFilepicker(app) {
  const { panelHeight, filepickerWidth } = layout(app)

  return panelBox(app, PANEL.FILEPICKER, 'Library', app.fp.view(), filepickerWidth, panelHeight)
}

function renderPreview(app) {
  const { panelHeight, previewWidth } = layout(app)

  const content = app.preview.list.items.length
    ? app.preview.view(app.width / 2, panelHeight)
    : style().foreground(COLORS.muted).italic(true).render('No audio files here')

  const label = countLabel('Track', app.preview.items.length)
  return panelBox(app, PANEL.PREVIEW, label, content, previewWidth, panelHeight)
}

function renderPlaylist(app) {
  const { panelHeight, playlistWidth } = layout(app)

  const content = app.playlist.view(playlistWidth - 6, panelHeight)
  const label = countLabel('Queue', app.playlist.list.items.length)
  return panelBox(app, PANEL.PLAYLIST, label, content, playlistWidth - 5, panelHeight)
}

function renderTextInput(app) {
  return style()
    .border(style.borders.rounded)
    .borderForeground(panelBorderColor(app, PANEL.TEXT_INPUT))
    .width(app.width - 2)
    .render(app.textInput.view())
}

function renderFooter(app) {
  const keys = style()
    .foreground(COLORS.muted)
    .render('  ' + footerHint(app))

  const current = app.player.current
  const nowPlaying = current
    ? style()
        .foreground(COLORS.pink)
        .bold(true)
        .render('♪ ' + `${current.metadata.common.artist} - ${current.metadata.common.title}`)
    : style().foreground(COLORS.border).render('nothing playing')

  return style.joinHorizontal(
    style.position.top,
    keys,
    '   ',
    nowPlaying,
    ' - ',
    current ? formatDuration(app.secs) : '',
    ' ',
    app.player.random ? 'Random' : '',
    ' ',
    global.debug
  )
}

function footerHint(app) {
  switch (app.selectedPanel) {
    case PANEL.FILEPICKER:
      return '↑/↓ move · ↵/→ open · ⌫/← up · tab switch'
    case PANEL.PREVIEW:
      return '↑/↓ move · a add to playlist · tab switch'
    case PANEL.PLAYLIST:
      return '↑/↓ move · ↵ play · q remove · n next · tab switch · r random · ctrl+c quit'
    default:
      return 'tab switch'
  }
}

module.exports = { render, layout, PANEL, PANEL_COUNT }
