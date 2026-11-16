/** Where "back" leads when there is no in-app history (link opened directly, app just started). */
export function parentPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'character' && parts.length > 2) return `/character/${parts[1]}${parts[2] === 'v' ? '/history' : ''}`
  if (parts[0] === 'diary' && parts.length > 1) return parts[1] === 'lore' ? '/diary?tab=lore' : '/diary'
  return '/'
}
