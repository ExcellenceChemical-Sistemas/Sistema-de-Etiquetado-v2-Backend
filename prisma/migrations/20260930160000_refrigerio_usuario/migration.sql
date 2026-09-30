-- Refrigerio por usuario (minutos desde medianoche), escalonado por persona. Solo aditivo:
-- columnas nuevas que aceptan nulos. Un admin lo carga después desde el panel de usuarios
-- (PATCH /usuarios/:id/refrigerio) — esta migración no asume valores por defecto.
ALTER TABLE "Usuario" ADD COLUMN "refrigerioInicioMinutos" INTEGER,
                       ADD COLUMN "refrigerioFinMinutos" INTEGER;
