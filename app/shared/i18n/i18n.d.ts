/**
 * i18next returns `string | null` by default for a missing key, which would
 * make every call site handle a null that this app never wants. Key checking
 * is not done here — see keys.ts, which derives it from the English
 * catalogue and is what t() is typed against.
 */
import 'i18next'

declare module 'i18next' {
  interface CustomTypeOptions {
    returnNull: false
  }
}
