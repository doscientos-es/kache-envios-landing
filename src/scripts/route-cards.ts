/** Cards are replaced during revalidation, so interactions are delegated. */
document.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return

  const close = target.closest('[data-route-dialog-close]')
  if (close) {
    close.closest('dialog')?.close()
    return
  }

  const card = target.closest<HTMLElement>('[data-route-card]')
  if (!card) return
  const button = card.querySelector<HTMLButtonElement>('[data-route-details-open]')
  if (!button) return
  if (!target.closest('[data-route-details-open]')) {
    if (target.closest('a, button, summary, details, input, select, textarea, [data-route-map]'))
      return
    if (window.getSelection()?.toString()) return
  }

  const template = card.querySelector<HTMLTemplateElement>('template[data-route-details]')
  const dialog = template?.content.firstElementChild?.cloneNode(true) as
    | HTMLDialogElement
    | undefined
  if (!dialog) return
  button.focus()
  document.body.append(dialog)
  dialog.addEventListener(
    'close',
    () => {
      dialog.remove()
      if (button.isConnected) button.focus()
    },
    { once: true },
  )
  dialog.showModal()
})
