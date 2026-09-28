/**
 * Posizione di scorrimento della tab Viaggi.
 *
 * Tornando da un approfondimento (Consumi, un viaggio...) la tab resta dove
 * l'avevi lasciata: e' montata sotto lo stack e non si tocca. Torna in cima
 * solo quando la si lascia per un'altra tab, perche' il video di
 * transizione disegna header e foto nella posizione di partenza.
 */
let toTop: (() => void) | null = null;

export const tripsScroll = {
  register(fn: () => void) {
    toTop = fn;
    return () => {
      if (toTop === fn) toTop = null;
    };
  },
  /** Da chiamare mentre il video copre lo schermo, non prima. */
  toTop() {
    toTop?.();
  },
};
