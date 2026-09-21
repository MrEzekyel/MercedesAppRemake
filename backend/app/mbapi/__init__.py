"""Strato di protocollo Mercedes, importato da mbapi2020 (MIT License).

Vedi vendor.sh per la provenienza e come aggiornarlo. I file qui dentro sono
copie quasi letterali dell'upstream: le modifiche vanno fatte a monte o nel
codice dell'applicazione, non qui, altrimenti il prossimo aggiornamento le
cancella.
"""

from ..ha_compat import install

# Deve precedere qualunque import dei moduli sottostanti: loro importano
# homeassistant.* al caricamento.
install()
