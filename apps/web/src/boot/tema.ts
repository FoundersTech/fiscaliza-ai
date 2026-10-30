import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';

import { defineBoot } from '#q-app';
import { Dark } from 'quasar';

import { lerPreferencia, modoQuasar } from '@/services/tema';

/** Aplica o tema salvo antes de o app aparecer. */
export default defineBoot(() => {
  Dark.set(modoQuasar(lerPreferencia(globalThis.localStorage)));
});
