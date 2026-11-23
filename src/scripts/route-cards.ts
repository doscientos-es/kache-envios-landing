/** Cards are replaced during revalidation, so interactions are delegated. */
document.addEventListener('click', (cardClick) => {
  const target = cardClick.target
  if (!(target instanceof Element)) return

  const button = target.closest<HTMLButtonElement>('[data-route-details-open]')
  const card = button?.closest<HTMLElement>('[data-route-card]')
  if (!button || !card) return

  const template = card.querySelector<HTMLTemplateElement>('template[data-route-details]')
  const dialog = template?.content.firstElementChild?.cloneNode(true) as
    | HTMLDialogElement
    | undefined
  if (!dialog) return
  document.body.append(dialog)
  let closeTimer: number | undefined
  const finishClose = () => {
    window.clearTimeout(closeTimer)
    dialog.removeEventListener('animationend', onAnimationEnd)
    if (dialog.open) dialog.close()
  }
  const onAnimationEnd = (event: AnimationEvent) => {
    if (event.target === dialog && event.animationName === 'route-dialog-out') finishClose()
  }
  const closeDialog = () => {
    if (!dialog.open || dialog.dataset.closing) return
    if (!window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dialog.close()
      return
    }
    dialog.dataset.closing = 'true'
    dialog.addEventListener('animationend', onAnimationEnd)
    closeTimer = window.setTimeout(finishClose, 300)
  }
  const isBackdrop = (event: PointerEvent | MouseEvent) => {
    if (event.target !== dialog) return false
    const rect = dialog.getBoundingClientRect()
    return (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
  }
  let pressedBackdrop = false
  dialog.addEventListener('pointerdown', (event) => {
    pressedBackdrop = event.button === 0 && isBackdrop(event)
  })
  dialog.addEventListener('click', (event) => {
    const eventTarget = event.target
    if (
      (eventTarget instanceof Element && eventTarget.closest('[data-route-dialog-close]')) ||
      (pressedBackdrop && isBackdrop(event))
    )
      closeDialog()
    pressedBackdrop = false
  })
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    closeDialog()
  })
  dialog.addEventListener(
    'close',
    () => {
      window.clearTimeout(closeTimer)
      dialog.removeEventListener('animationend', onAnimationEnd)
      dialog.remove()
      if (button.isConnected) button.focus()
    },
    { once: true },
  )
  dialog.showModal()
})
