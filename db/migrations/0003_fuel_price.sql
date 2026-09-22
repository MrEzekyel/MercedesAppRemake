-- Prezzo del carburante usato per monetizzare i viaggi.
--
-- Il costo di un viaggio e' litri consumati x prezzo al litro. I litri li
-- sa l'auto, il prezzo no: sta qui, sul veicolo e non sullo stato, perche'
-- e' un'impostazione dell'utente e non un dato che arriva dalla vettura.
--
-- Resta NULL finche' non viene impostato: in quel caso l'app ricava il
-- prezzo medio dai rifornimenti gia' confermati, e mostra il costo come
-- stima. Un valore esplicito qui ha sempre la precedenza.
ALTER TABLE vehicle
    ADD COLUMN IF NOT EXISTS fuel_price_eur_per_l numeric(6,3);
