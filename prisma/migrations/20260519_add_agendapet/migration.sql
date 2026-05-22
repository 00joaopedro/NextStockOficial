-- Example migration SQL for adding AgendaPet table
-- Adjust types and schema according to your Postgres setup

CREATE TABLE IF NOT EXISTS agenda_pets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  cliente text NOT NULL,
  animal text NOT NULL,
  atendente text NOT NULL,
  servico text NOT NULL,
  data timestamptz NOT NULL,
  hora text NOT NULL,
  preco double precision NOT NULL,
  descricao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agendapet_tenant ON agenda_pets (tenant_id);
