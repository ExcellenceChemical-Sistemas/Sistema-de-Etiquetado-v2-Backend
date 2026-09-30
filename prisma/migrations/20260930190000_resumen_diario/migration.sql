-- Resumen diario de alertas abiertas, para no depender solo de notificaciones puntuales.
-- Solo aditivo: un valor de enum nuevo.
ALTER TYPE "TipoNotificacion" ADD VALUE 'RESUMEN_DIARIO';
