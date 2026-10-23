-- Versiona edições da agenda. A serialização de horários é feita no serviço
-- com advisory transaction locks, evitando falha de migration por conflitos
-- históricos já existentes.
ALTER TABLE "agenda_pets"
ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
