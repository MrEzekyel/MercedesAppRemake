-- Prezzi carburante dagli open data MIMIT (Osservaprezzi Carburanti).
--
-- Due CSV pubblici, aggiornati ogni giorno lavorativo intorno alle 7-8:
--   anagrafica_impianti_attivi.csv  -> impianto, indirizzo, coordinate
--   prezzo_alle_8.csv               -> idImpianto, carburante, prezzo, self/servito
-- Uniti da idImpianto. Qui teniamo solo lo snapshot corrente (un prezzo per
-- impianto+carburante+modalita'), non lo storico: basta per "prezzo medio
-- nella zona" e "distributore piu' vicino"; uno storico per il confronto
-- settimana su settimana e' un'estensione successiva, non serve ora.
CREATE TABLE fuel_station (
    id          integer PRIMARY KEY,  -- idImpianto MIMIT
    brand       text,
    name        text,
    address     text,
    comune      text,
    provincia   text,
    position    geography(Point, 4326) NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Indice spaziale: le query sono sempre "impianti entro N km da qui".
CREATE INDEX fuel_station_position_idx ON fuel_station USING gist (position);

CREATE TABLE fuel_price (
    station_id   integer NOT NULL REFERENCES fuel_station(id) ON DELETE CASCADE,
    -- Come arriva da MIMIT: "Benzina", "Gasolio", "GPL", "Metano", ...
    fuel_type    text NOT NULL,
    is_self      boolean NOT NULL,
    price        numeric(5,3) NOT NULL,
    -- Data/ora della comunicazione del gestore (dtComu), non della nostra
    -- sincronizzazione: e' quanto e' "fresco" il prezzo, non quanto e'
    -- fresca la nostra copia.
    communicated_at timestamptz,
    PRIMARY KEY (station_id, fuel_type, is_self)
);
