import DOMPurify from 'dompurify'

// Foundry text enrichers that make no sense without a running Foundry server.
// TODO: refine against real item descriptions from fixtures/ (phase 2).

const ROLL_COMMANDS = new Set(['r', 'roll', 'gmr', 'gmroll', 'br', 'broll', 'blindroll', 'sr', 'selfroll', 'pr', 'publicroll'])

/**
 * Document links: @UUID[...]{Name}, @Compendium[...]{Name}, @Item[...]{Name},
 * &Reference[prone]{Name}. With a label -> the label; @UUID without a label
 * has no readable name offline -> removed; &Reference without a label -> the key.
 */
const LINK_RE = /([@&])(\w+)\[([^\]]*)\](?:\{([^}]*)\})?/g

/** Inline rolls: [[/r 1d6 # flavor]]{Label}, [[1d6+2]], [[/damage 2d6 fire]]. */
const INLINE_RE = /\[\[([\s\S]*?)\]\](?:\{([^}]*)\})?/g

export function cleanEnrichers(text: string): string {
  return text
    .replace(INLINE_RE, (_match, inner: string, label?: string) => {
      if (label !== undefined) return label
      const content = inner.trim()
      if (/^\/?lookup\b/i.test(content)) return '' // [[lookup @...]]: value only Foundry can resolve
      const cmd = /^\/(\w+)\s*([\s\S]*)$/.exec(content)
      if (!cmd) return content // plain inline roll: [[1d6]]
      const [, name, args] = cmd
      if (ROLL_COMMANDS.has(name.toLowerCase())) {
        return args.split('#')[0].trim() // drop "# flavor"
      }
      return args.trim() // other commands (/damage, /check, ...): keep arguments
    })
    .replace(LINK_RE, (_match, prefix: string, _type: string, target: string, label?: string) => {
      if (label !== undefined) return label
      return prefix === '&' ? target : ''
    })
}

/** Cleans enrichers and sanitizes HTML. The only way Foundry HTML may reach the page. */
export function toSafeHtml(html: string): string {
  return DOMPurify.sanitize(cleanEnrichers(html))
}
